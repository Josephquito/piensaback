import { BadRequestException, Injectable } from '@nestjs/common';
import { KardexRefType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import {
  StreamingAccountsService,
  ACCOUNT_SELECT,
} from './streaming-accounts.service';
import { ReplaceCredentialsDto } from './dto/replace-credentials.dto';
import { ReplacePaidDto } from './dto/replace-paid.dto';
import { ReplaceFromInventoryDto } from './dto/replace-from-inventory.dto';

@Injectable()
export class StreamingAccountReplacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
  ) {}

  private daysRemainingByDate(cutoffDate: Date): number {
    const now = new Date();
    const cutoff = new Date(
      Date.UTC(
        cutoffDate.getUTCFullYear(),
        cutoffDate.getUTCMonth(),
        cutoffDate.getUTCDate(),
      ),
    );
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    return Math.max(
      0,
      Math.ceil((cutoff.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }

  // =========================
  // CASO 1 — Credenciales nuevas sin costo
  // =========================
  async replaceCredentials(
    id: number,
    dto: ReplaceCredentialsDto,
    companyId: number,
  ) {
    const account = await this.accounts.findAndAssert(id, companyId);
    const oldEmail = account.email;

    await this.prisma.streamingAccount.update({
      where: { id: account.id },
      data: {
        email: dto.email.trim(),
        password: dto.password,
        replacedByEmail: oldEmail,
        replacedAt: new Date(),
        replacementNote: dto.note ?? null,
      },
    });

    return this.prisma.streamingAccount.findUnique({
      where: { id: account.id },
      select: ACCOUNT_SELECT,
    });
  }

  // =========================
  // CASO 2 — Reemplazo con costo adicional
  // =========================
  async replacePaid(id: number, dto: ReplacePaidDto, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);

    const newPurchaseDate = this.accounts.parseDate(
      dto.purchaseDate,
      'purchaseDate',
    );
    const newCutoffDate = this.accounts.parseDate(dto.cutoffDate, 'cutoffDate');
    const newTotalCost = this.accounts.parseDecimal(dto.totalCost, 'totalCost');

    if (!Number.isInteger(dto.durationDays) || dto.durationDays <= 0)
      throw new BadRequestException('durationDays inválido.');

    const newDailyCost = this.accounts.calcDailyCost(
      newTotalCost,
      account.profilesTotal,
      dto.durationDays,
    );

    const costItem = await this.prisma.costItem.findUnique({
      where: {
        companyId_platformId: { companyId, platformId: account.platformId },
      },
      select: { stock: true },
    });
    const currentStock = costItem?.stock ?? 0;

    const activeSales = await this.prisma.streamingSale.findMany({
      where: { accountId: account.id, status: 'ACTIVE' },
      select: { cutoffDate: true },
    });

    const soldDaysToTransfer = activeSales.reduce((acc, sale) => {
      return acc + this.daysRemainingByDate(sale.cutoffDate);
    }, 0);

    const oldEmail = account.email;

    await this.prisma.$transaction(async (tx) => {
      // 1) ADJUST_OUT — cierra todo el stock actual de la plataforma
      if (currentStock !== 0) {
        await this.kardex.registerAdjustOut(
          {
            companyId,
            platformId: account.platformId,
            qty: Math.abs(currentStock),
            refType: KardexRefType.ACCOUNT_REPLACEMENT,
            accountId: account.id,
            allowNegative: true,
          },
          tx,
        );
      }

      // 2) IN — todos los perfiles × días de B
      const qtyNewTotal = account.profilesTotal * dto.durationDays;
      await this.kardex.registerIn(
        {
          companyId,
          platformId: account.platformId,
          qty: qtyNewTotal,
          unitCost: newDailyCost,
          refType: KardexRefType.ACCOUNT_REPLACEMENT,
          accountId: account.id,
        },
        tx,
      );

      // 3) OUT — consume días de ventas activas que se transfieren
      if (soldDaysToTransfer > 0) {
        await this.kardex.registerOut(
          {
            companyId,
            platformId: account.platformId,
            qty: soldDaysToTransfer,
            refType: KardexRefType.ACCOUNT_REPLACEMENT,
            accountId: account.id,
          },
          tx,
        );
      }

      // 4) Balance proveedor — descuenta nuevo costo
      await tx.supplier.update({
        where: { id: account.supplierId },
        data: { balance: { decrement: newTotalCost } },
      });

      // 5) Actualiza cuenta con datos de B
      await tx.streamingAccount.update({
        where: { id: account.id },
        data: {
          email: dto.email.trim(),
          password: dto.password,
          purchaseDate: newPurchaseDate,
          cutoffDate: newCutoffDate,
          durationDays: dto.durationDays,
          totalCost: newTotalCost,
          replacedByEmail: oldEmail,
          replacedAt: new Date(),
          replacementNote: dto.note ?? null,
        },
      });
    });

    return this.prisma.streamingAccount.findUnique({
      where: { id: account.id },
      select: ACCOUNT_SELECT,
    });
  }

  // =========================
  // CASO 3 — Reemplazo desde inventario
  // =========================
  async replaceFromInventory(
    id: number,
    dto: ReplaceFromInventoryDto,
    companyId: number,
  ) {
    const accountA = await this.accounts.findAndAssert(id, companyId);
    const accountB = await this.accounts.findAndAssert(
      dto.replacementAccountId,
      companyId,
    );

    if (accountA.id === accountB.id)
      throw new BadRequestException(
        'La cuenta de reemplazo debe ser diferente.',
      );

    if (accountA.platformId !== accountB.platformId)
      throw new BadRequestException(
        'Ambas cuentas deben ser de la misma plataforma.',
      );

    const soldProfilesA = await this.prisma.accountProfile.findMany({
      where: { accountId: accountA.id, status: 'SOLD' },
      select: { id: true, profileNo: true },
      orderBy: { profileNo: 'asc' },
    });

    const availableProfilesB = await this.prisma.accountProfile.findMany({
      where: { accountId: accountB.id, status: 'AVAILABLE' },
      select: { id: true, profileNo: true },
      orderBy: { profileNo: 'asc' },
    });

    if (availableProfilesB.length < soldProfilesA.length)
      throw new BadRequestException(
        `La cuenta B solo tiene ${availableProfilesB.length} perfiles disponibles y se necesitan ${soldProfilesA.length}.`,
      );

    const daysLeftA = this.daysRemainingByDate(accountA.cutoffDate);
    const daysLeftB = this.daysRemainingByDate(accountB.cutoffDate);

    const availableCountA = await this.prisma.accountProfile.count({
      where: { accountId: accountA.id, status: 'AVAILABLE' },
    });

    const activeSalesA = await this.prisma.streamingSale.findMany({
      where: { accountId: accountA.id, status: 'ACTIVE' },
      select: { cutoffDate: true },
    });

    const soldDaysA = activeSalesA.reduce((acc, sale) => {
      return acc + this.daysRemainingByDate(sale.cutoffDate);
    }, 0);

    await this.prisma.$transaction(async (tx) => {
      // 1) ADJUST_OUT en kardex de A — cierra días disponibles restantes
      const qtyCloseA = availableCountA * daysLeftA;
      if (qtyCloseA > 0) {
        await this.kardex.registerAdjustOut(
          {
            companyId,
            platformId: accountA.platformId,
            qty: qtyCloseA,
            refType: KardexRefType.ACCOUNT_REPLACEMENT,
            accountId: accountA.id,
            allowNegative: true,
          },
          tx,
        );
      }

      // 2) ADJUST_OUT en kardex de A — cierra días de ventas activas que migran
      if (soldDaysA > 0) {
        await this.kardex.registerAdjustOut(
          {
            companyId,
            platformId: accountA.platformId,
            qty: soldDaysA,
            refType: KardexRefType.ACCOUNT_REPLACEMENT,
            accountId: accountA.id,
            allowNegative: true,
          },
          tx,
        );
      }

      // 3) ADJUST_OUT en kardex de B — perfiles que migran ya no estarán disponibles
      const qtyCloseB = soldProfilesA.length * daysLeftB;
      if (qtyCloseB > 0) {
        await this.kardex.registerAdjustOut(
          {
            companyId,
            platformId: accountB.platformId,
            qty: qtyCloseB,
            refType: KardexRefType.ACCOUNT_REPLACEMENT,
            accountId: accountB.id,
            allowNegative: true,
          },
          tx,
        );
      }

      // 4) Migrar ventas activas de A → B
      for (let i = 0; i < soldProfilesA.length; i++) {
        const profileA = soldProfilesA[i];
        const profileB = availableProfilesB[i];

        await tx.accountProfile.update({
          where: { id: profileB.id },
          data: { status: 'SOLD' },
        });

        await tx.streamingSale.updateMany({
          where: {
            profileId: profileA.id,
            accountId: accountA.id,
            status: 'ACTIVE',
          },
          data: {
            profileId: profileB.id,
            accountId: accountB.id,
          },
        });

        await tx.accountProfile.update({
          where: { id: profileA.id },
          data: { status: 'AVAILABLE' },
        });
      }

      // 5) Inactivar cuenta A con historial
      await tx.streamingAccount.update({
        where: { id: accountA.id },
        data: {
          status: 'INACTIVE',
          replacedByEmail: accountB.email,
          replacedAt: new Date(),
          replacementNote: dto.note ?? null,
        },
      });
    });

    return this.prisma.streamingAccount.findUnique({
      where: { id: accountA.id },
      select: ACCOUNT_SELECT,
    });
  }
}

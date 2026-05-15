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

  // CASO 1
  async replaceCredentials(
    id: number,
    dto: ReplaceCredentialsDto,
    companyId: number,
    userId: number,
  ) {
    const account = await this.accounts.findAndAssert(id, companyId);

    await this.prisma.$transaction(async (tx) => {
      await tx.accountReplacementHistory.create({
        data: {
          companyId,
          accountId: account.id,
          replacementType: 'CREDENTIALS',
          oldEmail: account.email,
          oldPassword: account.password,
          oldCost: account.totalCost,
          oldCutoffDate: account.cutoffDate,
          oldSupplierId: account.supplierId,
          replacedByUserId: userId,
        },
      });

      await tx.streamingAccount.update({
        where: { id: account.id },
        data: {
          email: dto.email.trim(),
          password: dto.password,
          ...(dto.note ? { notes: dto.note } : {}),
        },
      });
    });

    return this.prisma.streamingAccount.findUnique({
      where: { id: account.id },
      select: ACCOUNT_SELECT,
    });
  }

  // CASO 2
  async replacePaid(
    id: number,
    dto: ReplacePaidDto,
    companyId: number,
    today: Date,
    userId: number,
  ) {
    const account = await this.accounts.findAndAssert(id, companyId);

    const newPurchaseDate = this.accounts.parseDate(
      dto.purchaseDate,
      'purchaseDate',
    );
    const newTotalCost = this.accounts.parseDecimal(dto.totalCost, 'totalCost');

    if (!Number.isInteger(dto.durationDays) || dto.durationDays <= 0)
      throw new BadRequestException('durationDays inválido.');

    const newCutoffDate = new Date(
      Date.UTC(
        newPurchaseDate.getUTCFullYear(),
        newPurchaseDate.getUTCMonth(),
        newPurchaseDate.getUTCDate() + dto.durationDays,
      ),
    );

    const newDailyCost = this.accounts.calcDailyCost(
      newTotalCost,
      account.profilesTotal,
      dto.durationDays,
    );

    const daysLeft = this.accounts.daysRemainingByDate(
      account.cutoffDate,
      today,
    );
    const availableCount = await this.prisma.accountProfile.count({
      where: { accountId: account.id, status: 'AVAILABLE' },
    });
    const qtyToClose = availableCount * daysLeft;

    const activeSales = await this.prisma.streamingSale.findMany({
      where: { accountId: account.id, status: 'ACTIVE' },
      select: { cutoffDate: true },
    });
    const soldDaysToTransfer = activeSales.reduce((acc, sale) => {
      return acc + this.accounts.daysRemainingByDate(sale.cutoffDate, today);
    }, 0);

    await this.prisma.$transaction(async (tx) => {
      // Guardar historial antes de modificar
      await tx.accountReplacementHistory.create({
        data: {
          companyId,
          accountId: account.id,
          replacementType: 'PAID',
          oldEmail: account.email,
          oldPassword: account.password,
          oldCost: account.totalCost,
          oldCutoffDate: account.cutoffDate,
          oldSupplierId: account.supplierId,
          replacedByUserId: userId,
          note: dto.note ?? null,
        },
      });

      if (qtyToClose > 0) {
        await this.kardex.registerAdjustOut(
          {
            companyId,
            platformId: account.platformId,
            qty: qtyToClose,
            refType: KardexRefType.ACCOUNT_REPLACEMENT,
            accountId: account.id,
            allowNegative: true,
          },
          tx,
        );
      }

      await this.kardex.registerIn(
        {
          companyId,
          platformId: account.platformId,
          qty: account.profilesTotal * dto.durationDays,
          unitCost: newDailyCost,
          refType: KardexRefType.ACCOUNT_REPLACEMENT,
          accountId: account.id,
        },
        tx,
      );

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

      await tx.supplier.update({
        where: { id: account.supplierId },
        data: { balance: { decrement: newTotalCost } },
      });

      await tx.streamingAccount.update({
        where: { id: account.id },
        data: {
          email: dto.email.trim(),
          password: dto.password,
          purchaseDate: newPurchaseDate,
          cutoffDate: newCutoffDate,
          durationDays: dto.durationDays,
          totalCost: newTotalCost,
        },
      });
    });

    return this.prisma.streamingAccount.findUnique({
      where: { id: account.id },
      select: ACCOUNT_SELECT,
    });
  }

  // CASO 3
  async replaceFromInventory(
    id: number,
    dto: ReplaceFromInventoryDto,
    companyId: number,
    today: Date,
    userId: number,
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

    const profilesWithActiveSale = await Promise.all(
      soldProfilesA.map(async (profileA) => {
        const activeSale = await this.prisma.streamingSale.findFirst({
          where: {
            profileId: profileA.id,
            accountId: accountA.id,
            status: 'ACTIVE',
          },
        });
        return { profileA, activeSale };
      }),
    );

    const toMigrate = profilesWithActiveSale.filter(
      (x) => x.activeSale !== null,
    );

    const availableProfilesB = await this.prisma.accountProfile.findMany({
      where: { accountId: accountB.id, status: 'AVAILABLE' },
      select: { id: true, profileNo: true },
      orderBy: { profileNo: 'asc' },
    });

    if (availableProfilesB.length < toMigrate.length)
      throw new BadRequestException(
        `La cuenta B solo tiene ${availableProfilesB.length} perfiles disponibles y se necesitan ${toMigrate.length} para las ventas activas.`,
      );

    const daysLeftA = this.accounts.daysRemainingByDate(
      accountA.cutoffDate,
      today,
    );
    const daysLeftB = this.accounts.daysRemainingByDate(
      accountB.cutoffDate,
      today,
    );
    const availableCountA = await this.prisma.accountProfile.count({
      where: { accountId: accountA.id, status: 'AVAILABLE' },
    });

    await this.prisma.$transaction(async (tx) => {
      // Guardar historial antes de modificar
      await tx.accountReplacementHistory.create({
        data: {
          companyId,
          accountId: accountA.id,
          replacementType: 'FROM_INVENTORY',
          oldEmail: accountA.email,
          oldPassword: accountA.password,
          oldCost: accountA.totalCost,
          oldCutoffDate: accountA.cutoffDate,
          oldSupplierId: accountA.supplierId,
          replacementAccountId: accountB.id,
          replacedByUserId: userId,
          note: dto.note ?? null,
        },
      });

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

      const qtyCloseB = toMigrate.length * daysLeftB;
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

      for (let i = 0; i < soldProfilesA.length; i++) {
        const { profileA, activeSale } = profilesWithActiveSale[i];

        if (activeSale) {
          const profileB =
            availableProfilesB[
              toMigrate.findIndex((x) => x.profileA.id === profileA.id)
            ];

          await tx.accountProfile.update({
            where: { id: profileB.id },
            data: { status: 'SOLD' },
          });

          await tx.streamingSale.update({
            where: { id: activeSale.id },
            data: { profileId: profileB.id, accountId: accountB.id },
          });
        }

        await tx.accountProfile.update({
          where: { id: profileA.id },
          data: { status: 'AVAILABLE' },
        });
      }

      await tx.streamingAccount.update({
        where: { id: accountA.id },
        data: { status: 'INACTIVE' },
      });

      await tx.accountProfile.updateMany({
        where: { accountId: accountA.id, status: 'AVAILABLE' },
        data: { status: 'BLOCKED' },
      });
    });

    return this.prisma.streamingAccount.findUnique({
      where: { id: accountA.id },
      select: ACCOUNT_SELECT,
    });
  }
}

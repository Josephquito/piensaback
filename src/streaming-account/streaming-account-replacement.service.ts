import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KardexRefType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import {
  StreamingAccountsService,
  ACCOUNT_SELECT,
} from './streaming-accounts.service';
import { ReplaceCredentialsDto } from './dto/replace-credentials.dto';
import { ReplacePaidDto } from './dto/replace-paid.dto';
import { ReplaceFromInventoryDto } from './dto/replace-from-inventory.dto';
import { daysRemainingFrom } from '../common/utils/date.utils';

@Injectable()
export class StreamingAccountReplacementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
  ) {}

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
  async replacePaid(
    id: number,
    dto: ReplacePaidDto,
    companyId: number,
    today: Date,
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

    // Resolver montos según modalidad
    const amounts = this.accounts['resolvePaymentAmounts'](
      dto.paymentMode,
      newTotalCost,
      dto,
    );

    const daysLeft = daysRemainingFrom(account.cutoffDate, today);

    const availableCount = await this.prisma.accountProfile.count({
      where: { accountId: account.id, status: 'AVAILABLE' },
    });
    const qtyToClose = availableCount * daysLeft;

    const activeSales = await this.prisma.streamingSale.findMany({
      where: { accountId: account.id, status: 'ACTIVE' },
      select: { cutoffDate: true },
    });
    const soldDaysToTransfer = activeSales.reduce((acc, sale) => {
      return acc + daysRemainingFrom(sale.cutoffDate, today);
    }, 0);

    const oldEmail = account.email;
    const newSupplierId = dto.supplierId;
    const supplierChanged = newSupplierId !== account.supplierId;

    await this.prisma.$transaction(async (tx) => {
      // 1) Validar nuevo proveedor
      const supplier = await tx.supplier.findFirst({
        where: { id: newSupplierId, companyId },
        select: { id: true, balance: true },
      });
      if (!supplier) throw new NotFoundException('Proveedor no accesible.');

      // 2) ADJUST_OUT — días disponibles que se pierden
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

      // 3) IN — todos los perfiles × días de la cuenta nueva
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

      // 4) OUT — consume días de ventas activas que se transfieren
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

      // 5) Balance proveedor nuevo según modalidad
      if (!amounts.balanceDelta.equals(0)) {
        const balanceBefore = new Prisma.Decimal(supplier.balance);
        const balanceAfter = balanceBefore.add(amounts.balanceDelta);

        await tx.supplier.update({
          where: { id: newSupplierId },
          data: { balance: balanceAfter },
        });

        await tx.supplierMovement.create({
          data: {
            companyId,
            supplierId: newSupplierId,
            type: 'PURCHASE',
            amount: newTotalCost,
            balanceBefore,
            balanceAfter,
            accountId: account.id,
            date: new Date(),
          },
        });
      }

      // 6) Actualizar cuenta
      await tx.streamingAccount.update({
        where: { id: account.id },
        data: {
          email: dto.email.trim(),
          password: dto.password,
          purchaseDate: newPurchaseDate,
          cutoffDate: newCutoffDate,
          durationDays: dto.durationDays,
          totalCost: newTotalCost,
          paymentMode: dto.paymentMode,
          cashAmount: amounts.cashAmount,
          creditAmount: amounts.creditAmount,
          balanceAmount: amounts.balanceAmount,
          replacedByEmail: oldEmail,
          replacedAt: new Date(),
          replacementNote: dto.note ?? null,
          ...(supplierChanged ? { supplierId: newSupplierId } : {}),
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
    today: Date,
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

    // Solo perfiles SOLD de A que tienen venta ACTIVE — estos son los que realmente se migran
    const soldProfilesA = await this.prisma.accountProfile.findMany({
      where: { accountId: accountA.id, status: 'SOLD' },
      select: { id: true, profileNo: true },
      orderBy: { profileNo: 'asc' },
    });

    // Para cada perfil SOLD de A, verificar si tiene venta activa
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

    // Solo los que realmente tienen venta activa necesitan un perfil de B
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

    const daysLeftA = daysRemainingFrom(accountA.cutoffDate, today);
    const daysLeftB = daysRemainingFrom(accountB.cutoffDate, today);

    const availableCountA = await this.prisma.accountProfile.count({
      where: { accountId: accountA.id, status: 'AVAILABLE' },
    });

    await this.prisma.$transaction(async (tx) => {
      // 1) ADJUST_OUT en A — días disponibles que se pierden
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

      // 2) ADJUST_OUT en B — solo los perfiles que realmente absorben ventas activas
      // Los perfiles de B que no absorben venta quedan AVAILABLE, no se ajustan
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

      // 3) Migrar ventas activas de A → B
      for (let i = 0; i < soldProfilesA.length; i++) {
        const { profileA, activeSale } = profilesWithActiveSale[i];

        if (activeSale) {
          // Tiene venta activa — asignar un perfil de B y migrar la venta
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
            data: {
              profileId: profileB.id,
              accountId: accountB.id,
            },
          });
        }
        // Si no tiene venta activa, no se asigna perfil de B — se deja como está

        // Perfil de A vuelve a AVAILABLE (luego se bloqueará con el resto)
        await tx.accountProfile.update({
          where: { id: profileA.id },
          data: { status: 'AVAILABLE' },
        });
      }

      // 4) Inactivar cuenta A
      await tx.streamingAccount.update({
        where: { id: accountA.id },
        data: {
          status: 'INACTIVE',
          replacedByEmail: accountB.email,
          replacedAt: new Date(),
          replacementNote: dto.note ?? null,
        },
      });

      // 5) Bloquear todos los perfiles AVAILABLE de A
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

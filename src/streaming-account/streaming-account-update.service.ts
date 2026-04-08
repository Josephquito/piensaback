import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KardexRefType,
  PaymentMode,
  Prisma,
  SaleStatus,
  StreamingAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { StreamingAccountsService } from './streaming-accounts.service';
import { UpdateStreamingAccountDto } from './dto/update-streaming-account.dto';
import { daysRemainingFrom, isExpiredFrom } from '../common/utils/date.utils';

@Injectable()
export class StreamingAccountUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
  ) {}

  // ─── Calcula el balanceDelta de una modalidad ya guardada ──────────
  private resolveExistingDelta(
    paymentMode: PaymentMode,
    totalCost: Prisma.Decimal,
    cashAmount: Prisma.Decimal | null,
    creditAmount: Prisma.Decimal | null,
    balanceAmount: Prisma.Decimal | null,
  ): Prisma.Decimal {
    const zero = new Prisma.Decimal(0);
    switch (paymentMode) {
      case 'CASH':
        return zero;
      case 'CREDIT':
        return totalCost.negated();
      case 'BALANCE':
        return totalCost.negated();
      case 'CASH_BALANCE':
        return (balanceAmount ?? zero).negated();
      case 'CASH_CREDIT':
        return (creditAmount ?? zero).negated();
      case 'BALANCE_CREDIT':
        return (balanceAmount ?? zero).negated().sub(creditAmount ?? zero);
    }
  }

  async update(
    id: number,
    dto: UpdateStreamingAccountDto,
    companyId: number,
    today: Date,
  ) {
    if ('totalCost' in dto)
      throw new BadRequestException(
        'El costo de la cuenta se corrige por el servicio de corrección de costo.',
      );
    if ('cutoffDate' in dto)
      throw new BadRequestException(
        'La fecha de corte se recalcula automáticamente desde purchaseDate y durationDays.',
      );

    const account = await this.accounts.findAndAssert(id, companyId);

    if (dto.status === StreamingAccountStatus.EXPIRED)
      throw new BadRequestException(
        'No se puede cambiar manualmente a Expirada. Cambia la fecha de corte.',
      );
    if (dto.status === StreamingAccountStatus.DELETED)
      throw new BadRequestException(
        'No se puede cambiar manualmente a Eliminada.',
      );

    // ─── Resolver valores efectivos ────────────────────────────────
    const oldSupplierId = account.supplierId;
    const newSupplierId = dto.supplierId ?? oldSupplierId;
    const supplierChanged = oldSupplierId !== newSupplierId;

    const oldPaymentMode = account.paymentMode;
    const newPaymentMode = dto.paymentMode ?? oldPaymentMode;
    const modalityChanged = newPaymentMode !== oldPaymentMode;

    const newDurationDays = dto.durationDays ?? account.durationDays;
    const newProfilesTotal = account.profilesTotal;

    const newPurchaseDate =
      dto.purchaseDate !== undefined
        ? this.accounts.parseDate(dto.purchaseDate, 'purchaseDate')
        : account.purchaseDate;

    const newCutoffDate = new Date(
      Date.UTC(
        newPurchaseDate.getUTCFullYear(),
        newPurchaseDate.getUTCMonth(),
        newPurchaseDate.getUTCDate() + newDurationDays,
      ),
    );

    const platformChanged =
      dto.platformId !== undefined && dto.platformId !== account.platformId;

    const newDailyCost = this.accounts.calcDailyCost(
      account.totalCost,
      newProfilesTotal,
      newDurationDays,
    );

    const oldDaysLeft = daysRemainingFrom(account.cutoffDate, today);
    const newDaysLeft = daysRemainingFrom(newCutoffDate, today);

    // ─── Lecturas previas fuera de tx ──────────────────────────────
    let activeOrPausedSales = 0;
    let availableCount = 0;

    if (platformChanged) {
      activeOrPausedSales = await this.prisma.streamingSale.count({
        where: {
          accountId: account.id,
          status: { in: [SaleStatus.ACTIVE, SaleStatus.PAUSED] },
        },
      });

      if (activeOrPausedSales > 0)
        throw new BadRequestException(
          `No se puede cambiar de plataforma: hay ${activeOrPausedSales} ventas activas. Ciérralas primero.`,
        );

      availableCount = await this.prisma.accountProfile.count({
        where: { accountId: account.id, status: 'AVAILABLE' },
      });
    }

    // ─── Resolver nuevos montos si cambia modalidad ────────────────
    let newAmounts: {
      cashAmount: Prisma.Decimal;
      creditAmount: Prisma.Decimal;
      balanceAmount: Prisma.Decimal;
      balanceDelta: Prisma.Decimal;
    } | null = null;

    if (modalityChanged) {
      newAmounts = this.accounts['resolvePaymentAmounts'](
        newPaymentMode,
        account.totalCost,
        dto,
      );
    }

    // ─── Delta viejo (lo que ya estaba aplicado en el proveedor) ──
    const oldDelta = this.resolveExistingDelta(
      oldPaymentMode,
      account.totalCost,
      account.cashAmount ? new Prisma.Decimal(account.cashAmount) : null,
      account.creditAmount ? new Prisma.Decimal(account.creditAmount) : null,
      account.balanceAmount ? new Prisma.Decimal(account.balanceAmount) : null,
    );

    // ─── Construir data de update ──────────────────────────────────
    const data: Prisma.StreamingAccountUpdateInput = {
      cutoffDate: newCutoffDate,
    };
    if (dto.email !== undefined) data.email = dto.email.trim();
    if (dto.password !== undefined) data.password = dto.password;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;
    if (dto.purchaseDate !== undefined) data.purchaseDate = newPurchaseDate;
    if (dto.durationDays !== undefined) data.durationDays = newDurationDays;
    if (dto.platformId !== undefined)
      data.platform = { connect: { id: dto.platformId } };
    if (dto.supplierId !== undefined)
      data.supplier = { connect: { id: dto.supplierId } };
    if (modalityChanged && newAmounts) {
      data.paymentMode = newPaymentMode;
      data.cashAmount = newAmounts.cashAmount;
      data.creditAmount = newAmounts.creditAmount;
      data.balanceAmount = newAmounts.balanceAmount;
    }

    await this.prisma.$transaction(
      async (tx) => {
        // 1) Validar platform y supplier
        if (dto.platformId !== undefined) {
          const p = await tx.streamingPlatform.findFirst({
            where: { id: dto.platformId, companyId },
            select: { id: true },
          });
          if (!p) throw new NotFoundException('Plataforma no accesible.');
        }

        if (dto.supplierId !== undefined) {
          const s = await tx.supplier.findFirst({
            where: { id: dto.supplierId, companyId },
            select: { id: true, balance: true },
          });
          if (!s) throw new NotFoundException('Proveedor no accesible.');
        }

        // 2) Ajuste de balance por cambio de proveedor y/o modalidad
        if (supplierChanged || modalityChanged) {
          const newDelta = newAmounts?.balanceDelta ?? oldDelta;

          if (supplierChanged) {
            // Revertir en proveedor viejo
            const oldSupplier = await tx.supplier.findUnique({
              where: { id: oldSupplierId },
              select: { balance: true },
            });
            const oldBalanceBefore = new Prisma.Decimal(oldSupplier!.balance);
            const oldBalanceAfter = oldBalanceBefore.sub(oldDelta); // revertir = restar el delta negativo = sumar

            await tx.supplier.update({
              where: { id: oldSupplierId },
              data: { balance: oldBalanceAfter },
            });

            await tx.supplierMovement.create({
              data: {
                companyId,
                supplierId: oldSupplierId,
                type: 'ADJUSTMENT',
                amount: account.totalCost,
                balanceBefore: oldBalanceBefore,
                balanceAfter: oldBalanceAfter,
                accountId: account.id,
                date: new Date(),
              },
            });

            // Aplicar en proveedor nuevo
            const newSupplier = await tx.supplier.findUnique({
              where: { id: newSupplierId },
              select: { balance: true },
            });
            const newBalanceBefore = new Prisma.Decimal(newSupplier!.balance);
            const newBalanceAfter = newBalanceBefore.add(newDelta);

            await tx.supplier.update({
              where: { id: newSupplierId },
              data: { balance: newBalanceAfter },
            });

            if (!newDelta.equals(0)) {
              await tx.supplierMovement.create({
                data: {
                  companyId,
                  supplierId: newSupplierId,
                  type: 'ADJUSTMENT',
                  amount: account.totalCost,
                  balanceBefore: newBalanceBefore,
                  balanceAfter: newBalanceAfter,
                  accountId: account.id,
                  date: new Date(),
                },
              });
            }
          } else {
            // Solo cambia modalidad, mismo proveedor
            const supplier = await tx.supplier.findUnique({
              where: { id: oldSupplierId },
              select: { balance: true },
            });
            const balanceBefore = new Prisma.Decimal(supplier!.balance);
            // Revertir delta viejo y aplicar nuevo
            const balanceAfter = balanceBefore.sub(oldDelta).add(newDelta);

            if (!balanceBefore.equals(balanceAfter)) {
              await tx.supplier.update({
                where: { id: oldSupplierId },
                data: { balance: balanceAfter },
              });

              await tx.supplierMovement.create({
                data: {
                  companyId,
                  supplierId: oldSupplierId,
                  type: 'ADJUSTMENT',
                  amount: account.totalCost,
                  balanceBefore,
                  balanceAfter,
                  accountId: account.id,
                  date: new Date(),
                },
              });
            }
          }
        }

        // 3) Liberar conflicto de email con cuentas DELETED
        if (dto.email !== undefined) {
          const conflict = await tx.streamingAccount.findFirst({
            where: {
              companyId,
              platformId: dto.platformId ?? account.platformId,
              email: dto.email.trim(),
              status: StreamingAccountStatus.DELETED,
              id: { not: account.id },
            },
            select: { id: true },
          });
          if (conflict) {
            await tx.streamingAccount.update({
              where: { id: conflict.id },
              data: {
                email: `__deleted_${conflict.id}__${dto.email.trim()}`,
              },
            });
          }
        }

        // 4) Update cuenta
        try {
          await tx.streamingAccount.update({
            where: { id: account.id },
            data,
          });
        } catch (e: any) {
          if (e?.code === 'P2002')
            throw new BadRequestException(
              'Ya existe una cuenta activa con ese correo en esta plataforma.',
            );
          throw e;
        }

        // 5) Recalcular status según nueva cutoffDate
        const expired = isExpiredFrom(newCutoffDate, today);
        const currentStatus =
          (data.status as StreamingAccountStatus) ?? account.status;

        if (
          expired &&
          currentStatus !== StreamingAccountStatus.EXPIRED &&
          currentStatus !== StreamingAccountStatus.DELETED &&
          currentStatus !== StreamingAccountStatus.INACTIVE
        ) {
          await tx.streamingAccount.update({
            where: { id: account.id },
            data: { status: StreamingAccountStatus.EXPIRED },
          });
        } else if (
          !expired &&
          account.status === StreamingAccountStatus.EXPIRED
        ) {
          await tx.streamingAccount.update({
            where: { id: account.id },
            data: { status: StreamingAccountStatus.ACTIVE },
          });
        }

        // 6) Recalcular kardex
        if (platformChanged) {
          const qtyToClose = availableCount * oldDaysLeft;
          if (qtyToClose > 0) {
            await this.kardex.registerAdjustOut(
              {
                companyId,
                platformId: account.platformId,
                qty: qtyToClose,
                refType: KardexRefType.ACCOUNT_UPDATE,
                accountId: account.id,
                allowNegative: true,
              },
              tx,
            );
          }

          const qtyToEnter = availableCount * newDaysLeft;
          if (qtyToEnter > 0) {
            await this.kardex.registerIn(
              {
                companyId,
                platformId: dto.platformId!,
                qty: qtyToEnter,
                unitCost: newDailyCost,
                refType: KardexRefType.ACCOUNT_UPDATE,
                accountId: account.id,
              },
              tx,
            );
          }
        } else {
          const deltaPerProfile = newDaysLeft - oldDaysLeft;
          if (deltaPerProfile !== 0) {
            const totalDelta = deltaPerProfile * account.profilesTotal;

            if (totalDelta > 0) {
              await this.kardex.registerIn(
                {
                  companyId,
                  platformId: account.platformId,
                  qty: totalDelta,
                  unitCost: newDailyCost,
                  refType: KardexRefType.ACCOUNT_UPDATE,
                  accountId: account.id,
                },
                tx,
              );
            } else {
              await this.kardex.registerAdjustOut(
                {
                  companyId,
                  platformId: account.platformId,
                  qty: Math.abs(totalDelta),
                  refType: KardexRefType.ACCOUNT_UPDATE,
                  accountId: account.id,
                  allowNegative: true,
                },
                tx,
              );
            }
          }
        }
      },
      { timeout: 15000 },
    );

    return this.accounts.findOne(account.id, companyId);
  }
}

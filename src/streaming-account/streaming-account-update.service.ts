import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KardexRefType,
  Prisma,
  SaleStatus,
  StreamingAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { StreamingAccountsService } from './streaming-accounts.service';
import { UpdateStreamingAccountDto } from './dto/update-streaming-account.dto';

@Injectable()
export class StreamingAccountUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
  ) {}

  async update(id: number, dto: UpdateStreamingAccountDto, companyId: number, today: Date) {
    // --- Rechazar campos prohibidos ---
    if ('totalCost' in dto)
      throw new BadRequestException(
        'El costo de la cuenta se corrige por el servicio de corrección de costo.',
      );
    if ('cutoffDate' in dto)
      throw new BadRequestException(
        'La fecha de corte se recalcula automáticamente desde purchaseDate y durationDays.',
      );

    const account = await this.accounts.findAndAssert(id, companyId);

    // --- Validar status ---
    if (dto.status === StreamingAccountStatus.EXPIRED)
      throw new BadRequestException(
        'No se puede cambiar manualmente a Expirada. Cambia la fecha de corte.',
      );
    if (dto.status === StreamingAccountStatus.DELETED)
      throw new BadRequestException(
        'No se puede cambiar manualmente a Eliminada.',
      );

    // --- Resolver valores efectivos ---
    const oldSupplierId = account.supplierId;
    const newSupplierId = dto.supplierId ?? oldSupplierId;
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

    const oldDaysLeft = this.accounts.daysRemainingByDate(account.cutoffDate, today);
    const newDaysLeft = this.accounts.daysRemainingByDate(newCutoffDate, today);

    // --- Lecturas previas fuera de la transacción para no alargarla ---
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

    // --- Construir data de update ---
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

    await this.prisma.$transaction(
      async (tx) => {
        // 1) Validar platform y supplier dentro de la tx
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
            select: { id: true },
          });
          if (!s) throw new NotFoundException('Proveedor no accesible.');
        }

        // 2) Balance proveedor si cambia supplierId
        if (oldSupplierId !== newSupplierId) {
          await tx.supplier.update({
            where: { id: oldSupplierId },
            data: { balance: { increment: account.totalCost } },
          });
          await tx.supplier.update({
            where: { id: newSupplierId },
            data: { balance: { decrement: account.totalCost } },
          });
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
        const expired = this.accounts.isExpired(newCutoffDate, today);
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
          // Sacar días disponibles de plataforma anterior
          const qtyToClose = availableCount * oldDaysLeft;
          if (qtyToClose > 0) {
            await this.kardex.registerAdjustOut(
              {
                companyId,
                platformId: account.platformId, // ← anterior
                qty: qtyToClose,
                refType: KardexRefType.ACCOUNT_UPDATE,
                accountId: account.id,
                allowNegative: true,
              },
              tx,
            );
          }

          // Entrar a plataforma nueva
          const qtyToEnter = availableCount * newDaysLeft;
          if (qtyToEnter > 0) {
            await this.kardex.registerIn(
              {
                companyId,
                platformId: dto.platformId!, // ← nueva
                qty: qtyToEnter,
                unitCost: newDailyCost,
                refType: KardexRefType.ACCOUNT_UPDATE,
                accountId: account.id,
              },
              tx,
            );
          }
        } else {
          // Misma plataforma — ajustar por cambio de días o fecha de compra
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

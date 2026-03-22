import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StreamingAccountStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StreamingAccountsService } from './streaming-accounts.service';
import { UpdateStreamingAccountDto } from './dto/update-streaming-account.dto';

@Injectable()
export class StreamingAccountUpdateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: StreamingAccountsService,
  ) {}

  async update(id: number, dto: UpdateStreamingAccountDto, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);

    if (dto.platformId !== undefined) {
      const p = await this.prisma.streamingPlatform.findFirst({
        where: { id: dto.platformId, companyId },
        select: { id: true },
      });
      if (!p) throw new NotFoundException('Plataforma no accesible.');
    }

    if (dto.supplierId !== undefined) {
      const s = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, companyId },
        select: { id: true },
      });
      if (!s) throw new NotFoundException('Proveedor no accesible.');
    }

    if (dto.status === StreamingAccountStatus.EXPIRED)
      throw new BadRequestException(
        'No se puede cambiar manualmente a Expirada. Cambia la fecha de corte.',
      );

    if (dto.status === StreamingAccountStatus.DELETED)
      throw new BadRequestException(
        'No se puede cambiar manualmente a Eliminada.',
      );

    const oldSupplierId = account.supplierId;
    const newSupplierId = dto.supplierId ?? oldSupplierId;
    const oldCost = account.totalCost;
    const newCost =
      dto.totalCost !== undefined
        ? this.accounts.parseDecimal(dto.totalCost, 'totalCost')
        : oldCost;

    const data: Prisma.StreamingAccountUpdateInput = {};
    if (dto.email !== undefined) data.email = dto.email.trim();
    if (dto.password !== undefined) data.password = dto.password;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;
    if (dto.purchaseDate !== undefined)
      data.purchaseDate = this.accounts.parseDate(
        dto.purchaseDate,
        'purchaseDate',
      );
    if (dto.cutoffDate !== undefined)
      data.cutoffDate = this.accounts.parseDate(dto.cutoffDate, 'cutoffDate');
    if (dto.totalCost !== undefined) data.totalCost = newCost;
    if (dto.durationDays !== undefined) data.durationDays = dto.durationDays;
    if (dto.platformId !== undefined)
      data.platform = { connect: { id: dto.platformId } };
    if (dto.supplierId !== undefined)
      data.supplier = { connect: { id: dto.supplierId } };

    // Recalcular cutoffDate si cambia purchaseDate pero no se envía cutoffDate
    let effectiveCutoffDate = dto.cutoffDate;
    if (dto.purchaseDate !== undefined && dto.cutoffDate === undefined) {
      const newPurchaseDate = this.accounts.parseDate(
        dto.purchaseDate,
        'purchaseDate',
      );
      const cutoff = new Date(
        Date.UTC(
          newPurchaseDate.getUTCFullYear(),
          newPurchaseDate.getUTCMonth(),
          newPurchaseDate.getUTCDate() + account.durationDays,
        ),
      );
      data.cutoffDate = cutoff;
      effectiveCutoffDate = cutoff.toISOString().split('T')[0];
    }

    await this.prisma.$transaction(async (tx) => {
      // 1) Balance proveedor
      if (oldSupplierId !== newSupplierId) {
        await tx.supplier.update({
          where: { id: oldSupplierId },
          data: { balance: { increment: oldCost } },
        });
        await tx.supplier.update({
          where: { id: newSupplierId },
          data: { balance: { decrement: newCost } },
        });
      } else if (dto.totalCost !== undefined) {
        const delta = newCost.sub(oldCost);
        await tx.supplier.update({
          where: { id: oldSupplierId },
          data: { balance: { decrement: delta } },
        });
      }

      // 2) Update cuenta
      try {
        await tx.streamingAccount.update({
          where: { id: account.id },
          data,
        });
      } catch (e: any) {
        if (e?.code === 'P2002')
          throw new BadRequestException(
            'Ya existe una cuenta con ese correo en esta empresa y plataforma.',
          );
        throw e;
      }

      // 3) Recalcular status según cutoffDate
      if (effectiveCutoffDate !== undefined || dto.purchaseDate !== undefined) {
        const cutoffToCheck = effectiveCutoffDate
          ? this.accounts.parseDate(effectiveCutoffDate, 'cutoffDate')
          : account.cutoffDate;

        const expired = this.accounts.isExpired(cutoffToCheck);
        const currentStatus = data.status ?? account.status;

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
      }
    });

    return this.accounts.findOne(account.id, companyId);
  }
}

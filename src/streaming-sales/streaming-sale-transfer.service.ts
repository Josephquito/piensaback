import { BadRequestException, Injectable } from '@nestjs/common';
import {
  KardexRefType,
  SaleStatus,
  RenewalMessageStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { StreamingSalesService, SALE_SELECT } from './streaming-sales.service';
import { TransferProfileDto } from './dto/transfer-profile.dto';

@Injectable()
export class StreamingSaleTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly sales: StreamingSalesService,
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

  private startOfTodayUTC(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  async transfer(id: number, dto: TransferProfileDto, companyId: number) {
    const sale = await this.sales.findAndAssert(id, companyId);

    if (
      sale.status !== SaleStatus.ACTIVE &&
      sale.status !== SaleStatus.EXPIRED &&
      sale.status !== SaleStatus.PAUSED
    )
      throw new BadRequestException(
        'Solo se pueden transferir ventas activas, expiradas o pausadas.',
      );

    const targetAccount = await this.prisma.streamingAccount.findFirst({
      where: { id: dto.targetAccountId, companyId },
      select: { id: true, platformId: true, status: true },
    });
    if (!targetAccount)
      throw new BadRequestException('Cuenta destino no encontrada.');

    if (targetAccount.platformId !== sale.platformId)
      throw new BadRequestException(
        'La cuenta destino debe ser de la misma plataforma.',
      );

    const targetProfile = await this.prisma.accountProfile.findFirst({
      where: {
        id: dto.targetProfileId,
        accountId: dto.targetAccountId,
        status: 'AVAILABLE',
      },
      select: { id: true },
    });
    if (!targetProfile)
      throw new BadRequestException(
        'Perfil destino no disponible o no pertenece a la cuenta destino.',
      );

    // días restantes usando helper por fecha
    const daysLeft =
      sale.status === SaleStatus.PAUSED && sale.pausedDaysLeft != null
        ? sale.pausedDaysLeft
        : this.daysRemainingByDate(sale.cutoffDate);

    // nueva cutoffDate desde inicio de hoy + daysLeft
    const today = this.startOfTodayUTC();
    const newCutoffDate = new Date(today);
    newCutoffDate.setUTCDate(today.getUTCDate() + daysLeft);

    // renewalStatus comparando strings UTC
    const todayStr = today.toISOString().split('T')[0];
    const cutoffStr = newCutoffDate.toISOString().split('T')[0];
    const renewalStatus =
      daysLeft === 0 || todayStr !== cutoffStr
        ? RenewalMessageStatus.NOT_APPLICABLE
        : RenewalMessageStatus.PENDING;

    return this.prisma.$transaction(async (tx) => {
      // 1) Venta original → CLOSED
      await tx.streamingSale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.CLOSED },
      });

      // 2) Perfil origen → AVAILABLE
      await tx.accountProfile.update({
        where: { id: sale.profileId },
        data: { status: 'AVAILABLE' },
      });

      // 3) Kardex IN — devuelve días restantes de cuenta origen
      if (daysLeft > 0) {
        await this.kardex.registerIn(
          {
            companyId,
            platformId: sale.platformId,
            qty: daysLeft,
            unitCost: sale.dailyCost,
            refType: KardexRefType.PROFILE_TRANSFER,
            accountId: sale.accountId,
          },
          tx,
        );
      }

      // 4) Kardex OUT — consume días de cuenta destino
      const { unitCost: newDailyCost } = await this.kardex.registerOut(
        {
          companyId,
          platformId: targetAccount.platformId,
          qty: daysLeft > 0 ? daysLeft : sale.daysAssigned,
          refType: KardexRefType.PROFILE_TRANSFER,
          accountId: targetAccount.id,
        },
        tx,
      );

      const newCostAtSale = newDailyCost.mul(
        daysLeft > 0 ? daysLeft : sale.daysAssigned,
      );

      // 5) Crear nueva venta en cuenta destino
      const newSale = await tx.streamingSale.create({
        data: {
          companyId,
          platformId: targetAccount.platformId,
          accountId: targetAccount.id,
          profileId: targetProfile.id,
          customerId: sale.customerId,
          salePrice: sale.salePrice,
          saleDate: new Date(),
          daysAssigned: daysLeft > 0 ? daysLeft : sale.daysAssigned,
          cutoffDate: newCutoffDate,
          costAtSale: newCostAtSale,
          dailyCost: newDailyCost,
          notes: sale.notes,
          status: SaleStatus.ACTIVE,
          renewalStatus,
        },
        select: SALE_SELECT,
      });

      // 6) Perfil destino → SOLD
      await tx.accountProfile.update({
        where: { id: targetProfile.id },
        data: { status: 'SOLD' },
      });

      // 7) Vincular kardex OUT a la nueva venta
      await tx.kardexMovement.updateMany({
        where: {
          companyId,
          accountId: targetAccount.id,
          refType: KardexRefType.PROFILE_TRANSFER,
          type: 'OUT',
          saleId: null,
        },
        data: { saleId: newSale.id },
      });

      return newSale;
    });
  }
}

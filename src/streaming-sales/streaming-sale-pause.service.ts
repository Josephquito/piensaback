import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus, RenewalMessageStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StreamingSalesService, SALE_SELECT } from './streaming-sales.service';

@Injectable()
export class StreamingSalePauseService {
  constructor(
    private readonly prisma: PrismaService,
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

  // =========================
  // PAUSAR
  // =========================

  async pause(id: number, companyId: number) {
    const sale = await this.sales.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.ACTIVE)
      throw new BadRequestException('Solo se pueden pausar ventas activas.');

    const pausedDaysLeft = this.daysRemainingByDate(sale.cutoffDate); // ← por fecha

    const creditAmount = sale.salePrice
      .div(sale.daysAssigned)
      .mul(pausedDaysLeft)
      .toDecimalPlaces(4);

    return this.prisma.streamingSale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.PAUSED,
        pausedAt: new Date(),
        pausedDaysLeft,
        creditAmount,
        renewalStatus: RenewalMessageStatus.NOT_APPLICABLE,
      },
      select: SALE_SELECT,
    });
  }

  async resume(id: number, companyId: number) {
    const sale = await this.sales.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.PAUSED)
      throw new BadRequestException('Solo se pueden reanudar ventas pausadas.');

    if (!sale.pausedDaysLeft || sale.pausedDaysLeft <= 0)
      throw new BadRequestException('No hay días restantes para reanudar.');

    // nueva cutoffDate = inicio de hoy + pausedDaysLeft días
    const today = this.startOfTodayUTC();
    const newCutoffDate = new Date(today);
    newCutoffDate.setUTCDate(today.getUTCDate() + sale.pausedDaysLeft);

    const todayStr = today.toISOString().split('T')[0];
    const cutoffStr = newCutoffDate.toISOString().split('T')[0];
    const renewalStatus =
      todayStr === cutoffStr
        ? RenewalMessageStatus.PENDING
        : RenewalMessageStatus.NOT_APPLICABLE;

    return this.prisma.streamingSale.update({
      where: { id: sale.id },
      data: {
        status: SaleStatus.ACTIVE,
        cutoffDate: newCutoffDate,
        pausedAt: null,
        pausedDaysLeft: null,
        creditAmount: null,
        renewalStatus,
      },
      select: SALE_SELECT,
    });
  }
}

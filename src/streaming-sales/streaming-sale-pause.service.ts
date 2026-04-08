import { BadRequestException, Injectable } from '@nestjs/common';
import { SaleStatus, RenewalMessageStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StreamingSalesService, SALE_SELECT } from './streaming-sales.service';
import { daysRemainingFrom } from '../common/utils/date.utils';

@Injectable()
export class StreamingSalePauseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: StreamingSalesService,
  ) {}

  // =========================
  // PAUSAR
  // =========================

  async pause(id: number, companyId: number, today: Date) {
    const sale = await this.sales.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.ACTIVE)
      throw new BadRequestException('Solo se pueden pausar ventas activas.');

    if (!sale.daysAssigned || sale.daysAssigned <= 0)
      throw new BadRequestException(
        'La venta tiene días asignados inválidos. Corrija el registro antes de pausar.',
      );

    const pausedDaysLeft = daysRemainingFrom(sale.cutoffDate, today);

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

  async resume(id: number, companyId: number, today: Date) {
    const sale = await this.sales.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.PAUSED)
      throw new BadRequestException('Solo se pueden reanudar ventas pausadas.');

    const account = await this.prisma.streamingAccount.findUnique({
      where: { id: sale.accountId },
      select: { status: true },
    });

    if (account?.status === 'EXPIRED' || account?.status === 'INACTIVE')
      throw new BadRequestException(
        'No se puede reanudar una venta de una cuenta inactiva o vencida.',
      );

    if (sale.pausedDaysLeft === null || sale.pausedDaysLeft === undefined)
      throw new BadRequestException('No hay días restantes para reanudar.');

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

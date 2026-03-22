import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RenewalMessageStatus, SaleStatus } from '@prisma/client';

@Injectable()
export class StreamingSaleSchedulerService {
  private readonly logger = new Logger(StreamingSaleSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyTasks() {
    await this.markExpiredSales();
    await this.markPendingRenewal();
  }

  private async markExpiredSales() {
    // inicio de hoy en UTC — solo vencen las que están antes de hoy
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.streamingSale.updateMany({
      where: {
        status: SaleStatus.ACTIVE,
        cutoffDate: { lt: startOfToday }, // vencida = antes de hoy
      },
      data: {
        status: SaleStatus.EXPIRED,
        renewalStatus: RenewalMessageStatus.PENDING,
      },
    });

    if (result.count > 0) {
      this.logger.log(`${result.count} ventas marcadas como EXPIRED`);
    }
  }

  private async markPendingRenewal() {
    const now = new Date();

    // inicio y fin de hoy en UTC
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const todayEnd = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );

    // Ventas que vencen hoy → PENDING
    const pendingResult = await this.prisma.streamingSale.updateMany({
      where: {
        status: SaleStatus.ACTIVE,
        cutoffDate: { gte: todayStart, lt: todayEnd },
        renewalStatus: RenewalMessageStatus.NOT_APPLICABLE,
      },
      data: { renewalStatus: RenewalMessageStatus.PENDING },
    });

    if (pendingResult.count > 0) {
      this.logger.log(
        `${pendingResult.count} ventas marcadas como PENDING renovación`,
      );
    }

    // Ventas ACTIVE con cutoffDate futura que quedaron en PENDING por error → NOT_APPLICABLE
    const resetResult = await this.prisma.streamingSale.updateMany({
      where: {
        status: SaleStatus.ACTIVE,
        cutoffDate: { gte: todayEnd }, // futuro = desde mañana en adelante
        renewalStatus: RenewalMessageStatus.PENDING,
      },
      data: { renewalStatus: RenewalMessageStatus.NOT_APPLICABLE },
    });

    if (resetResult.count > 0) {
      this.logger.log(
        `${resetResult.count} ventas reseteadas a NOT_APPLICABLE`,
      );
    }
  }
}

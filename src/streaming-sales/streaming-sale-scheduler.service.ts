import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { RenewalMessageStatus, SaleStatus } from '@prisma/client';

@Injectable()
export class StreamingSaleSchedulerService {
  private readonly logger = new Logger(StreamingSaleSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 5 * * *') // 05:00 UTC = 00:00 Ecuador (UTC-5)
  async runDailyTasks() {
    await this.markExpiredSales();
    await this.releaseOrphanProfiles();
    await this.markPendingRenewal();
  }

  // Ventas ACTIVE cuya cutoffDate ya pasó → EXPIRED
  // Solo aplica a cuentas ACTIVE — las de cuentas EXPIRED/INACTIVE
  // las pausa el StreamingAccountSchedulerService
  async markExpiredSales() {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.streamingSale.updateMany({
      where: {
        status: SaleStatus.ACTIVE,
        cutoffDate: { lt: startOfToday },
        account: { status: 'ACTIVE' }, // ← solo cuentas activas
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

  // Perfiles SOLD sin venta ACTIVE ni PAUSED → AVAILABLE
  // Cubre ventas que expiraron y dejaron el perfil huérfano
  async releaseOrphanProfiles() {
    const soldProfiles = await this.prisma.accountProfile.findMany({
      where: {
        status: 'SOLD',
        account: { status: 'ACTIVE' }, // ← solo cuentas activas, las demás las maneja el otro scheduler
      },
      select: {
        id: true,
        sales: {
          where: { status: { in: [SaleStatus.ACTIVE, SaleStatus.PAUSED] } },
          select: { id: true },
          take: 1,
        },
      },
    });

    const orphanIds = soldProfiles
      .filter((p) => p.sales.length === 0)
      .map((p) => p.id);

    if (orphanIds.length > 0) {
      await this.prisma.accountProfile.updateMany({
        where: { id: { in: orphanIds } },
        data: { status: 'AVAILABLE' },
      });
      this.logger.log(`${orphanIds.length} perfiles liberados a AVAILABLE`);
    }
  }

  private async markPendingRenewal() {
    const now = new Date();
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

    // Ventas futuras que quedaron en PENDING por error → NOT_APPLICABLE
    const resetResult = await this.prisma.streamingSale.updateMany({
      where: {
        status: SaleStatus.ACTIVE,
        cutoffDate: { gte: todayEnd },
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

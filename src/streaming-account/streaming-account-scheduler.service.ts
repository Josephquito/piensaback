import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { SaleStatus, StreamingAccountStatus } from '@prisma/client';

@Injectable()
export class StreamingAccountSchedulerService {
  private readonly logger = new Logger(StreamingAccountSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyTasks() {
    await this.markExpiredAccounts();
    await this.pauseSalesOfExpiredAccounts();
    await this.blockAvailableProfilesOfExpiredAccounts();
  }

  // 1) Cuentas ACTIVE cuya cutoffDate ya pasó → EXPIRED
  private async markExpiredAccounts() {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.streamingAccount.updateMany({
      where: {
        status: StreamingAccountStatus.ACTIVE,
        cutoffDate: { lt: startOfToday },
      },
      data: { status: StreamingAccountStatus.EXPIRED },
    });

    if (result.count > 0) {
      this.logger.log(`${result.count} cuentas marcadas como EXPIRED`);
    }
  }

  // 2) Ventas ACTIVE en cuentas EXPIRED/INACTIVE → PAUSED
  // Las ventas de cuentas activas las maneja StreamingSaleSchedulerService
  private async pauseSalesOfExpiredAccounts() {
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const activeSales = await this.prisma.streamingSale.findMany({
      where: {
        status: SaleStatus.ACTIVE,
        account: {
          status: {
            in: [
              StreamingAccountStatus.EXPIRED,
              StreamingAccountStatus.INACTIVE,
            ],
          },
        },
      },
      select: {
        id: true,
        cutoffDate: true,
        salePrice: true,
        daysAssigned: true,
      },
    });

    for (const sale of activeSales) {
      const cutoff = new Date(sale.cutoffDate);
      cutoff.setUTCHours(0, 0, 0, 0);
      const pausedDaysLeft = Math.max(
        0,
        Math.ceil(
          (cutoff.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );

      const salePrice = sale.salePrice.toNumber();

      const daysAssigned = sale.daysAssigned ?? 1;
      const creditAmount = (
        (salePrice / daysAssigned) *
        pausedDaysLeft
      ).toFixed(4);

      await this.prisma.streamingSale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.PAUSED,
          pausedAt: new Date(),
          pausedDaysLeft,
          creditAmount,
        },
      });
    }

    if (activeSales.length > 0) {
      this.logger.log(
        `${activeSales.length} ventas pausadas por cuenta expirada/inactiva`,
      );
    }
  }

  // 3) Perfiles AVAILABLE en cuentas EXPIRED/INACTIVE → BLOCKED
  // No se pueden vender perfiles de cuentas que no están activas
  private async blockAvailableProfilesOfExpiredAccounts() {
    const result = await this.prisma.accountProfile.updateMany({
      where: {
        status: 'AVAILABLE',
        account: {
          status: {
            in: [
              StreamingAccountStatus.EXPIRED,
              StreamingAccountStatus.INACTIVE,
            ],
          },
        },
      },
      data: { status: 'BLOCKED' },
    });

    if (result.count > 0) {
      this.logger.log(`${result.count} perfiles bloqueados`);
    }
  }
}

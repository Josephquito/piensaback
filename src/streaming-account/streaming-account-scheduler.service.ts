import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { StreamingAccountStatus } from '@prisma/client';

@Injectable()
export class StreamingAccountSchedulerService {
  private readonly logger = new Logger(StreamingAccountSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Corre todos los días a medianoche
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markExpiredAccounts() {
    // inicio del día de mañana en UTC — todo lo que venció antes de hoy
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const result = await this.prisma.streamingAccount.updateMany({
      where: {
        status: {
          in: [StreamingAccountStatus.ACTIVE, StreamingAccountStatus.INACTIVE],
        },
        cutoffDate: { lt: startOfToday }, // vencida = cutoffDate antes de hoy
      },
      data: { status: StreamingAccountStatus.EXPIRED },
    });

    if (result.count > 0) {
      this.logger.log(`${result.count} cuentas marcadas como EXPIRED`);
    }
  }
}

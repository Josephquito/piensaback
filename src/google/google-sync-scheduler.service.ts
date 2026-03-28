import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleSyncService } from './google-sync.service';

@Injectable()
export class GoogleSyncSchedulerService {
  private readonly logger = new Logger(GoogleSyncSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleSync: GoogleSyncService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async runDailyGoogleSync() {
    this.logger.log('Iniciando sync automático de Google Contacts...');

    // Obtener todas las empresas con Google conectado
    const companies = await this.prisma.company.findMany({
      where: { googleConnected: true },
      select: { id: true, name: true },
    });

    if (companies.length === 0) {
      this.logger.log('No hay empresas con Google conectado.');
      return;
    }

    this.logger.log(`Sincronizando ${companies.length} empresa(s)...`);

    for (const company of companies) {
      try {
        const result = await this.googleSync.syncAll(company.id);
        this.logger.log(
          `[${company.name}] importados: ${result.imported}, exportados: ${result.exported}, actualizados: ${result.updated}`,
        );
      } catch (e: any) {
        this.logger.error(`[${company.name}] Error en sync: ${e?.message}`);
      }
    }

    this.logger.log('Sync automático de Google Contacts completado.');
  }
}

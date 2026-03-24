import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { parseBuffer, groupByAccount } from './helpers/csv-parser.helper';
import { buildCustomerIndex } from './helpers/customer-index.helper';
import {
  AccountImporterService,
  ImportWarning,
  ImportSkip,
} from './account-importer.service';
import { getImportTemplate } from './helpers/template-generator.helper';

export interface ImportResult {
  platform: string;
  imported: number;
  skipped: ImportSkip[];
  warnings: ImportWarning[];
}

export interface ImportEvent {
  type: 'progress' | 'warning' | 'skipped' | 'done';
  platform?: string;
  email?: string;
  profileNo?: number;
  message: string;
  imported?: number;
  total?: number;
}

@Injectable()
export class StreamingImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accountImporter: AccountImporterService,
  ) {}

  // ================================================================
  // Plantilla descargable
  // ================================================================
  getTemplate(): Buffer {
    return getImportTemplate();
  }

  // ================================================================
  // Importación batch (retorna resultados al finalizar)
  // ================================================================
  async importFromBuffer(
    buffer: Buffer,
    companyId: number,
  ): Promise<ImportResult[]> {
    const byPlatform = parseBuffer(buffer);
    const customerIndex = await buildCustomerIndex(this.prisma, companyId);
    const results: ImportResult[] = [];

    for (const [platformName, platformRows] of byPlatform) {
      const result = await this.processPlatform(
        platformName,
        platformRows,
        companyId,
        customerIndex,
      );
      results.push(result);
    }

    return results;
  }

  // ================================================================
  // Importación SSE (emite eventos en tiempo real)
  // ================================================================
  importFromBufferStream(
    buffer: Buffer,
    companyId: number,
  ): Observable<ImportEvent> {
    return new Observable((subscriber) => {
      (async () => {
        try {
          const byPlatform = parseBuffer(buffer);
          const customerIndex = await buildCustomerIndex(
            this.prisma,
            companyId,
          );

          // Total de grupos para calcular progreso
          let totalGroups = 0;
          for (const rows of byPlatform.values()) {
            totalGroups += groupByAccount(rows).length;
          }

          let totalImported = 0;

          for (const [platformName, platformRows] of byPlatform) {
            const normalizedName = this.normalizePlatformName(platformName);
            const platform = await this.upsertPlatform(
              normalizedName,
              companyId,
            );
            const groups = groupByAccount(platformRows);

            for (const group of groups) {
              try {
                const warnings = await this.accountImporter.importAccount(
                  group,
                  platform.id,
                  companyId,
                  customerIndex,
                );
                totalImported++;

                subscriber.next({
                  type: 'progress',
                  platform: normalizedName,
                  email: group.email,
                  message: `✓ ${group.email} importada`,
                  imported: totalImported,
                  total: totalGroups,
                });

                for (const w of warnings) {
                  subscriber.next({
                    type: 'warning',
                    platform: normalizedName,
                    email: w.email,
                    profileNo: w.profileNo,
                    message: `⚠ ${w.email} · perfil #${w.profileNo} → ${w.reason}`,
                  });
                }
              } catch (e: any) {
                subscriber.next({
                  type: 'skipped',
                  platform: normalizedName,
                  email: group.email,
                  message: `✕ ${group.email} → ${e?.message ?? 'Error desconocido'}`,
                });
              }
            }
          }

          subscriber.next({
            type: 'done',
            message: `Importación completada. ${totalImported} de ${totalGroups} cuentas importadas.`,
            imported: totalImported,
            total: totalGroups,
          });

          subscriber.complete();
        } catch (e: any) {
          subscriber.error(e);
        }
      })();
    });
  }

  // ================================================================
  // Helpers privados del orquestador
  // ================================================================
  private async processPlatform(
    platformName: string,
    platformRows: any[],
    companyId: number,
    customerIndex: any,
  ): Promise<ImportResult> {
    const result: ImportResult = {
      platform: platformName,
      imported: 0,
      skipped: [],
      warnings: [],
    };

    const normalizedName = this.normalizePlatformName(platformName);
    const platform = await this.upsertPlatform(normalizedName, companyId);
    const groups = groupByAccount(platformRows);

    for (const group of groups) {
      try {
        const warnings = await this.accountImporter.importAccount(
          group,
          platform.id,
          companyId,
          customerIndex,
        );
        result.imported++;
        result.warnings.push(...warnings);
      } catch (e: any) {
        result.skipped.push({
          email: group.email,
          reason: e?.message ?? 'Error desconocido',
        });
      }
    }

    return result;
  }

  private normalizePlatformName(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private async upsertPlatform(
    normalizedName: string,
    companyId: number,
  ): Promise<{ id: number }> {
    return this.prisma.streamingPlatform.upsert({
      where: { companyId_name: { companyId, name: normalizedName } },
      create: { companyId, name: normalizedName, active: true },
      update: {},
      select: { id: true },
    });
  }
}

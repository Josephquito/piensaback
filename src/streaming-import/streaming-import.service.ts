import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import {
  KardexRefType,
  RenewalMessageStatus,
  SaleStatus,
  StreamingAccountStatus,
  Prisma,
} from '@prisma/client';
import { Observable } from 'rxjs';

const CSV_HEADERS = [
  'platform',
  'email',
  'password',
  'purchase_date',
  'duration_days',
  'total_cost',
  'supplier_name',
  'supplier_contact',
  'profile_no',
  'sale_price',
  'sale_date',
  'sale_duration_days',
  'customer_name',
  'label_name',
  'label_color',
];

interface ImportRow {
  platform: string;
  email: string;
  password: string;
  purchase_date: string;
  duration_days: string;
  total_cost: string;
  supplier_name: string;
  supplier_contact: string;
  profile_no: string;
  sale_price: string;
  sale_date: string;
  sale_duration_days: string;
  customer_name: string;
  label_name: string;
  label_color: string;
}

interface ProfileData {
  profileNo: number;
  salePrice?: Prisma.Decimal;
  saleDate?: Date;
  saleDurationDays?: number;
  customerName?: string;
  labelName?: string;
  labelColor?: string;
}

interface AccountGroup {
  platform: string;
  email: string;
  password: string;
  purchaseDate: Date;
  durationDays: number;
  totalCost: Prisma.Decimal;
  supplierName: string;
  supplierContact: string;
  profiles: ProfileData[];
}

export interface ImportResult {
  platform: string;
  imported: number;
  skipped: { email: string; reason: string }[];
  warnings: { email: string; profileNo: number; reason: string }[];
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
  ) {}

  private parseDecimalValue(value: string): Prisma.Decimal {
    // Quitar $ y espacios, normalizar coma decimal → punto
    const normalized = value
      .trim()
      .replace(/\$/g, '')
      .replace(/\s/g, '')
      .replace(',', '.');
    return new Prisma.Decimal(normalized || '0');
  }

  // =========================
  // Entry point
  // =========================
  async importFromBuffer(
    buffer: Buffer,
    companyId: number,
  ): Promise<ImportResult[]> {
    const text = buffer
      .toString('utf-8')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    const lines = text.split('\n').filter((l) => l.trim() !== '');

    if (lines.length < 2)
      throw new Error('El CSV debe tener cabecera y al menos una fila.');

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const missingHeaders = CSV_HEADERS.filter((h) => !headers.includes(h));
    if (missingHeaders.length > 0)
      throw new Error(
        `Faltan columnas: ${missingHeaders.join(', ')}. Usa la plantilla del sistema.`,
      );

    const rows: ImportRow[] = lines.slice(1).map((line) => {
      const values = this.parseCsvLine(line);
      const row: any = {};
      headers.forEach((h, i) => {
        row[h] = values[i]?.trim() ?? '';
      });
      return row as ImportRow;
    });

    // Agrupar filas por plataforma
    const byPlatform = new Map<string, ImportRow[]>();
    for (const row of rows) {
      const p = row.platform?.trim();
      if (!p) continue;
      if (!byPlatform.has(p)) byPlatform.set(p, []);
      byPlatform.get(p)!.push(row);
    }

    const results: ImportResult[] = [];
    for (const [platformName, platformRows] of byPlatform) {
      const result = await this.processRows(
        platformRows,
        platformName,
        companyId,
      );
      results.push(result);
    }

    return results;
  }

  // Plantilla descargable
  getTemplate(): Buffer {
    const example = [
      'Netflix',
      'correo@ejemplo.com',
      'clave123',
      '2026-03-01',
      '30',
      '14.00',
      'Proveedor X',
      '0999999999',
      '1',
      '4.00',
      '2026-03-21',
      '30',
      'Juan Pérez',
      'VIP',
      '#22c55e',
    ];
    return Buffer.from(
      [CSV_HEADERS.join(','), example.join(',')].join('\n'),
      'utf-8',
    );
  }

  // =========================
  // Procesar filas
  // =========================
  private async processRows(
    rows: ImportRow[],
    platformName: string,
    companyId: number,
  ): Promise<ImportResult> {
    const result: ImportResult = {
      platform: platformName,
      imported: 0,
      skipped: [],
      warnings: [],
    };

    const normalizedName = platformName
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const platform = await this.prisma.streamingPlatform.upsert({
      where: { companyId_name: { companyId, name: normalizedName } },
      create: { companyId, name: normalizedName, active: true },
      update: {},
      select: { id: true },
    });

    // Pre-cargar clientes igual que en el stream
    const allCustomers = await this.prisma.customer.findMany({
      where: { companyId },
      select: { id: true, name: true, contact: true },
    });
    const customerByName = new Map<string, number>();
    for (const c of allCustomers) {
      customerByName.set(c.name.toLowerCase().trim(), c.id);
    }
    const customerByContact = new Map<string, number>();
    for (const c of allCustomers) {
      if (!c.contact) continue;
      const normalized = this.normalizePhone(c.contact);
      customerByContact.set(normalized, c.id);
      customerByContact.set('0' + normalized.slice(3), c.id);
      customerByContact.set('+' + normalized, c.id);
      customerByContact.set('+593' + normalized.slice(3), c.id);
      customerByContact.set(c.contact.trim().toLowerCase(), c.id);
    }

    const groups = this.groupByAccount(rows);

    for (const group of groups) {
      try {
        const warnings = await this.importAccount(
          group,
          platform.id,
          companyId,
          customerByName,
          customerByContact,
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

  // =========================
  // Agrupar filas por cuenta
  // =========================
  private groupByAccount(rows: ImportRow[]): AccountGroup[] {
    const map = new Map<string, AccountGroup>();

    for (const row of rows) {
      const email = row.email?.trim();
      if (!email) continue;

      if (!map.has(email)) {
        map.set(email, {
          platform: row.platform?.trim() ?? '',
          email,
          password: row.password?.trim() ?? '',
          purchaseDate: this.parseDate(row.purchase_date),
          durationDays: Number(row.duration_days),
          totalCost: this.parseDecimalValue(row.total_cost),
          supplierName: row.supplier_name?.trim() ?? '',
          supplierContact: row.supplier_contact?.trim() ?? '',
          profiles: [],
        });
      }

      const group = map.get(email)!;

      // Si esta fila trae supplier_contact y el grupo aún no lo tiene
      if (!group.supplierContact && row.supplier_contact?.trim()) {
        group.supplierContact = row.supplier_contact.trim();
      }

      const profileNo = Number(row.profile_no);
      if (!profileNo) continue;

      const hasSale =
        !!row.sale_price?.trim() &&
        !!row.sale_date?.trim() &&
        !!row.customer_name?.trim() &&
        !!row.sale_duration_days?.trim();

      group.profiles.push({
        profileNo,
        salePrice: hasSale ? this.parseDecimalValue(row.sale_price) : undefined,
        saleDate: hasSale ? this.parseDate(row.sale_date) : undefined,
        saleDurationDays: hasSale ? Number(row.sale_duration_days) : undefined,
        customerName: hasSale ? row.customer_name.trim() : undefined,
        labelName: row.label_name?.trim() || undefined,
        labelColor: row.label_color?.trim() || undefined,
      });
    }

    return Array.from(map.values());
  }

  // =========================
  // Importar una cuenta
  // =========================
  private async importAccount(
    group: AccountGroup,
    platformId: number,
    companyId: number,
    customerByName: Map<string, number>,
    customerByContact: Map<string, number>,
  ): Promise<{ email: string; profileNo: number; reason: string }[]> {
    const warnings: { email: string; profileNo: number; reason: string }[] = [];

    if (!group.password) throw new Error('Contraseña vacía.');
    if (!group.purchaseDate || isNaN(group.purchaseDate.getTime()))
      throw new Error('Fecha de compra inválida.');
    if (!group.durationDays || group.durationDays <= 0)
      throw new Error('duration_days inválido.');
    if (group.totalCost.lessThan(0)) throw new Error('total_cost inválido.');
    if (!group.supplierName) throw new Error('Proveedor vacío.');
    if (!group.profiles.length) throw new Error('Sin perfiles.');

    const cutoffDate = this.addDays(group.purchaseDate, group.durationDays);
    const profilesTotal = group.profiles.length;
    const dailyCost =
      profilesTotal > 0 && group.durationDays > 0
        ? group.totalCost.div(profilesTotal).div(group.durationDays)
        : new Prisma.Decimal(0);

    await this.prisma.$transaction(
      async (tx) => {
        // 1) Upsert proveedor
        const supplier = await tx.supplier.upsert({
          where: { companyId_name: { companyId, name: group.supplierName } },
          create: {
            companyId,
            name: group.supplierName,
            contact: group.supplierContact || '',
          },
          update: {},
          select: { id: true },
        });

        // 2) Cuenta: reactivar DELETED, usar existente ACTIVE, o crear nueva
        const deleted = await tx.streamingAccount.findFirst({
          where: {
            companyId,
            platformId,
            email: group.email,
            status: StreamingAccountStatus.DELETED,
          },
          select: { id: true },
        });

        const existing = await tx.streamingAccount.findFirst({
          where: {
            companyId,
            platformId,
            email: group.email,
            status: { not: StreamingAccountStatus.DELETED },
          },
          select: { id: true, profilesTotal: true },
        });

        let accountId: number;
        let isNew = false;

        if (deleted) {
          await tx.streamingAccount.update({
            where: { id: deleted.id },
            data: {
              supplierId: supplier.id,
              password: group.password,
              profilesTotal,
              durationDays: group.durationDays,
              purchaseDate: group.purchaseDate,
              cutoffDate,
              totalCost: group.totalCost,
              notes: null,
              status: StreamingAccountStatus.ACTIVE,
            },
          });
          await tx.accountProfile.deleteMany({
            where: { accountId: deleted.id },
          });
          accountId = deleted.id;
          isNew = true;
        } else if (existing) {
          accountId = existing.id;
          isNew = false;
        } else {
          const account = await tx.streamingAccount.create({
            data: {
              companyId,
              platformId,
              supplierId: supplier.id,
              email: group.email,
              password: group.password,
              profilesTotal,
              durationDays: group.durationDays,
              purchaseDate: group.purchaseDate,
              cutoffDate,
              totalCost: group.totalCost,
              notes: null,
              status: StreamingAccountStatus.ACTIVE,
            },
            select: { id: true },
          });
          accountId = account.id;
          isNew = true;
        }

        // 3) Balance proveedor y kardex solo si es cuenta nueva o reactivada
        if (isNew) {
          await tx.supplier.update({
            where: { id: supplier.id },
            data: { balance: { decrement: group.totalCost } },
          });
          await this.kardex.registerIn(
            {
              companyId,
              platformId,
              qty: profilesTotal * group.durationDays,
              unitCost: dailyCost,
              refType: KardexRefType.ACCOUNT_PURCHASE,
              accountId,
            },
            tx,
          );
        }

        // 4) Crear solo los perfiles que no existen aún
        const existingProfiles = await tx.accountProfile.findMany({
          where: { accountId },
          select: { profileNo: true },
        });
        const existingProfileNos = new Set(
          existingProfiles.map((p) => p.profileNo),
        );
        const profilesToCreate = group.profiles.filter(
          (p) => !existingProfileNos.has(p.profileNo),
        );
        if (profilesToCreate.length > 0) {
          await tx.accountProfile.createMany({
            data: profilesToCreate.map((p) => ({
              accountId,
              profileNo: p.profileNo,
              status: 'AVAILABLE' as const,
            })),
          });
        }

        // 5) Ventas y etiquetas por perfil
        for (const p of group.profiles) {
          const profile = await tx.accountProfile.findFirst({
            where: { accountId, profileNo: p.profileNo },
            select: { id: true },
          });
          if (!profile) continue;

          // Upsert etiqueta — aplica SIEMPRE aunque el perfil esté vacío
          if (p.labelName) {
            const label = await tx.profileLabel.upsert({
              where: {
                companyId_platformId_name: {
                  companyId,
                  platformId,
                  name: p.labelName,
                },
              },
              create: {
                companyId,
                platformId,
                name: p.labelName,
                color: p.labelColor || '#6b7280',
              },
              update: {},
              select: { id: true },
            });
            await tx.accountProfile.update({
              where: { id: profile.id },
              data: { labelId: label.id },
            });
          }

          if (
            !p.salePrice ||
            !p.saleDate ||
            !p.customerName ||
            !p.saleDurationDays
          )
            continue;

          // ── BUSCAR CLIENTE EN MEMORIA ──────────────────────────────
          const normalizedInput = this.normalizePhone(p.customerName);
          const nameVariants = [p.customerName.toLowerCase().trim()];
          const clienteMatch = p.customerName.match(/^Cliente\s+(\d+)$/i);
          if (clienteMatch) {
            const num = parseInt(clienteMatch[1], 10);
            nameVariants.push(`cliente ${num}`);
            nameVariants.push(`cliente ${String(num).padStart(3, '0')}`);
            nameVariants.push(`cliente ${String(num).padStart(4, '0')}`);
          }

          let customerId: number | undefined;

          // Buscar por nombre primero
          for (const variant of nameVariants) {
            if (customerByName.has(variant)) {
              customerId = customerByName.get(variant);
              break;
            }
          }

          // Si no encontró por nombre, buscar por contacto
          if (!customerId) {
            customerId =
              customerByContact.get(normalizedInput) ??
              customerByContact.get('0' + normalizedInput.slice(3)) ??
              customerByContact.get('+' + normalizedInput) ??
              customerByContact.get('+593' + normalizedInput.slice(3)) ??
              customerByContact.get(p.customerName.trim().toLowerCase());
          }
          // ────────────────────────────────────────────────────────────

          if (!customerId) {
            warnings.push({
              email: group.email,
              profileNo: p.profileNo,
              reason: `Cliente '${p.customerName}' no encontrado, perfil queda AVAILABLE.`,
            });
            continue;
          }

          const saleCutoffDate = this.addDays(p.saleDate, p.saleDurationDays);

          const { unitCost: saleDailyCost } = await this.kardex.registerOut(
            {
              companyId,
              platformId,
              qty: p.saleDurationDays,
              refType: KardexRefType.PROFILE_SALE,
              accountId,
            },
            tx,
          );

          const costAtSale = saleDailyCost.mul(p.saleDurationDays);

          await tx.accountProfile.update({
            where: { id: profile.id },
            data: { status: 'SOLD' },
          });

          const sale = await tx.streamingSale.create({
            data: {
              companyId,
              platformId,
              accountId,
              profileId: profile.id,
              customerId,
              salePrice: p.salePrice,
              saleDate: p.saleDate,
              daysAssigned: p.saleDurationDays,
              cutoffDate: saleCutoffDate,
              costAtSale,
              dailyCost: saleDailyCost,
              notes: null,
              status: SaleStatus.ACTIVE,
              renewalStatus: RenewalMessageStatus.NOT_APPLICABLE,
            },
            select: { id: true },
          });

          await tx.customer.update({
            where: { id: customerId },
            data: { lastPurchaseAt: p.saleDate },
          });

          await tx.kardexMovement.updateMany({
            where: {
              companyId,
              accountId,
              refType: KardexRefType.PROFILE_SALE,
              type: 'OUT',
              saleId: null,
            },
            data: { saleId: sale.id },
          });
        }
      },
      {
        timeout: 30000,
        maxWait: 10000,
      },
    );

    return warnings;
  }

  // =========================
  // Utils
  // =========================
  private parseDate(value: string): Date {
    if (!value?.trim()) return new Date('invalid');

    const v = value.trim();

    // YYYY-MM-DD → estándar, funciona directo
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      return new Date(`${v}T00:00:00Z`);
    }

    // d/m/yyyy o d/m/yy → "6/3/2026", "20/3/2026"
    const slashDMY = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (slashDMY) {
      const [, d, m, y] = slashDMY;
      const year = y.length === 2 ? `20${y}` : y;
      return new Date(
        `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`,
      );
    }

    // d-m-yyyy → "20-3-2026"
    const dashDMY = v.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (dashDMY) {
      const [, d, m, y] = dashDMY;
      const year = y.length === 2 ? `20${y}` : y;
      return new Date(
        `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`,
      );
    }

    // d-m o d/m sin año → "7-3", "23-2", "20-3" → asume año actual
    const dmOnly = v.match(/^(\d{1,2})[-\/](\d{1,2})$/);
    if (dmOnly) {
      const [, d, m] = dmOnly;
      const year = new Date().getUTCFullYear();
      return new Date(
        `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T00:00:00Z`,
      );
    }

    // Fallback
    const fallback = new Date(v);
    return isNaN(fallback.getTime()) ? new Date('invalid') : fallback;
  }

  private normalizePhone(value: string): string {
    // Quitar todo excepto dígitos
    const digits = value.replace(/\D/g, '');

    // Convertir a formato con código de país 593
    if (digits.startsWith('593')) return digits; // 593999...  → 593999...
    if (digits.startsWith('0')) return '593' + digits.slice(1); // 0999...    → 593999...
    return digits; // cualquier otro → tal cual
  }

  private addDays(date: Date, days: number): Date {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate() + days,
      ),
    );
  }

  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  importFromBufferStream(
    buffer: Buffer,
    companyId: number,
  ): Observable<ImportEvent> {
    return new Observable((subscriber) => {
      (async () => {
        try {
          const text = buffer
            .toString('utf-8')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n');

          const lines = text.split('\n').filter((l) => l.trim() !== '');

          if (lines.length < 2) {
            subscriber.error(
              new Error('El CSV debe tener cabecera y al menos una fila.'),
            );
            return;
          }

          const headers = lines[0]
            .split(',')
            .map((h) => h.trim().toLowerCase());
          const missingHeaders = CSV_HEADERS.filter(
            (h) => !headers.includes(h),
          );
          if (missingHeaders.length > 0) {
            subscriber.error(
              new Error(`Faltan columnas: ${missingHeaders.join(', ')}`),
            );
            return;
          }

          const rows: ImportRow[] = lines.slice(1).map((line) => {
            const values = this.parseCsvLine(line);
            const row: any = {};
            headers.forEach((h, i) => {
              row[h] = values[i]?.trim() ?? '';
            });
            return row as ImportRow;
          });

          // Agrupar por plataforma
          const byPlatform = new Map<string, ImportRow[]>();
          for (const row of rows) {
            const p = row.platform?.trim();
            if (!p) continue;
            if (!byPlatform.has(p)) byPlatform.set(p, []);
            byPlatform.get(p)!.push(row);
          }

          // ── PRE-CARGAR CLIENTES EN MEMORIA ──────────────────────────
          // Una sola query para todos los clientes de la empresa
          // en lugar de buscar uno por uno dentro de cada transacción
          const allCustomers = await this.prisma.customer.findMany({
            where: { companyId },
            select: { id: true, name: true, contact: true },
          });

          // Índice por nombre normalizado
          const customerByName = new Map<string, number>();
          for (const c of allCustomers) {
            customerByName.set(c.name.toLowerCase().trim(), c.id);
          }

          // Índice por contacto normalizado (teléfono)
          const customerByContact = new Map<string, number>();
          for (const c of allCustomers) {
            if (!c.contact) continue;
            const normalized = this.normalizePhone(c.contact);
            customerByContact.set(normalized, c.id);
            // también indexar con 0 delante y con +
            customerByContact.set('0' + normalized.slice(3), c.id);
            customerByContact.set('+' + normalized, c.id);
            customerByContact.set('+593' + normalized.slice(3), c.id);
            customerByContact.set(c.contact.trim().toLowerCase(), c.id);
          }
          // ────────────────────────────────────────────────────────────

          let totalImported = 0;
          let totalGroups = 0;
          for (const rows of byPlatform.values()) {
            totalGroups += this.groupByAccount(rows).length;
          }

          for (const [platformName, platformRows] of byPlatform) {
            const normalizedName = platformName
              .trim()
              .toLowerCase()
              .replace(/\b\w/g, (c) => c.toUpperCase());

            const platform = await this.prisma.streamingPlatform.upsert({
              where: { companyId_name: { companyId, name: normalizedName } },
              create: { companyId, name: normalizedName, active: true },
              update: {},
              select: { id: true },
            });

            const groups = this.groupByAccount(platformRows);

            for (const group of groups) {
              try {
                const warnings = await this.importAccount(
                  group,
                  platform.id,
                  companyId,
                  customerByName,
                  customerByContact,
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
}

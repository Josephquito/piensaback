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

@Injectable()
export class StreamingImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
  ) {}

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

    // Upsert plataforma
    const platform = await this.prisma.streamingPlatform.upsert({
      where: { companyId_name: { companyId, name: normalizedName } },
      create: { companyId, name: normalizedName, active: true },
      update: {},
      select: { id: true },
    });

    const groups = this.groupByAccount(rows);

    for (const group of groups) {
      try {
        const warnings = await this.importAccount(
          group,
          platform.id,
          companyId,
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
          totalCost: new Prisma.Decimal(row.total_cost || '0'),
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
        salePrice: hasSale ? new Prisma.Decimal(row.sale_price) : undefined,
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

    await this.prisma.$transaction(async (tx) => {
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

      // 2) Cuenta: reactivar DELETED o crear nueva
      const deleted = await tx.streamingAccount.findFirst({
        where: {
          companyId,
          platformId,
          email: group.email,
          status: StreamingAccountStatus.DELETED,
        },
        select: { id: true },
      });

      let accountId: number;

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
      } else {
        const existing = await tx.streamingAccount.findFirst({
          where: { companyId, platformId, email: group.email },
          select: { id: true },
        });
        if (existing) throw new Error(`Cuenta ya existe: ${group.email}`);

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
      }

      // 3) Balance proveedor
      await tx.supplier.update({
        where: { id: supplier.id },
        data: { balance: { decrement: group.totalCost } },
      });

      // 4) Kardex entrada
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

      // 5) Crear perfiles
      await tx.accountProfile.createMany({
        data: group.profiles.map((p) => ({
          accountId,
          profileNo: p.profileNo,
          status: 'AVAILABLE' as const,
        })),
      });

      // 6) Ventas por perfil
      for (const p of group.profiles) {
        if (
          !p.salePrice ||
          !p.saleDate ||
          !p.customerName ||
          !p.saleDurationDays
        )
          continue;

        // Buscar cliente
        const customer = await tx.customer.findFirst({
          where: {
            companyId,
            name: { equals: p.customerName, mode: 'insensitive' },
          },
          select: { id: true },
        });

        if (!customer) {
          warnings.push({
            email: group.email,
            profileNo: p.profileNo,
            reason: `Cliente '${p.customerName}' no encontrado, perfil queda AVAILABLE.`,
          });
          continue;
        }

        // Upsert etiqueta
        let labelId: number | null = null;
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
          labelId = label.id;
        }

        // Buscar perfil recién creado
        const profile = await tx.accountProfile.findFirst({
          where: { accountId, profileNo: p.profileNo },
          select: { id: true },
        });
        if (!profile) continue;

        // Asignar etiqueta
        if (labelId) {
          await tx.accountProfile.update({
            where: { id: profile.id },
            data: { labelId },
          });
        }

        const saleCutoffDate = this.addDays(p.saleDate, p.saleDurationDays);

        // Kardex salida
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

        // Marcar perfil SOLD
        await tx.accountProfile.update({
          where: { id: profile.id },
          data: { status: 'SOLD' },
        });

        // Crear venta
        const sale = await tx.streamingSale.create({
          data: {
            companyId,
            platformId,
            accountId,
            profileId: profile.id,
            customerId: customer.id,
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

        // Actualizar lastPurchaseAt
        await tx.customer.update({
          where: { id: customer.id },
          data: { lastPurchaseAt: p.saleDate },
        });

        // Vincular kardex a la venta
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
    });

    return warnings;
  }

  // =========================
  // Utils
  // =========================
  private parseDate(value: string): Date {
    if (!value?.trim()) return new Date('invalid');
    const d = new Date(value.trim());
    return isNaN(d.getTime()) ? new Date('invalid') : d;
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
}

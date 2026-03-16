import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { BaseRole, SaleStatus } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PrismaService } from '../../prisma/prisma.service';
import type { CurrentUserJwt } from '../common/types/current-user-jwt.type';
import { ImportCustomerRowDto } from './dto/import-customer-row.dto';
import {
  CustomerQueryDto,
  CustomerSortBy,
  CustomerStatusFilter,
  SortOrder,
} from './dto/customer-query.dto';
import { Prisma } from '@prisma/client';

const CSV_HEADERS = [
  'name',
  'contact',
  'source',
  'sourceNote',
  'notes',
  'balance',
];

const EXPORT_HEADERS = [
  'id',
  'name',
  'contact',
  'source',
  'sourceNote',
  'notes',
  'balance',
  'totalSales',
  'customerStatus',
  'lastPurchaseAt',
  'createdAt',
];

@Injectable()
export class CustomersImportExportService {
  constructor(private readonly prisma: PrismaService) {}

  private assertNotEmployee(actor: CurrentUserJwt) {
    if (actor.role === BaseRole.EMPLOYEE) {
      throw new ForbiddenException('EMPLOYEE no puede gestionar clientes.');
    }
  }

  private resolveStatus(
    totalSales: number,
    hasActiveSales: boolean,
  ): CustomerStatusFilter {
    if (totalSales === 0) return CustomerStatusFilter.PROSPECT;
    if (hasActiveSales) return CustomerStatusFilter.ACTIVE;
    return CustomerStatusFilter.INACTIVE;
  }

  private buildWhere(
    companyId: number,
    query: CustomerQueryDto,
  ): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { companyId };

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { contact: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (query.source?.trim()) where.source = query.source;
    if (query.status) {
      switch (query.status) {
        case CustomerStatusFilter.PROSPECT:
          where.sales = { none: {} };
          break;
        case CustomerStatusFilter.ACTIVE:
          where.sales = { some: { status: SaleStatus.ACTIVE } };
          break;
        case CustomerStatusFilter.INACTIVE:
          where.AND = [
            { sales: { some: {} } },
            { sales: { none: { status: SaleStatus.ACTIVE } } },
          ];
          break;
      }
    }
    return where;
  }

  private buildOrderBy(
    query: CustomerQueryDto,
  ): Prisma.CustomerOrderByWithRelationInput[] {
    const dir = query.sortOrder ?? SortOrder.ASC;
    const field = query.sortBy ?? CustomerSortBy.NAME;
    const primary: Prisma.CustomerOrderByWithRelationInput =
      field === CustomerSortBy.LAST_PURCHASE_AT
        ? { lastPurchaseAt: { sort: dir, nulls: 'last' } }
        : { [field]: dir };
    return [primary, { id: 'asc' }];
  }

  // ── Plantilla ─────────────────────────────────────────────────────────────

  getImportTemplate(): Buffer {
    const example = [
      'Juan Pérez',
      '+593999999999',
      'INSTAGRAM',
      '',
      'Cliente VIP',
      '5.00',
    ];
    return Buffer.from(
      [CSV_HEADERS.join(','), example.join(',')].join('\n'),
      'utf-8',
    );
  }

  // ── Exportación ───────────────────────────────────────────────────────────

  async exportCsv(companyId: number, query: CustomerQueryDto): Promise<Buffer> {
    const where = this.buildWhere(companyId, query);
    const orderBy = this.buildOrderBy(query);

    const customers = await this.prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        contact: true,
        source: true,
        sourceNote: true,
        notes: true,
        balance: true,
        lastPurchaseAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { sales: true } },
        sales: {
          where: { status: SaleStatus.ACTIVE },
          select: { id: true },
          take: 1,
        },
      },
      orderBy,
    });

    const rows = customers.map(({ sales, _count, ...c }) => ({
      ...c,
      totalSales: _count.sales,
      customerStatus: this.resolveStatus(_count.sales, sales.length > 0),
    }));

    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [
      EXPORT_HEADERS.join(','),
      ...rows.map((r) =>
        EXPORT_HEADERS.map((h) => escape((r as any)[h])).join(','),
      ),
    ];

    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  // ── Importación ───────────────────────────────────────────────────────────

  async importCsv(buffer: Buffer, companyId: number, actor: CurrentUserJwt) {
    this.assertNotEmployee(actor);

    const text = buffer
      .toString('utf-8')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');
    const lines = text.split('\n').filter((l) => l.trim() !== '');

    if (lines.length < 2) {
      throw new BadRequestException(
        'El CSV debe tener cabecera y al menos una fila de datos.',
      );
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const requiredHeaders = CSV_HEADERS.map((h) => h.toLowerCase());
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Faltan columnas en el CSV: ${missingHeaders.join(', ')}. Usa la plantilla del sistema.`,
      );
    }

    const dataLines = lines.slice(1);
    const errors: { row: number; name: string; errors: string[] }[] = [];
    const validRows: { dto: ImportCustomerRowDto; rowNumber: number }[] = [];

    // 1. Validar todas las filas
    for (let i = 0; i < dataLines.length; i++) {
      const rowNumber = i + 2;
      const values = this.parseCsvLine(dataLines[i]);
      const raw: Record<string, string> = {};
      headers.forEach((h, idx) => {
        raw[h] = values[idx]?.trim() ?? '';
      });

      const dto = plainToInstance(ImportCustomerRowDto, {
        name: raw['name'] || undefined,
        contact: raw['contact'] || undefined,
        source: raw['source'] || undefined,
        sourceNote: raw['sourcenote'] || undefined,
        notes: raw['notes'] || undefined,
        balance: raw['balance'] || undefined,
      });

      const validationErrors = await validate(dto);
      if (validationErrors.length > 0) {
        errors.push({
          row: rowNumber,
          name: raw['name'] ?? '',
          errors: validationErrors.flatMap((e) =>
            Object.values(e.constraints ?? {}),
          ),
        });
      } else {
        validRows.push({ dto, rowNumber });
      }
    }

    // 2. Una query para saber cuáles ya existen
    const namesToImport = validRows.map((r) => r.dto.name.toLowerCase());
    const existing = await this.prisma.customer.findMany({
      where: { companyId, name: { in: namesToImport, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    const existingMap = new Map(
      existing.map((c) => [c.name.toLowerCase(), c.id]),
    );

    const toCreate = validRows.filter(
      (r) => !existingMap.has(r.dto.name.toLowerCase()),
    );
    const toUpdate = validRows.filter((r) =>
      existingMap.has(r.dto.name.toLowerCase()),
    );

    // 3. createMany — 1 sola query
    if (toCreate.length > 0) {
      await this.prisma.customer.createMany({
        data: toCreate.map((r) => ({
          companyId,
          name: r.dto.name,
          contact: r.dto.contact ?? null,
          source: r.dto.source ?? null,
          sourceNote: r.dto.sourceNote ?? null,
          notes: r.dto.notes ?? null,
          balance: r.dto.balance ?? null,
        })),
        skipDuplicates: true,
      });
    }

    // 4. Updates en lotes de 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      await Promise.all(
        toUpdate.slice(i, i + BATCH_SIZE).map((r) =>
          this.prisma.customer.update({
            where: { id: existingMap.get(r.dto.name.toLowerCase())! },
            data: {
              contact: r.dto.contact ?? null,
              source: r.dto.source ?? null,
              sourceNote: r.dto.sourceNote ?? null,
              notes: r.dto.notes ?? null,
              balance: r.dto.balance ?? null,
            },
          }),
        ),
      );
    }

    return {
      ok: errors.length === 0,
      created: toCreate.length,
      updated: toUpdate.length,
      errors,
      total: dataLines.length,
    };
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

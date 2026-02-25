import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ReportSaleStatus,
  StreamingSalesReportQueryDto,
} from './dto/streaming-sales-report.query';

function buildSalesFilters(
  companyId: number,
  q: {
    from?: string;
    to?: string;
    day?: string;
    platformId?: number;
    customerId?: number;
    customerSearch?: string;
    status?: string;
  },
) {
  const where: Prisma.Sql[] = [Prisma.sql`s.company_id = ${companyId}`];

  if (q.status && q.status !== 'ALL') {
    where.push(Prisma.sql`s.status = ${q.status}::"SaleStatus"`);
  }

  if (q.platformId) {
    where.push(Prisma.sql`s.platform_id = ${q.platformId}`);
  }

  if (q.customerId) {
    where.push(Prisma.sql`s.customer_id = ${q.customerId}`);
  }

  if (q.customerSearch?.trim()) {
    where.push(Prisma.sql`c.name ILIKE ${'%' + q.customerSearch.trim() + '%'}`);
  }

  if (q.day) {
    where.push(Prisma.sql`DATE(s.sale_date) = ${q.day}::date`);
  } else {
    if (q.from) where.push(Prisma.sql`s.sale_date >= ${q.from}::date`);
    if (q.to)
      where.push(Prisma.sql`s.sale_date < (${q.to}::date + INTERVAL '1 day')`);
  }

  // ✅ separador como string (para evitar TS2345)
  return Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}`;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private dec(v: Prisma.Decimal | null | undefined) {
    return v ? new Prisma.Decimal(v) : new Prisma.Decimal(0);
  }

  private dayRangeUtc(day: string) {
    const start = new Date(`${day}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()))
      throw new BadRequestException('day inválido.');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  private periodRangeUtc(from: string, to: string) {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('from/to inválidos.');
    }
    if (end < start) throw new BadRequestException('to < from.');
    const endExclusive = new Date(end);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return { start, endExclusive };
  }

  private buildWhere(
    query: StreamingSalesReportQueryDto,
    companyId: number,
  ): Prisma.StreamingSaleWhereInput {
    const where: Prisma.StreamingSaleWhereInput = { companyId };

    // status default ACTIVE
    const status = query.status ?? ReportSaleStatus.ACTIVE;
    if (status !== ReportSaleStatus.ALL) {
      where.status = status as any; // SaleStatus
    }

    if (query.platformId) where.platformId = query.platformId;
    if (query.customerId) where.customerId = query.customerId;

    if (query.customerSearch && query.customerSearch.trim()) {
      where.customer = {
        name: { contains: query.customerSearch.trim(), mode: 'insensitive' },
      };
    }

    if (query.day) {
      const { start, end } = this.dayRangeUtc(query.day);
      where.saleDate = { gte: start, lt: end };
    } else if (query.from || query.to) {
      if (!query.from || !query.to) {
        throw new BadRequestException(
          'Si usas periodo, debes enviar from y to.',
        );
      }
      const { start, endExclusive } = this.periodRangeUtc(query.from, query.to);
      where.saleDate = { gte: start, lt: endExclusive };
    }

    return where;
  }

  // ------------------------------------------------------------------
  // 1) Reporte paginado + profit + totals
  // ------------------------------------------------------------------
  async streamingSalesReport(
    query: StreamingSalesReportQueryDto,
    companyId: number,
  ) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const where = this.buildWhere(query, companyId);

    const [total, rows, sums] = await this.prisma.$transaction([
      this.prisma.streamingSale.count({ where }),
      this.prisma.streamingSale.findMany({
        where,
        orderBy: { saleDate: 'desc' },
        skip,
        take: pageSize,
        include: {
          customer: true,
          platform: true,
          account: true,
          profile: true,
        },
      }),
      this.prisma.streamingSale.aggregate({
        where,
        _sum: { salePrice: true, costAtSale: true },
        _count: { _all: true },
      }),
    ]);

    const revenue = this.dec(sums._sum.salePrice);
    const cost = this.dec(sums._sum.costAtSale);
    const profit = revenue.sub(cost);

    const items = rows.map((r) => {
      const salePrice = new Prisma.Decimal(r.salePrice as any);
      const costAtSale = new Prisma.Decimal(r.costAtSale as any);
      const rowProfit = salePrice.sub(costAtSale);

      return {
        ...r,
        salePrice: salePrice.toFixed(4),
        costAtSale: costAtSale.toFixed(4),
        profit: rowProfit.toFixed(4),
      };
    });

    return {
      filters: {
        day: query.day ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        platformId: query.platformId ?? null,
        customerId: query.customerId ?? null,
        customerSearch: query.customerSearch?.trim() || null,
        status: query.status ?? ReportSaleStatus.ACTIVE,
      },
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      totals: {
        salesCount: sums._count._all,
        revenue: revenue.toFixed(4),
        cost: cost.toFixed(4),
        profit: profit.toFixed(4),
      },
      items,
    };
  }

  // ------------------------------------------------------------------
  // 2) Summary (solo totales)
  // ------------------------------------------------------------------
  async streamingSalesSummary(
    query: StreamingSalesReportQueryDto,
    companyId: number,
  ) {
    const where = this.buildWhere(query, companyId);

    const sums = await this.prisma.streamingSale.aggregate({
      where,
      _sum: { salePrice: true, costAtSale: true },
      _count: { _all: true },
    });

    const revenue = this.dec(sums._sum.salePrice);
    const cost = this.dec(sums._sum.costAtSale);
    const profit = revenue.sub(cost);

    return {
      filters: {
        day: query.day ?? null,
        from: query.from ?? null,
        to: query.to ?? null,
        platformId: query.platformId ?? null,
        customerId: query.customerId ?? null,
        customerSearch: query.customerSearch?.trim() || null,
        status: query.status ?? ReportSaleStatus.ACTIVE,
      },
      totals: {
        salesCount: sums._count._all,
        revenue: revenue.toFixed(4),
        cost: cost.toFixed(4),
        profit: profit.toFixed(4),
      },
    };
  }

  // ------------------------------------------------------------------
  // 3) Group By Day (serie)
  // Nota: usamos SQL para date_trunc('day', sale_date)
  // ------------------------------------------------------------------
  async streamingSalesByDay(query: any, companyId: number) {
    const where = buildSalesFilters(companyId, query);

    const rows = await this.prisma.$queryRaw<
      Array<{
        day: string;
        salesCount: number;
        revenue: string;
        cost: string;
        profit: string;
      }>
    >(Prisma.sql`
    SELECT
      to_char(date_trunc('day', s.sale_date), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS "salesCount",
      COALESCE(SUM(s.sale_price), 0)::text AS revenue,
      COALESCE(SUM(s.cost_at_sale), 0)::text AS cost,
      COALESCE(SUM(s.sale_price - s.cost_at_sale), 0)::text AS profit
    FROM streaming_sales s
    JOIN customers c ON c.id = s.customer_id
    ${where}
    GROUP BY 1
    ORDER BY 1 ASC
  `);

    return rows;
  }

  // ------------------------------------------------------------------
  // 4) Group By Platform (serie)
  // ------------------------------------------------------------------
  async streamingSalesByPlatform(query: any, companyId: number) {
    const where = buildSalesFilters(companyId, query);

    const rows = await this.prisma.$queryRaw<
      Array<{
        platformId: number;
        platformName: string;
        salesCount: number;
        revenue: string;
        cost: string;
        profit: string;
      }>
    >(Prisma.sql`
    SELECT
      p.id AS "platformId",
      p.name AS "platformName",
      COUNT(*)::int AS "salesCount",
      COALESCE(SUM(s.sale_price), 0)::text AS revenue,
      COALESCE(SUM(s.cost_at_sale), 0)::text AS cost,
      COALESCE(SUM(s.sale_price - s.cost_at_sale), 0)::text AS profit
    FROM streaming_sales s
    JOIN streaming_platforms p ON p.id = s.platform_id
    JOIN customers c ON c.id = s.customer_id
    ${where}
    GROUP BY p.id, p.name
    ORDER BY SUM(s.sale_price) DESC
  `);

    return rows;
  }
}

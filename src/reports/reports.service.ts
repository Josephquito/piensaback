import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ReportSaleStatus,
  StreamingSalesReportQueryDto,
} from './dto/streaming-sales-report.query';

/**
 * Función auxiliar para construir filtros SQL puros de forma segura.
 */
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
  if (q.platformId) where.push(Prisma.sql`s.platform_id = ${q.platformId}`);
  if (q.customerId) where.push(Prisma.sql`s.customer_id = ${q.customerId}`);

  if (q.customerSearch?.trim()) {
    where.push(Prisma.sql`c.name ILIKE ${'%' + q.customerSearch.trim() + '%'}`);
  }

  if (q.day) {
    where.push(Prisma.sql`DATE(s.sale_date) = ${q.day}::date`);
  } else if (q.from && q.to) {
    where.push(Prisma.sql`s.sale_date >= ${q.from}::date`);
    where.push(Prisma.sql`s.sale_date < (${q.to}::date + INTERVAL '1 day')`);
  }

  return Prisma.sql`WHERE ${Prisma.join(where, ' AND ')}`;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private dec(v: any) {
    return v ? new Prisma.Decimal(v) : new Prisma.Decimal(0);
  }

  private dayRangeUtc(day: string) {
    const start = new Date(`${day}T00:00:00.000Z`);
    if (isNaN(start.getTime())) throw new BadRequestException('day inválido.');
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  private periodRangeUtc(from: string, to: string) {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(`${to}T00:00:00.000Z`);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      throw new BadRequestException('from/to inválidos.');
    const endExclusive = new Date(end);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return { start, endExclusive };
  }

  private buildWhere(
    query: StreamingSalesReportQueryDto,
    companyId: number,
  ): Prisma.StreamingSaleWhereInput {
    const where: Prisma.StreamingSaleWhereInput = { companyId };
    const status = query.status ?? ReportSaleStatus.ACTIVE;
    if (status !== ReportSaleStatus.ALL) where.status = status as any;
    if (query.platformId) where.platformId = query.platformId;
    if (query.customerId) where.customerId = query.customerId;
    if (query.customerSearch?.trim()) {
      where.customer = {
        name: { contains: query.customerSearch.trim(), mode: 'insensitive' },
      };
    }
    if (query.day) {
      const { start, end } = this.dayRangeUtc(query.day);
      where.saleDate = { gte: start, lt: end };
    } else if (query.from && query.to) {
      const { start, endExclusive } = this.periodRangeUtc(query.from, query.to);
      where.saleDate = { gte: start, lt: endExclusive };
    }
    return where;
  }

  async streamingSalesReport(
    query: StreamingSalesReportQueryDto,
    companyId: number,
  ) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 50, 100);
    const skip = (page - 1) * pageSize;
    const where = this.buildWhere(query, companyId);

    const [total, rows, sums] = await this.prisma.$transaction([
      this.prisma.streamingSale.count({ where }),
      this.prisma.streamingSale.findMany({
        where,
        orderBy: { saleDate: 'desc' },
        skip,
        take: pageSize,
        select: {
          id: true,
          saleDate: true,
          salePrice: true,
          costAtSale: true,
          status: true,
          cutoffDate: true,
          customer: { select: { id: true, name: true } },
          platform: { select: { id: true, name: true } },
          account: { select: { id: true, email: true } },
          // CORRECCIÓN AQUÍ: Usamos profileNo según tu schema
          profile: { select: { id: true, profileNo: true } },
        },
      }),
      this.prisma.streamingSale.aggregate({
        where,
        _sum: { salePrice: true, costAtSale: true },
        _count: { _all: true },
      }),
    ]);

    const totalRevenue = this.dec(sums._sum.salePrice);
    const totalCost = this.dec(sums._sum.costAtSale);

    const items = rows.map((r) => {
      const sPrice = this.dec(r.salePrice);
      const cPrice = this.dec(r.costAtSale);
      return {
        ...r,
        salePrice: sPrice.toFixed(2),
        costAtSale: cPrice.toFixed(2),
        profit: sPrice.sub(cPrice).toFixed(2),
      };
    });

    return {
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
      totals: {
        salesCount: sums._count._all,
        revenue: totalRevenue.toFixed(2),
        cost: totalCost.toFixed(2),
        profit: totalRevenue.sub(totalCost).toFixed(2),
      },
      items,
    };
  }

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

    return {
      totals: {
        salesCount: sums._count._all,
        revenue: revenue.toFixed(2),
        cost: cost.toFixed(2),
        profit: revenue.sub(cost).toFixed(2),
      },
    };
  }

  async streamingSalesByDay(query: any, companyId: number) {
    const whereClause = buildSalesFilters(companyId, query);
    return this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        to_char(date_trunc('day', s.sale_date), 'YYYY-MM-DD') AS day,
        COUNT(*)::int AS "salesCount",
        COALESCE(SUM(s.sale_price), 0)::numeric(12,2) AS revenue,
        COALESCE(SUM(s.cost_at_sale), 0)::numeric(12,2) AS cost,
        COALESCE(SUM(s.sale_price - s.cost_at_sale), 0)::numeric(12,2) AS profit
      FROM streaming_sales s
      JOIN customers c ON c.id = s.customer_id
      ${whereClause}
      GROUP BY 1
      ORDER BY 1 ASC
      LIMIT 1000;
    `);
  }

  async streamingSalesByPlatform(query: any, companyId: number) {
    const whereClause = buildSalesFilters(companyId, query);
    return this.prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT
        p.id AS "platformId",
        p.name AS "platformName",
        COUNT(*)::int AS "salesCount",
        COALESCE(SUM(s.sale_price), 0)::numeric(12,2) AS revenue,
        COALESCE(SUM(s.cost_at_sale), 0)::numeric(12,2) AS cost,
        COALESCE(SUM(s.sale_price - s.cost_at_sale), 0)::numeric(12,2) AS profit
      FROM streaming_sales s
      JOIN streaming_platforms p ON p.id = s.platform_id
      JOIN customers c ON c.id = s.customer_id
      ${whereClause}
      GROUP BY p.id, p.name
      ORDER BY revenue DESC;
    `);
  }
}

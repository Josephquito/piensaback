import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseRole, Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CurrentUserJwt } from '../common/types/current-user-jwt.type';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import {
  CustomerQueryDto,
  CustomerSortBy,
  CustomerStatusFilter,
  SortOrder,
} from './dto/customer-query.dto';
import { GoogleAuthService } from '../google/google-auth.service';
import { GoogleContactsService } from '../google/google-contacts.service';

const CUSTOMER_SELECT = {
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
} as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuth: GoogleAuthService,
    private readonly googleContacts: GoogleContactsService,
  ) {}

  // ─── Google sync helper ────────────────────────────────────────────

  private async getGoogleContext(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        googleConnected: true,
        googleGroupCustomers: true,
      },
    });
    if (!company?.googleConnected) return null;
    const accessToken = await this.googleAuth.getAccessToken(companyId);
    return { accessToken, groupResourceName: company.googleGroupCustomers };
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private assertNotEmployee(actor: CurrentUserJwt) {
    if (actor.role === BaseRole.EMPLOYEE) {
      throw new ForbiddenException('EMPLOYEE no puede gestionar clientes.');
    }
  }

  private async findAndAssert(id: number, companyId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado.');
    return customer;
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
      const normalizedTerm = term.replace(/\s+/g, '');
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { contact: { contains: normalizedTerm, mode: 'insensitive' } },
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

  // ─── CRUD ──────────────────────────────────────────────────────────

  async findAll(companyId: number, query: CustomerQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;
    const where = this.buildWhere(companyId, query);
    const orderBy = this.buildOrderBy(query);

    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        select: {
          ...CUSTOMER_SELECT,
          _count: { select: { sales: true } },
          sales: {
            where: { status: SaleStatus.ACTIVE },
            select: { id: true },
            take: 1,
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
    ]);

    const data = customers.map(({ sales, _count, ...c }) => ({
      ...c,
      totalSales: _count.sales,
      customerStatus: this.resolveStatus(_count.sales, sales.length > 0),
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: number, companyId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
      select: {
        ...CUSTOMER_SELECT,
        _count: { select: { sales: true } },
        sales: {
          where: { status: SaleStatus.ACTIVE },
          select: {
            id: true,
            salePrice: true,
            cutoffDate: true,
            platform: { select: { id: true, name: true } },
            profile: { select: { profileNo: true } },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado.');
    const { sales, _count, ...rest } = customer;
    return {
      ...rest,
      totalSales: _count.sales,
      activeSales: sales,
      customerStatus: this.resolveStatus(_count.sales, sales.length > 0),
    };
  }

  async create(
    dto: CreateCustomerDto,
    companyId: number,
    actor: CurrentUserJwt,
  ) {
    this.assertNotEmployee(actor);
    try {
      const customer = await this.prisma.customer.create({
        data: {
          companyId,
          name: dto.name,
          contact: dto.contact?.replace(/\s+/g, '') ?? '',
          source: dto.source ?? null,
          sourceNote: dto.sourceNote ?? null,
          notes: dto.notes ?? null,
          balance: dto.balance ?? null,
        },
        select: { ...CUSTOMER_SELECT, id: true },
      });

      // Sync → Google (fire and forget, no bloquea la respuesta)
      this.syncCreateToGoogle(customer, companyId).catch(() => null);

      return customer;
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new BadRequestException(
          'Ya existe un cliente con ese nombre en esta empresa.',
        );
      throw e;
    }
  }

  async update(
    id: number,
    dto: UpdateCustomerDto,
    companyId: number,
    actor: CurrentUserJwt,
  ) {
    this.assertNotEmployee(actor);
    await this.findAndAssert(id, companyId);
    const hasChanges = Object.values(dto).some((v) => v !== undefined);
    if (!hasChanges)
      throw new BadRequestException('No hay campos para actualizar.');
    try {
      const customer = await this.prisma.customer.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.contact !== undefined
            ? { contact: dto.contact.replace(/\s+/g, '') }
            : {}),
          ...(dto.source !== undefined ? { source: dto.source } : {}),
          ...(dto.sourceNote !== undefined
            ? { sourceNote: dto.sourceNote }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.balance !== undefined ? { balance: dto.balance } : {}),
        },
        select: { ...CUSTOMER_SELECT, id: true, googleContactId: true },
      });

      // Sync → Google
      this.syncUpdateToGoogle(customer, companyId).catch(() => null);

      return customer;
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new BadRequestException(
          'Ya existe un cliente con ese nombre en esta empresa.',
        );
      throw e;
    }
  }

  async remove(id: number, companyId: number, actor: CurrentUserJwt) {
    this.assertNotEmployee(actor);
    const customer = await this.findAndAssert(id, companyId);
    try {
      await this.prisma.customer.delete({ where: { id } });

      // Sync → Google
      this.syncDeleteToGoogle(customer.googleContactId, companyId).catch(
        () => null,
      );

      return { ok: true, deletedId: id };
    } catch (e: any) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException(
          'No se puede eliminar: el cliente tiene ventas registradas.',
        );
      }
      throw e;
    }
  }

  // ─── Google sync privados ──────────────────────────────────────────

  private async syncCreateToGoogle(
    customer: {
      id: number;
      name: string;
      contact: string;
      notes?: string | null;
    },
    companyId: number,
  ) {
    const ctx = await this.getGoogleContext(companyId);
    if (!ctx) return;

    const resourceName = await this.googleContacts.createContact(
      ctx.accessToken,
      {
        name: customer.name,
        phone: customer.contact,
        notes: customer.notes ?? undefined,
      },
    );

    // Asignar al grupo Clientes
    if (ctx.groupResourceName) {
      await this.googleContacts.addContactToGroup(
        ctx.accessToken,
        ctx.groupResourceName,
        resourceName,
      );
    }

    // Guardar googleContactId en BD
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { googleContactId: resourceName },
    });
  }

  private async syncUpdateToGoogle(
    customer: {
      googleContactId?: string | null;
      name: string;
      contact: string;
      notes?: string | null;
    },
    companyId: number,
  ) {
    if (!customer.googleContactId) return;
    const ctx = await this.getGoogleContext(companyId);
    if (!ctx) return;

    await this.googleContacts.updateContact(
      ctx.accessToken,
      customer.googleContactId,
      {
        name: customer.name,
        phone: customer.contact,
        notes: customer.notes ?? undefined,
      },
    );
  }

  private async syncDeleteToGoogle(
    googleContactId: string | null,
    companyId: number,
  ) {
    if (!googleContactId) return;
    const ctx = await this.getGoogleContext(companyId);
    if (!ctx) return;

    await this.googleContacts.deleteContact(ctx.accessToken, googleContactId);
  }

  // ─── Resto de métodos sin cambios ──────────────────────────────────

  async getHistory(id: number, companyId: number, query: CustomerQueryDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
      include: {
        sales: {
          where: query.saleStatus ? { status: query.saleStatus } : {},
          orderBy: { saleDate: 'desc' },
          include: {
            platform: { select: { name: true } },
            account: { select: { email: true, status: true } },
            profile: { select: { profileNo: true } },
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado.');

    const totalSpent = customer.sales.reduce(
      (acc, s) => acc + Number(s.salePrice),
      0,
    );
    const activeSales = customer.sales.filter(
      (s) => s.status === SaleStatus.ACTIVE,
    ).length;
    const allSalesCount = await this.prisma.streamingSale.count({
      where: { customerId: id },
    });

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        contact: customer.contact,
        source: customer.source,
        sourceNote: customer.sourceNote,
        notes: customer.notes,
        balance: customer.balance,
        lastPurchaseAt: customer.lastPurchaseAt,
      },
      metrics: {
        totalSales: allSalesCount,
        totalSpent,
        activeSales,
        customerStatus: this.resolveStatus(allSalesCount, activeSales > 0),
      },
      history: customer.sales,
    };
  }

  async getSources(companyId: number): Promise<string[]> {
    const rows = await this.prisma.customer.findMany({
      where: { companyId, source: { not: null } },
      select: { source: true },
      distinct: ['source'],
      orderBy: { source: 'asc' },
    });
    return rows.map((r) => r.source as string);
  }

  async getNextCustomerNumber(
    companyId: number,
  ): Promise<{ nextNumber: number; suggestedName: string }> {
    const customers = await this.prisma.customer.findMany({
      where: {
        companyId,
        name: { startsWith: 'Cliente ', mode: 'insensitive' },
      },
      select: { name: true },
    });

    let max = 0;
    for (const c of customers) {
      const match = c.name.match(/^Cliente\s+(\d+)$/i);
      if (match) {
        const n = parseInt(match[1]);
        if (n > max) max = n;
      }
    }

    const nextNumber = max + 1;
    return { nextNumber, suggestedName: `Cliente ${nextNumber}` };
  }
}

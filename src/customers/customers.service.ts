import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, SaleStatus } from '@prisma/client';

import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerReportQueryDto } from './dto/customer-report-query.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCustomerDto, _actor: ReqUser, companyId: number) {
    try {
      return await this.prisma.customer.create({
        data: {
          companyId,
          name: dto.name,
          contact: dto.contact,
          source: dto.source ?? null,
        },
      });
    } catch (e: any) {
      throw new BadRequestException(
        'Ya existe un cliente con ese nombre en esta empresa.',
      );
    }
  }

  async findAll(_actor: ReqUser, companyId: number) {
    return this.prisma.customer.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, _actor: ReqUser, companyId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
    });
    if (!customer) throw new NotFoundException('Cliente no existe.');
    return customer;
  }

  // ======================================================
  // NUEVO: REPORTE DE HISTORIAL
  // ======================================================
  async getHistory(
    id: number,
    companyId: number,
    query: CustomerReportQueryDto,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
      include: {
        sales: {
          where: query.status ? { status: query.status } : {},
          orderBy: { saleDate: 'desc' },
          include: {
            platform: { select: { name: true } },
            account: {
              select: {
                email: true,
                password: true,
                status: true,
              },
            },
            profile: { select: { profileNo: true } },
          },
        },
      },
    });

    if (!customer) throw new NotFoundException('Cliente no encontrado');

    // Cálculos rápidos para el Front-end
    const totalSpent = customer.sales.reduce(
      (acc, sale) => acc + Number(sale.salePrice),
      0,
    );
    const activeSales = customer.sales.filter(
      (s) => s.status === SaleStatus.ACTIVE,
    ).length;

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        contact: customer.contact,
        source: customer.source,
      },
      metrics: {
        totalSales: customer.sales.length,
        totalSpent,
        activeSales,
      },
      history: customer.sales,
    };
  }

  async update(
    id: number,
    dto: UpdateCustomerDto,
    actor: ReqUser,
    companyId: number,
  ) {
    await this.findOne(id, actor, companyId);

    try {
      return await this.prisma.customer.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.contact !== undefined ? { contact: dto.contact } : {}),
          ...(dto.source !== undefined ? { source: dto.source } : {}),
        },
      });
    } catch (e: any) {
      throw new BadRequestException('No se pudo actualizar el cliente.');
    }
  }

  async remove(id: number, actor: ReqUser, companyId: number) {
    await this.findOne(id, actor, companyId);

    try {
      await this.prisma.customer.delete({ where: { id } });
      return { ok: true };
    } catch (e: any) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException(
          'No se puede eliminar: el cliente tiene relaciones registradas.',
        );
      }
      throw new BadRequestException('No se pudo eliminar el cliente.');
    }
  }
}

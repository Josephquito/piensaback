/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: number,
    createdByUserId: number,
    dto: CreateCustomerDto,
  ) {
    const name = dto.name?.trim();
    const phone = dto.phone?.trim();

    if (!name) throw new BadRequestException('name es requerido');
    if (!phone) throw new BadRequestException('phone es requerido');

    try {
      return await this.prisma.customer.create({
        data: {
          companyId,
          name,
          phone,
          notes: dto.notes?.trim() || null,
          createdByUserId,
        },
      });
    } catch (e: any) {
      // Unique (companyId, phone)
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un cliente con ese teléfono en esta empresa',
        );
      }
      throw e;
    }
  }

  findAll(companyId: number) {
    return this.prisma.customer.findMany({
      where: { companyId },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(companyId: number, id: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, companyId },
    });

    if (!customer) throw new NotFoundException('Cliente no encontrado');
    return customer;
  }

  async update(
    companyId: number,
    id: number,
    _updatedByUserId: number,
    dto: UpdateCustomerDto,
  ) {
    // asegurar que exista y sea de la empresa
    await this.findOne(companyId, id);

    const data: any = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('name no puede estar vacío');
      data.name = name;
    }

    if (dto.phone !== undefined) {
      const phone = dto.phone.trim();
      if (!phone) throw new BadRequestException('phone no puede estar vacío');
      data.phone = phone;
    }

    if (dto.notes !== undefined) {
      data.notes = dto.notes?.trim() || null;
    }

    try {
      return await this.prisma.customer.update({
        where: { id },
        data,
      });
    } catch (e: any) {
      // Unique (companyId, phone)
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un cliente con ese teléfono en esta empresa',
        );
      }
      throw e;
    }
  }

  async remove(companyId: number, id: number) {
    await this.findOne(companyId, id);

    try {
      return await this.prisma.customer.delete({
        where: { id },
      });
    } catch (e: any) {
      // Si luego customer tiene referencias (ventas, facturas, etc.)
      if (e?.code === 'P2003') {
        throw new BadRequestException(
          'No se puede eliminar: el cliente tiene registros relacionados',
        );
      }
      throw e;
    }
  }
}

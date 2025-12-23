/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: number,
    createdByUserId: number,
    dto: CreateSupplierDto,
  ) {
    const name = dto.name?.trim();
    const contact = dto.contact?.trim();

    if (!name) throw new BadRequestException('name es requerido');
    if (!contact) throw new BadRequestException('contact es requerido');

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return await this.prisma.supplier.create({
        data: {
          companyId,
          name,
          contact,
          notes: dto.notes?.trim() || null,
          createdByUserId,
        },
      });
    } catch (e: any) {
      // Unique (companyId, name)
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un proveedor con ese nombre en esta empresa',
        );
      }
      throw e;
    }
  }

  findAll(companyId: number) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
    return this.prisma.supplier.findMany({
      where: { companyId },
      orderBy: { id: 'desc' },
    });
  }

  async findOne(companyId: number, id: number) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId },
    });

    if (!supplier) throw new NotFoundException('Proveedor no encontrado');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return supplier;
  }

  async update(
    companyId: number,
    id: number,
    _updatedByUserId: number,
    dto: UpdateSupplierDto,
  ) {
    // aseguramos que exista y pertenezca a la empresa
    await this.findOne(companyId, id);

    const data: any = {};
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('name no puede estar vacío');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      data.name = name;
    }
    if (dto.contact !== undefined) {
      const contact = dto.contact.trim();
      if (!contact)
        throw new BadRequestException('contact no puede estar vacío');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      data.contact = contact;
    }
    if (dto.notes !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      data.notes = dto.notes?.trim() || null;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
      return await this.prisma.supplier.update({
        where: { id },
        data,
      });
    } catch (e: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un proveedor con ese nombre en esta empresa',
        );
      }
      throw e;
    }
  }

  async remove(companyId: number, id: number) {
    // aseguramos que exista y pertenezca a la empresa
    await this.findOne(companyId, id);

    try {
      return await this.prisma.supplier.delete({
        where: { id },
      });
    } catch (e: any) {
      // Si luego este supplier tiene referencias (ventas, cuentas, etc.)
      if (e?.code === 'P2003') {
        throw new BadRequestException(
          'No se puede eliminar: el proveedor tiene registros relacionados',
        );
      }
      throw e;
    }
  }
}

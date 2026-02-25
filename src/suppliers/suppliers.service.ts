import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Prisma } from '@prisma/client';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSupplierDto, _actor: ReqUser, companyId: number) {
    try {
      return await this.prisma.supplier.create({
        data: {
          companyId,
          name: dto.name,
          contact: dto.contact,
        },
      });
    } catch (e: any) {
      // unique (companyId,name)
      throw new BadRequestException(
        'Ya existe un proveedor con ese nombre en esta empresa.',
      );
    }
  }

  async findAll(_actor: ReqUser, companyId: number) {
    return this.prisma.supplier.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, _actor: ReqUser, companyId: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no existe.');
    return supplier;
  }

  async update(
    id: number,
    dto: UpdateSupplierDto,
    _actor: ReqUser,
    companyId: number,
  ) {
    // asegura pertenencia
    await this.findOne(id, _actor, companyId);

    try {
      return await this.prisma.supplier.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.contact !== undefined ? { contact: dto.contact } : {}),
        },
      });
    } catch (e: any) {
      throw new BadRequestException('No se pudo actualizar el proveedor.');
    }
  }

  async remove(id: number, _actor: ReqUser, companyId: number) {
    // asegura pertenencia
    await this.findOne(id, _actor, companyId);

    try {
      await this.prisma.supplier.delete({ where: { id } });
      return { ok: true };
    } catch (e: any) {
      // Si el supplier tiene relaciones con tablas que tienen FK Restrict, caerá aquí:
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        // P2003: Foreign key constraint failed
        if (e.code === 'P2003') {
          throw new BadRequestException(
            'No se puede eliminar: el proveedor tiene relaciones registradas.',
          );
        }
      }
      throw new BadRequestException('No se pudo eliminar el proveedor.');
    }
  }

  async accountsBySupplier(
    supplierId: number,
    _actor: ReqUser,
    companyId: number,
  ) {
    // asegura pertenencia
    await this.findOne(supplierId, _actor, companyId);

    return this.prisma.streamingAccount.findMany({
      where: { companyId, supplierId },
      select: {
        id: true,
        email: true,
        purchaseDate: true,
        cutoffDate: true,
        status: true,
        totalCost: true,
        platformId: true,
      },
      orderBy: { purchaseDate: 'desc' },
    });
  }
}

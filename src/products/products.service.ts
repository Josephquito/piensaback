/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: number, userId: number, dto: CreateProductDto) {
    try {
      return await this.prisma.product.create({
        data: {
          companyId,
          type: dto.type,
          name: dto.name.trim(),
          description: dto.description?.trim() ?? null,
          basePdv: dto.basePdv ? new Prisma.Decimal(dto.basePdv) : null,
          createdByUserId: userId,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un producto con ese nombre y tipo en esta empresa',
        );
      }
      throw e;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findAll(companyId: number, type?: string) {
    const where: any = { companyId };

    if (type) {
      const upper = type.toUpperCase();
      if (!Object.values(ProductType).includes(upper as ProductType)) {
        throw new BadRequestException(
          'type inválido. Usa PLATFORM | RECHARGE | OTHER',
        );
      }
      where.type = upper;
    }

    return this.prisma.product.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(companyId: number, id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(
    companyId: number,
    id: number,
    _userId: number,
    dto: UpdateProductDto,
  ) {
    // validar que existe y pertenece a company
    const existing = await this.prisma.product.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Product not found');

    try {
      return await this.prisma.product.update({
        where: { id },
        data: {
          type: dto.type ?? undefined,
          name: dto.name ? dto.name.trim() : undefined,
          description:
            dto.description === undefined
              ? undefined
              : (dto.description?.trim() ?? null),
          basePdv:
            dto.basePdv === undefined
              ? undefined
              : dto.basePdv
                ? new Prisma.Decimal(dto.basePdv)
                : null,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un producto con ese nombre y tipo en esta empresa',
        );
      }
      throw e;
    }
  }

  async remove(companyId: number, id: number) {
    // 1) validar existe
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // 2) regla: no borrar si ya está usado
    const [hasAccounts, hasSales, hasMovements] = await Promise.all([
      this.prisma.account.findFirst({
        where: { productId: id, companyId },
        select: { id: true },
      }),
      this.prisma.slotSale.findFirst({
        where: { productId: id, companyId },
        select: { id: true },
      }),
      this.prisma.inventoryMovement.findFirst({
        where: { productId: id, companyId },
        select: { id: true },
      }),
    ]);

    if (hasAccounts || hasSales || hasMovements) {
      throw new BadRequestException(
        'No se puede eliminar: este producto ya está en uso (cuentas/ventas/inventario).',
      );
    }

    // 3) borrar
    return this.prisma.product.delete({ where: { id } });
  }
}

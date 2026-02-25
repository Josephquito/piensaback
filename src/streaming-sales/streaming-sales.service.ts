import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Prisma,
  KardexRefType,
  SaleStatus,
  StreamingAccountStatus,
} from '@prisma/client';
import { KardexService } from '../kardex/kardex.service';

import { CreateStreamingSaleDto } from './dto/create-streaming-sale.dto';
import { UpdateStreamingSaleDto } from './dto/update-streaming-sale.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Injectable()
export class StreamingSalesService {
  constructor(
    private prisma: PrismaService,
    private kardex: KardexService,
  ) {}

  private parseDate(value: string, field: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
      throw new BadRequestException(`${field} inválida.`);
    return d;
  }

  private parseDecimal(value: string, field: string) {
    try {
      const dec = new Prisma.Decimal(value);
      if (dec.lessThan(0)) throw new Error('neg');
      return dec;
    } catch {
      throw new BadRequestException(`${field} inválido.`);
    }
  }

  private addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  async create(
    dto: CreateStreamingSaleDto,
    _actor: ReqUser,
    companyId: number,
  ) {
    const salePrice = this.parseDecimal(dto.salePrice, 'salePrice');
    const saleDate = this.parseDate(dto.saleDate, 'saleDate');

    if (!Number.isInteger(dto.daysAssigned) || dto.daysAssigned <= 0) {
      throw new BadRequestException('daysAssigned inválido.');
    }

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente no accesible.');

    const account = await this.prisma.streamingAccount.findFirst({
      where: { id: dto.accountId, companyId },
      select: { id: true, companyId: true, platformId: true, status: true },
    });
    if (!account) throw new NotFoundException('Cuenta no accesible.');
    if (account.status !== StreamingAccountStatus.ACTIVE) {
      throw new BadRequestException(
        'No se puede vender: la cuenta está inactiva.',
      );
    }

    const profile = await this.prisma.accountProfile.findFirst({
      where: {
        id: dto.profileId,
        accountId: dto.accountId,
        status: 'AVAILABLE',
      },
      select: { id: true, status: true },
    });
    if (!profile) {
      throw new BadRequestException(
        'Perfil no disponible o no pertenece a la cuenta.',
      );
    }

    const cutoffDate = this.addDays(saleDate, dto.daysAssigned);

    const { unitCost } = await this.kardex.registerOut({
      companyId,
      platformId: account.platformId,
      qty: 1,
      refType: KardexRefType.PROFILE_SALE,
      accountId: account.id,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.accountProfile.update({
        where: { id: dto.profileId },
        data: { status: 'SOLD' },
      });

      const sale = await tx.streamingSale.create({
        data: {
          companyId,
          platformId: account.platformId,
          accountId: dto.accountId,
          profileId: dto.profileId,
          customerId: dto.customerId,
          salePrice,
          saleDate,
          daysAssigned: dto.daysAssigned,
          cutoffDate,
          costAtSale: unitCost,
          notes: dto.notes ?? null,
          status: SaleStatus.ACTIVE,
        },
        include: {
          customer: true,
          platform: true,
          account: true,
          profile: true,
        },
      });

      const lastMove = await tx.kardexMovement.findFirst({
        where: {
          companyId,
          accountId: account.id,
          refType: KardexRefType.PROFILE_SALE,
          type: 'OUT',
          saleId: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (lastMove) {
        await tx.kardexMovement.update({
          where: { id: lastMove.id },
          data: { saleId: sale.id },
        });
      }

      return sale;
    });
  }

  async findAll(_actor: ReqUser, companyId: number) {
    return this.prisma.streamingSale.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: { customer: true, platform: true, account: true, profile: true },
    });
  }

  async findOne(id: number, _actor: ReqUser, companyId: number) {
    const sale = await this.prisma.streamingSale.findFirst({
      where: { id, companyId },
      include: { customer: true, platform: true, account: true, profile: true },
    });
    if (!sale) throw new NotFoundException('Venta no existe.');
    return sale;
  }

  async update(
    id: number,
    dto: UpdateStreamingSaleDto,
    actor: ReqUser,
    companyId: number,
  ) {
    const sale = await this.findOne(id, actor, companyId);

    // Validar nuevo cliente si se envía
    if (dto.customerId && dto.customerId !== sale.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, companyId },
      });
      if (!customer) throw new NotFoundException('El nuevo cliente no existe.');
    }

    // Validar nuevo perfil si se envía (debe ser de la misma cuenta y estar AVAILABLE)
    if (dto.profileId && dto.profileId !== sale.profileId) {
      const profile = await this.prisma.accountProfile.findFirst({
        where: {
          id: dto.profileId,
          accountId: sale.accountId,
          status: 'AVAILABLE',
        },
      });
      if (!profile)
        throw new BadRequestException(
          'El nuevo perfil no está disponible o no pertenece a esta cuenta.',
        );
    }

    // Recalcular fechas
    let newCutoffDate = sale.cutoffDate;
    const saleDate = dto.saleDate
      ? this.parseDate(dto.saleDate, 'saleDate')
      : sale.saleDate;
    const daysAssigned = dto.daysAssigned ?? sale.daysAssigned;

    if (dto.saleDate || dto.daysAssigned) {
      newCutoffDate = this.addDays(saleDate, daysAssigned);
    }

    return this.prisma.$transaction(async (tx) => {
      // Si cambió el perfil, liberar el anterior y ocupar el nuevo
      if (dto.profileId && dto.profileId !== sale.profileId) {
        await tx.accountProfile.update({
          where: { id: sale.profileId },
          data: { status: 'AVAILABLE' },
        });
        await tx.accountProfile.update({
          where: { id: dto.profileId },
          data: { status: 'SOLD' },
        });
      }

      return tx.streamingSale.update({
        where: { id: sale.id },
        data: {
          ...(dto.customerId ? { customerId: dto.customerId } : {}),
          ...(dto.profileId ? { profileId: dto.profileId } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.salePrice
            ? { salePrice: this.parseDecimal(dto.salePrice, 'salePrice') }
            : {}),
          ...(dto.saleDate ? { saleDate } : {}),
          ...(dto.daysAssigned ? { daysAssigned } : {}),
          cutoffDate: newCutoffDate,
        },
        include: { customer: true, profile: true },
      });
    });
  }

  async empty(id: number, actor: ReqUser, companyId: number) {
    const sale = await this.prisma.streamingSale.findFirst({
      where: { id, companyId, status: SaleStatus.ACTIVE },
    });

    if (!sale) throw new NotFoundException('Venta activa no encontrada.');

    return this.prisma.$transaction(async (tx) => {
      await tx.accountProfile.update({
        where: { id: sale.profileId },
        data: { status: 'AVAILABLE' },
      });

      const updatedSale = await tx.streamingSale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.CANCELED },
      });

      await this.kardex.registerIn({
        companyId,
        platformId: sale.platformId,
        qty: 1,
        refType: KardexRefType.PROFILE_SALE,
        accountId: sale.accountId,
        unitCost: sale.costAtSale,
      });

      return updatedSale;
    });
  }
}

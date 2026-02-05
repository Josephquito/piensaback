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

    // validar customer pertenece a company
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente no accesible.');

    // traer cuenta con plataforma y validar company + active
    const account = await this.prisma.streamingAccount.findFirst({
      where: { id: dto.accountId, companyId },
      select: {
        id: true,
        companyId: true,
        platformId: true,
        status: true,
      },
    });
    if (!account) throw new NotFoundException('Cuenta no accesible.');
    if (account.status !== StreamingAccountStatus.ACTIVE) {
      throw new BadRequestException(
        'No se puede vender: la cuenta está inactiva.',
      );
    }

    // validar perfil pertenece a esa cuenta y está disponible
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

    // 1) Kardex OUT para obtener costo promedio vigente
    const { unitCost } = await this.kardex.registerOut({
      companyId,
      platformId: account.platformId,
      qty: 1,
      refType: KardexRefType.PROFILE_SALE,
      accountId: account.id,
    });

    // 2) Crear venta + marcar perfil SOLD (atomicidad)
    return this.prisma.$transaction(async (tx) => {
      // marcar perfil SOLD primero para evitar doble venta
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

      // opcional: link del movimiento de kardex con saleId
      // (si quieres 100% trazabilidad)
      // pero registerOut ya creó el movimiento con saleId null.
      // Aquí lo actualizamos al último movimiento OUT de esa cuenta/refType.
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
      include: {
        customer: true,
        platform: true,
        account: true,
        profile: true,
      },
    });
  }

  async findOne(id: number, _actor: ReqUser, companyId: number) {
    const sale = await this.prisma.streamingSale.findFirst({
      where: { id, companyId },
      include: {
        customer: true,
        platform: true,
        account: true,
        profile: true,
      },
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

    // Cancelación: devuelve stock? (depende de tu negocio)
    // Por ahora: cancelar NO devuelve stock automáticamente para no romper kardex.
    // Si quieres que devuelva stock, lo implementamos con IN (unitCost=costAtSale).
    try {
      return await this.prisma.streamingSale.update({
        where: { id: sale.id },
        data: {
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.status !== undefined ? { status: dto.status as any } : {}),
        },
      });
    } catch {
      throw new BadRequestException('No se pudo actualizar la venta.');
    }
  }
}

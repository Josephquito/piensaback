import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KardexRefType,
  Prisma,
  SaleStatus,
  StreamingAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { CreateStreamingSaleDto } from './dto/create-streaming-sale.dto';
import { UpdateStreamingSaleDto } from './dto/update-streaming-sale.dto';
import { RenewStreamingSaleDto } from './dto/renew-streaming-sale.dto';

const SALE_SELECT = {
  id: true,
  salePrice: true,
  saleDate: true,
  daysAssigned: true,
  cutoffDate: true,
  costAtSale: true,
  dailyCost: true,
  notes: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, contact: true } },
  platform: { select: { id: true, name: true } },
  account: { select: { id: true, email: true } },
  profile: { select: { id: true, profileNo: true, status: true } },
} as const;

@Injectable()
export class StreamingSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
  ) {}

  // =========================
  // Helpers
  // =========================
  private parseDate(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
      throw new BadRequestException(`${field} inválida.`);
    return d;
  }

  private parseDecimal(value: string, field: string): Prisma.Decimal {
    try {
      const dec = new Prisma.Decimal(value);
      if (dec.lessThan(0)) throw new Error('neg');
      return dec;
    } catch {
      throw new BadRequestException(`${field} inválido.`);
    }
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  private async findAndAssert(id: number, companyId: number) {
    const sale = await this.prisma.streamingSale.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        companyId: true,
        platformId: true,
        accountId: true,
        profileId: true,
        customerId: true,
        salePrice: true,
        saleDate: true,
        daysAssigned: true,
        cutoffDate: true,
        costAtSale: true,
        dailyCost: true,
        notes: true,
        status: true,
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    return sale;
  }

  // =========================
  // CREATE
  // =========================
  async create(dto: CreateStreamingSaleDto, companyId: number) {
    const salePrice = this.parseDecimal(dto.salePrice, 'salePrice');
    const saleDate = this.parseDate(dto.saleDate, 'saleDate');

    if (!Number.isInteger(dto.daysAssigned) || dto.daysAssigned <= 0)
      throw new BadRequestException('daysAssigned inválido.');

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, companyId },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Cliente no accesible.');

    const account = await this.prisma.streamingAccount.findFirst({
      where: { id: dto.accountId, companyId },
      select: { id: true, platformId: true, status: true },
    });
    if (!account) throw new NotFoundException('Cuenta no accesible.');
    if (account.status !== StreamingAccountStatus.ACTIVE)
      throw new BadRequestException('La cuenta está inactiva.');

    const profile = await this.prisma.accountProfile.findFirst({
      where: {
        id: dto.profileId,
        accountId: dto.accountId,
        status: 'AVAILABLE',
      },
      select: { id: true },
    });
    if (!profile)
      throw new BadRequestException(
        'Perfil no disponible o no pertenece a la cuenta.',
      );

    const cutoffDate = this.addDays(saleDate, dto.daysAssigned);

    return this.prisma.$transaction(async (tx) => {
      // 1) Kardex OUT — devuelve dailyCost (costo diario promedio)
      const { unitCost: dailyCost } = await this.kardex.registerOut(
        {
          companyId,
          platformId: account.platformId,
          qty: 1,
          refType: KardexRefType.PROFILE_SALE,
          accountId: account.id,
        },
        tx,
      );

      // 2) costAtSale = dailyCost × daysAssigned
      const costAtSale = dailyCost.mul(dto.daysAssigned);

      // 3) Perfil → SOLD
      await tx.accountProfile.update({
        where: { id: dto.profileId },
        data: { status: 'SOLD' },
      });

      // 4) Crear venta
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
          costAtSale,
          dailyCost,
          notes: dto.notes ?? null,
          status: SaleStatus.ACTIVE,
        },
        select: SALE_SELECT,
      });

      // 5) Actualizar lastPurchaseAt del cliente
      await tx.customer.update({
        where: { id: dto.customerId },
        data: { lastPurchaseAt: saleDate },
      });

      // 6) Vincular movimiento kardex a la venta
      await tx.kardexMovement.updateMany({
        where: {
          companyId,
          accountId: account.id,
          refType: KardexRefType.PROFILE_SALE,
          type: 'OUT',
          saleId: null,
        },
        data: { saleId: sale.id },
      });

      return sale;
    });
  }

  // =========================
  // READ
  // =========================
  async findAll(companyId: number) {
    return this.prisma.streamingSale.findMany({
      where: { companyId },
      select: SALE_SELECT,
      orderBy: { saleDate: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const sale = await this.prisma.streamingSale.findFirst({
      where: { id, companyId },
      select: SALE_SELECT,
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    return sale;
  }

  // =========================
  // UPDATE — sin cambio de perfil
  // =========================
  async update(id: number, dto: UpdateStreamingSaleDto, companyId: number) {
    const sale = await this.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.ACTIVE)
      throw new BadRequestException('Solo se pueden editar ventas activas.');

    if (dto.customerId && dto.customerId !== sale.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, companyId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado.');
    }

    const saleDate = dto.saleDate
      ? this.parseDate(dto.saleDate, 'saleDate')
      : sale.saleDate;
    const daysAssigned = dto.daysAssigned ?? sale.daysAssigned;

    // recalcular costAtSale si cambian los días
    const costAtSale =
      dto.daysAssigned !== undefined
        ? sale.dailyCost.mul(daysAssigned)
        : sale.costAtSale;

    const cutoffDate =
      dto.saleDate || dto.daysAssigned
        ? this.addDays(saleDate, daysAssigned)
        : sale.cutoffDate;

    return this.prisma.streamingSale.update({
      where: { id: sale.id },
      data: {
        ...(dto.customerId ? { customerId: dto.customerId } : {}),
        ...(dto.salePrice
          ? { salePrice: this.parseDecimal(dto.salePrice, 'salePrice') }
          : {}),
        ...(dto.saleDate ? { saleDate } : {}),
        ...(dto.daysAssigned ? { daysAssigned, costAtSale } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        cutoffDate,
      },
      select: SALE_SELECT,
    });
  }

  // =========================
  // VACIAR — perfil vuelve a AVAILABLE
  // =========================
  async empty(id: number, companyId: number) {
    const sale = await this.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.ACTIVE)
      throw new BadRequestException('Solo se pueden vaciar ventas activas.');

    return this.prisma.$transaction(async (tx) => {
      // 1) Perfil → AVAILABLE
      await tx.accountProfile.update({
        where: { id: sale.profileId },
        data: { status: 'AVAILABLE' },
      });

      // 2) Venta → CANCELED
      const updatedSale = await tx.streamingSale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.CANCELED },
        select: SALE_SELECT,
      });

      // 3) Kardex IN — devuelve el slot con el dailyCost original
      await this.kardex.registerIn(
        {
          companyId,
          platformId: sale.platformId,
          qty: 1,
          unitCost: sale.dailyCost,
          refType: KardexRefType.PROFILE_SALE,
          accountId: sale.accountId,
        },
        tx,
      );

      return updatedSale;
    });
  }

  // =========================
  // RENOVAR — nueva venta en mismo perfil sin vaciarlo
  // =========================
  async renew(id: number, dto: RenewStreamingSaleDto, companyId: number) {
    const sale = await this.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.ACTIVE)
      throw new BadRequestException('Solo se pueden renovar ventas activas.');

    const saleDate = this.parseDate(dto.saleDate, 'saleDate');
    const salePrice = this.parseDecimal(dto.salePrice, 'salePrice');
    const cutoffDate = this.addDays(saleDate, dto.daysAssigned);
    const customerId = dto.customerId ?? sale.customerId;

    if (dto.customerId && dto.customerId !== sale.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, companyId },
        select: { id: true },
      });
      if (!customer) throw new NotFoundException('Cliente no encontrado.');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1) Venta anterior → CANCELED
      await tx.streamingSale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.CANCELED },
      });

      // 2) Kardex OUT para nueva venta — obtiene dailyCost actualizado
      const { unitCost: dailyCost } = await this.kardex.registerOut(
        {
          companyId,
          platformId: sale.platformId,
          qty: 1,
          refType: KardexRefType.PROFILE_SALE,
          accountId: sale.accountId,
        },
        tx,
      );

      const costAtSale = dailyCost.mul(dto.daysAssigned);

      // 3) Nueva venta — perfil sigue SOLD
      const newSale = await tx.streamingSale.create({
        data: {
          companyId,
          platformId: sale.platformId,
          accountId: sale.accountId,
          profileId: sale.profileId, // mismo perfil
          customerId,
          salePrice,
          saleDate,
          daysAssigned: dto.daysAssigned,
          cutoffDate,
          costAtSale,
          dailyCost,
          notes: dto.notes ?? null,
          status: SaleStatus.ACTIVE,
        },
        select: SALE_SELECT,
      });

      // 4) Actualizar lastPurchaseAt del cliente
      await tx.customer.update({
        where: { id: customerId },
        data: { lastPurchaseAt: saleDate },
      });

      // 5) Vincular kardex a la nueva venta
      await tx.kardexMovement.updateMany({
        where: {
          companyId,
          accountId: sale.accountId,
          refType: KardexRefType.PROFILE_SALE,
          type: 'OUT',
          saleId: null,
        },
        data: { saleId: newSale.id },
      });

      return newSale;
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KardexRefType,
  Prisma,
  RenewalMessageStatus,
  SaleStatus,
  StreamingAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { CreateStreamingSaleDto } from './dto/create-streaming-sale.dto';
import { UpdateStreamingSaleDto } from './dto/update-streaming-sale.dto';
import { RenewStreamingSaleDto } from './dto/renew-streaming-sale.dto';

export const SALE_SELECT = {
  id: true,
  salePrice: true,
  saleDate: true,
  daysAssigned: true,
  cutoffDate: true,
  costAtSale: true,
  dailyCost: true,
  notes: true,
  status: true,
  renewalStatus: true,
  pausedAt: true,
  pausedDaysLeft: true,
  creditAmount: true,
  creditRefunded: true,
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
  // Helpers públicos
  // =========================
  parseDate(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
      throw new BadRequestException(`${field} inválida.`);
    return d;
  }

  parseDecimal(value: string, field: string): Prisma.Decimal {
    try {
      const dec = new Prisma.Decimal(value);
      if (dec.lessThan(0)) throw new Error('neg');
      return dec;
    } catch {
      throw new BadRequestException(`${field} inválido.`);
    }
  }

  // Agrega días desde inicio del día UTC de la fecha base
  addDays(date: Date, days: number): Date {
    const base = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    base.setUTCDate(base.getUTCDate() + days);
    return base;
  }

  // Calcula días restantes comparando solo fechas UTC
  daysRemaining(cutoffDate: Date, today: Date): number {
    return this.daysRemainingByDate(cutoffDate, today);
  }

  private daysRemainingByDate(cutoffDate: Date, today: Date): number {
    const cutoff = new Date(
      Date.UTC(
        cutoffDate.getUTCFullYear(),
        cutoffDate.getUTCMonth(),
        cutoffDate.getUTCDate(),
      ),
    );
    return Math.max(
      0,
      Math.ceil((cutoff.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }

  private isToday(date: Date, today: Date): boolean {
    const todayStr = today.toISOString().split('T')[0];
    const d = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    )
      .toISOString()
      .split('T')[0];
    return todayStr === d;
  }

  async findAndAssert(id: number, companyId: number) {
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
        renewalStatus: true,
        pausedAt: true,
        pausedDaysLeft: true,
        creditAmount: true,
        creditRefunded: true,
      },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada.');
    return sale;
  }

  // =========================
  // CREATE
  // =========================
  async create(dto: CreateStreamingSaleDto, companyId: number, today: Date) {
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
    if (
      account.status !== StreamingAccountStatus.ACTIVE &&
      account.status !== StreamingAccountStatus.EXPIRED
    )
      throw new BadRequestException(
        'La cuenta no está disponible para ventas.',
      );

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
    const alreadyExpired = cutoffDate < today;
    const initialStatus = alreadyExpired
      ? SaleStatus.EXPIRED
      : SaleStatus.ACTIVE;
    const renewalStatus = this.isToday(cutoffDate, today)
      ? RenewalMessageStatus.PENDING
      : RenewalMessageStatus.NOT_APPLICABLE;

    return this.prisma.$transaction(async (tx) => {
      const { unitCost: dailyCost } = await this.kardex.registerOut(
        {
          companyId,
          platformId: account.platformId,
          qty: dto.daysAssigned,
          refType: KardexRefType.PROFILE_SALE,
          accountId: account.id,
        },
        tx,
      );

      const costAtSale = dailyCost.mul(dto.daysAssigned);

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
          costAtSale,
          dailyCost,
          notes: dto.notes ?? null,
          status: initialStatus,
          renewalStatus,
        },
        select: SALE_SELECT,
      });

      await tx.customer.update({
        where: { id: dto.customerId },
        data: { lastPurchaseAt: saleDate },
      });

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
  async findAll(
    companyId: number,
    filters?: {
      status?: SaleStatus;
      renewalStatus?: RenewalMessageStatus;
      accountId?: number;
    },
  ) {
    return this.prisma.streamingSale.findMany({
      where: {
        companyId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.renewalStatus
          ? { renewalStatus: filters.renewalStatus }
          : {}),
        ...(filters?.accountId ? { accountId: filters.accountId } : {}),
      },
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
  // UPDATE
  // =========================
  async update(
    id: number,
    dto: UpdateStreamingSaleDto,
    companyId: number,
    today: Date,
  ) {
    const sale = await this.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.ACTIVE && sale.status !== SaleStatus.PAUSED)
      throw new BadRequestException(
        'Solo se pueden editar ventas activas o pausadas.',
      );

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

    const costAtSale =
      dto.daysAssigned !== undefined
        ? sale.dailyCost.mul(daysAssigned)
        : sale.costAtSale;

    const cutoffDate =
      dto.saleDate || dto.daysAssigned
        ? this.addDays(saleDate, daysAssigned)
        : sale.cutoffDate;

    let renewalStatus = sale.renewalStatus;
    if (dto.saleDate || dto.daysAssigned) {
      if (this.isToday(cutoffDate, today)) {
        renewalStatus = RenewalMessageStatus.PENDING;
      } else if (cutoffDate >= today) {
        renewalStatus = RenewalMessageStatus.NOT_APPLICABLE;
      }
    }

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
        renewalStatus,
      },
      select: SALE_SELECT,
    });
  }

  // =========================
  // VACIAR — perfil vuelve a AVAILABLE
  // =========================
  async empty(id: number, companyId: number, today: Date) {
    const sale = await this.findAndAssert(id, companyId);

    if (
      sale.status !== SaleStatus.ACTIVE &&
      sale.status !== SaleStatus.EXPIRED &&
      sale.status !== SaleStatus.PAUSED
    )
      throw new BadRequestException('Esta venta no se puede vaciar.');

    const remaining =
      sale.status === SaleStatus.PAUSED && sale.pausedDaysLeft != null
        ? Number(sale.pausedDaysLeft)
        : this.daysRemainingByDate(sale.cutoffDate, today);

    return this.prisma.$transaction(async (tx) => {
      await tx.accountProfile.update({
        where: { id: sale.profileId },
        data: { status: 'AVAILABLE' },
      });

      const updatedSale = await tx.streamingSale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.CLOSED,
          creditAmount: null,
          pausedAt: null,
          pausedDaysLeft: null,
        },
        select: SALE_SELECT,
      });

      if (remaining > 0) {
        await this.kardex.registerIn(
          {
            companyId,
            platformId: sale.platformId,
            qty: remaining,
            unitCost: sale.dailyCost,
            refType: KardexRefType.PROFILE_SALE,
            accountId: sale.accountId,
          },
          tx,
        );
      }

      return updatedSale;
    });
  }

  // =========================
  // RENOVAR — nueva venta en mismo perfil
  // =========================
  async renew(
    id: number,
    dto: RenewStreamingSaleDto,
    companyId: number,
    today: Date,
  ) {
    const sale = await this.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.ACTIVE && sale.status !== SaleStatus.EXPIRED)
      throw new BadRequestException(
        'Solo se pueden renovar ventas activas o expiradas.',
      );

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

    const renewalStatus = this.isToday(cutoffDate, today)
      ? RenewalMessageStatus.PENDING
      : RenewalMessageStatus.NOT_APPLICABLE;

    return this.prisma.$transaction(async (tx) => {
      await tx.streamingSale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.CLOSED },
      });

      const { unitCost: dailyCost } = await this.kardex.registerOut(
        {
          companyId,
          platformId: sale.platformId,
          qty: dto.daysAssigned,
          refType: KardexRefType.PROFILE_SALE,
          accountId: sale.accountId,
        },
        tx,
      );

      const costAtSale = dailyCost.mul(dto.daysAssigned);

      const newSale = await tx.streamingSale.create({
        data: {
          companyId,
          platformId: sale.platformId,
          accountId: sale.accountId,
          profileId: sale.profileId,
          customerId,
          salePrice,
          saleDate,
          daysAssigned: dto.daysAssigned,
          cutoffDate,
          costAtSale,
          dailyCost,
          notes: dto.notes ?? null,
          status: SaleStatus.ACTIVE,
          renewalStatus,
        },
        select: SALE_SELECT,
      });

      await tx.customer.update({
        where: { id: customerId },
        data: { lastPurchaseAt: saleDate },
      });

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

  // =========================
  // ACTUALIZAR RENEWAL STATUS manualmente
  // =========================
  async updateRenewalStatus(
    id: number,
    status: RenewalMessageStatus,
    companyId: number,
  ) {
    const sale = await this.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.ACTIVE && sale.status !== SaleStatus.EXPIRED)
      throw new BadRequestException(
        'Solo se puede actualizar el estado de renovación en ventas activas o expiradas.',
      );

    return this.prisma.streamingSale.update({
      where: { id: sale.id },
      data: { renewalStatus: status },
      select: SALE_SELECT,
    });
  }
}

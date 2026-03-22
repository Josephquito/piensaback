import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KardexRefType,
  Prisma,
  StreamingAccountStatus,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { CreateStreamingAccountDto } from './dto/create-streaming-account.dto';

export const ACCOUNT_SELECT = {
  id: true,
  email: true,
  password: true,
  profilesTotal: true,
  durationDays: true,
  purchaseDate: true,
  cutoffDate: true,
  totalCost: true,
  notes: true,
  status: true,
  replacedByEmail: true,
  replacedAt: true,
  replacementNote: true,
  createdAt: true,
  updatedAt: true,
  platform: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true, balance: true } },
  profiles: {
    select: {
      id: true,
      profileNo: true,
      status: true,
      sales: {
        where: { status: { in: ['ACTIVE', 'PAUSED'] as SaleStatus[] } }, // ← SaleStatus[] en vez de as const
        select: { cutoffDate: true, status: true },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    },
    orderBy: { profileNo: 'asc' as const },
  },
} as const;

@Injectable()
export class StreamingAccountsService {
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

  calcDailyCost(
    totalCost: Prisma.Decimal,
    profilesTotal: number,
    durationDays: number,
  ): Prisma.Decimal {
    if (profilesTotal === 0 || durationDays === 0) return new Prisma.Decimal(0);
    return totalCost.div(profilesTotal).div(durationDays);
  }

  isExpired(cutoffDate: Date): boolean {
    const now = new Date();
    const cutoff = new Date(
      cutoffDate.getUTCFullYear(),
      cutoffDate.getUTCMonth(),
      cutoffDate.getUTCDate(),
      23,
      59,
      59,
      999,
    );
    const today = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    return today > cutoff;
  }

  daysRemainingByDate(cutoffDate: Date): number {
    const now = new Date();
    const cutoff = new Date(
      Date.UTC(
        cutoffDate.getUTCFullYear(),
        cutoffDate.getUTCMonth(),
        cutoffDate.getUTCDate(),
      ),
    );
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    return Math.max(
      0,
      Math.ceil((cutoff.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }

  async findAndAssert(id: number, companyId: number) {
    const account = await this.prisma.streamingAccount.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        companyId: true,
        platformId: true,
        supplierId: true,
        profilesTotal: true,
        durationDays: true,
        totalCost: true,
        status: true,
        email: true,
        password: true,
        purchaseDate: true,
        cutoffDate: true,
        notes: true,
      },
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    return account;
  }

  // =========================
  // CREATE
  // =========================
  async create(dto: CreateStreamingAccountDto, companyId: number) {
    const platform = await this.prisma.streamingPlatform.findFirst({
      where: { id: dto.platformId, companyId },
      select: { id: true },
    });
    if (!platform) throw new NotFoundException('Plataforma no accesible.');

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, companyId },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Proveedor no accesible.');

    const purchaseDate = this.parseDate(dto.purchaseDate, 'purchaseDate');
    const cutoffDate = this.parseDate(dto.cutoffDate, 'cutoffDate');
    const totalCost = this.parseDecimal(dto.totalCost, 'totalCost');
    const { profilesTotal, durationDays } = dto;
    const dailyCost = this.calcDailyCost(
      totalCost,
      profilesTotal,
      durationDays,
    );

    return this.prisma.$transaction(async (tx) => {
      let account: { id: number };
      try {
        account = await tx.streamingAccount.create({
          data: {
            companyId,
            platformId: dto.platformId,
            supplierId: dto.supplierId,
            email: dto.email.trim(),
            password: dto.password,
            profilesTotal,
            durationDays,
            purchaseDate,
            cutoffDate,
            totalCost,
            notes: dto.notes ?? null,
            status: StreamingAccountStatus.ACTIVE,
          },
          select: { id: true },
        });
      } catch (e: any) {
        if (e?.code === 'P2002')
          throw new BadRequestException(
            'Ya existe una cuenta con ese correo en esta empresa y plataforma.',
          );
        throw e;
      }

      await tx.supplier.update({
        where: { id: dto.supplierId },
        data: { balance: { decrement: totalCost } },
      });

      await tx.accountProfile.createMany({
        data: Array.from({ length: profilesTotal }, (_, i) => ({
          accountId: account.id,
          profileNo: i + 1,
          status: 'AVAILABLE' as const,
        })),
      });

      await this.kardex.registerIn(
        {
          companyId,
          platformId: dto.platformId,
          qty: profilesTotal * durationDays,
          unitCost: dailyCost,
          refType: KardexRefType.ACCOUNT_PURCHASE,
          accountId: account.id,
        },
        tx,
      );

      return tx.streamingAccount.findUnique({
        where: { id: account.id },
        select: ACCOUNT_SELECT,
      });
    });
  }

  // =========================
  // READ
  // =========================
  async findAll(companyId: number) {
    return this.prisma.streamingAccount.findMany({
      where: {
        companyId,
        status: { not: StreamingAccountStatus.DELETED },
      },
      select: ACCOUNT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const account = await this.prisma.streamingAccount.findFirst({
      where: {
        id,
        companyId,
        status: { not: StreamingAccountStatus.DELETED },
      },
      select: ACCOUNT_SELECT,
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    return account;
  }
}

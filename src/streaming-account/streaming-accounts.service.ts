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
      labelId: true,
      label: { select: { id: true, name: true, color: true } },
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

  isExpired(cutoffDate: Date, today: Date): boolean {
    const cutoff = new Date(
      Date.UTC(
        cutoffDate.getUTCFullYear(),
        cutoffDate.getUTCMonth(),
        cutoffDate.getUTCDate(),
      ),
    );
    return today > cutoff;
  }

  daysRemainingByDate(cutoffDate: Date, today: Date): number {
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
  async create(dto: CreateStreamingAccountDto, companyId: number, today: Date) {
    const purchaseDate = this.parseDate(dto.purchaseDate, 'purchaseDate');
    const cutoffDate = this.parseDate(dto.cutoffDate, 'cutoffDate');
    const totalCost = this.parseDecimal(dto.totalCost, 'totalCost');
    const { profilesTotal, durationDays } = dto;
    const dailyCost = this.calcDailyCost(
      totalCost,
      profilesTotal,
      durationDays,
    );

    // Calcular días restantes y status inicial
    const daysLeft = this.daysRemainingByDate(cutoffDate, today);
    const isAlreadyExpired = this.isExpired(cutoffDate, today);
    // daysLeft = 0 + isAlreadyExpired = false → vence hoy → ACTIVE
    // daysLeft = 0 + isAlreadyExpired = true  → ya venció   → EXPIRED
    const initialStatus = isAlreadyExpired
      ? StreamingAccountStatus.EXPIRED
      : StreamingAccountStatus.ACTIVE;

    return this.prisma.$transaction(async (tx) => {
      // Validaciones dentro de la transacción para evitar race conditions
      const platform = await tx.streamingPlatform.findFirst({
        where: { id: dto.platformId, companyId },
        select: { id: true },
      });
      if (!platform) throw new NotFoundException('Plataforma no accesible.');

      const supplier = await tx.supplier.findFirst({
        where: { id: dto.supplierId, companyId },
        select: { id: true },
      });
      if (!supplier) throw new NotFoundException('Proveedor no accesible.');

      const deleted = await tx.streamingAccount.findFirst({
        where: {
          companyId,
          platformId: dto.platformId,
          email: dto.email.trim(),
          status: StreamingAccountStatus.DELETED,
        },
        select: { id: true },
      });

      let accountId: number;

      if (deleted) {
        await tx.streamingAccount.update({
          where: { id: deleted.id },
          data: {
            supplierId: dto.supplierId,
            password: dto.password,
            profilesTotal,
            durationDays,
            purchaseDate,
            cutoffDate,
            totalCost,
            notes: dto.notes ?? null,
            status: initialStatus,
          },
        });

        // 1) IDs de perfiles existentes
        const oldProfiles = await tx.accountProfile.findMany({
          where: { accountId: deleted.id },
          select: { id: true },
        });
        const oldProfileIds = oldProfiles.map((p) => p.id);

        // 2) Borrar ventas que referencian esos perfiles
        if (oldProfileIds.length > 0) {
          await tx.streamingSale.deleteMany({
            where: { profileId: { in: oldProfileIds } },
          });
        }

        // 3) Borrar perfiles
        await tx.accountProfile.deleteMany({
          where: { accountId: deleted.id },
        });

        // 4) Crear perfiles nuevos
        await tx.accountProfile.createMany({
          data: Array.from({ length: profilesTotal }, (_, i) => ({
            accountId: deleted.id,
            profileNo: i + 1,
            status: 'AVAILABLE' as const,
          })),
        });

        accountId = deleted.id;
      } else {
        // Crear cuenta nueva
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
              status: initialStatus, // ← ACTIVE o EXPIRED según días restantes
            },
            select: { id: true },
          });
        } catch (e: any) {
          if (e?.code === 'P2002')
            throw new BadRequestException(
              'Ya existe una cuenta activa con ese correo en esta plataforma.',
            );
          throw e;
        }

        await tx.accountProfile.createMany({
          data: Array.from({ length: profilesTotal }, (_, i) => ({
            accountId: account.id,
            profileNo: i + 1,
            status: 'AVAILABLE' as const,
          })),
        });

        accountId = account.id;
      }

      // Común para ambos casos
      await tx.supplier.update({
        where: { id: dto.supplierId },
        data: { balance: { decrement: totalCost } },
      });

      // Solo registrar kardex si hay días reales disponibles
      // Si vence hoy (daysLeft=0) o ya venció (isAlreadyExpired),
      // no hay días en inventario que registrar
      if (daysLeft > 0) {
        await this.kardex.registerIn(
          {
            companyId,
            platformId: dto.platformId,
            qty: profilesTotal * daysLeft, // ← días reales disponibles
            unitCost: dailyCost,
            refType: KardexRefType.ACCOUNT_PURCHASE,
            accountId,
          },
          tx,
        );
      }

      return tx.streamingAccount.findUnique({
        where: { id: accountId },
        select: ACCOUNT_SELECT,
      });
    });
  }

  // =========================
  // READ
  // =========================
  // En streaming-accounts.service.ts
  async findAll(companyId: number, limit = 100, platformId?: number) {
    return this.prisma.streamingAccount.findMany({
      where: {
        companyId,
        status: { not: StreamingAccountStatus.DELETED },
        ...(platformId ? { platformId } : {}), // ← solo si viene
      },
      select: ACCOUNT_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
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

  async findAllProfiles(companyId: number) {
    const profiles = await this.prisma.accountProfile.findMany({
      where: {
        account: {
          companyId,
          status: { not: StreamingAccountStatus.DELETED },
        },
      },
      select: {
        id: true,
        profileNo: true,
        status: true,
        labelId: true,
        label: { select: { id: true, name: true, color: true } },
        account: {
          select: {
            id: true,
            email: true,
            password: true,
            cutoffDate: true,
            status: true,
            platform: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
          },
        },
        sales: {
          where: { status: { in: [SaleStatus.ACTIVE, SaleStatus.PAUSED] } },
          select: {
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
            customer: { select: { id: true, name: true, contact: true } },
          },
          orderBy: { createdAt: 'desc' as const },
          take: 1,
        },
      },
      orderBy: [
        { account: { platform: { name: 'asc' } } },
        { account: { email: 'asc' } },
        { profileNo: 'asc' },
      ],
    });

    return profiles;
  }
}

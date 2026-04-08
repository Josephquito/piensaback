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
  PaymentMode,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { CreateStreamingAccountDto } from './dto/create-streaming-account.dto';
import { daysRemainingFrom, isExpiredFrom } from '../common/utils/date.utils';

export const ACCOUNT_SELECT = {
  id: true,
  email: true,
  password: true,
  profilesTotal: true,
  durationDays: true,
  purchaseDate: true,
  cutoffDate: true,
  totalCost: true,
  paymentMode: true,
  cashAmount: true,
  creditAmount: true,
  balanceAmount: true,
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
        where: {
          status: { in: ['ACTIVE', 'PAUSED', 'EXPIRED'] as SaleStatus[] },
        },
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

  // ─── Helper de modalidad ───────────────────────────────────────────
  private resolvePaymentAmounts(
    paymentMode: PaymentMode,
    totalCost: Prisma.Decimal,
    dto: { cashAmount?: string; creditAmount?: string; balanceAmount?: string },
  ): {
    cashAmount: Prisma.Decimal;
    creditAmount: Prisma.Decimal;
    balanceAmount: Prisma.Decimal;
    balanceDelta: Prisma.Decimal; // cuánto se mueve el balance del proveedor (negativo)
  } {
    const zero = new Prisma.Decimal(0);

    switch (paymentMode) {
      case 'CASH':
        return {
          cashAmount: totalCost,
          creditAmount: zero,
          balanceAmount: zero,
          balanceDelta: zero,
        };

      case 'CREDIT':
        return {
          cashAmount: zero,
          creditAmount: totalCost,
          balanceAmount: zero,
          balanceDelta: totalCost.negated(),
        };

      case 'BALANCE':
        return {
          cashAmount: zero,
          creditAmount: zero,
          balanceAmount: totalCost,
          balanceDelta: totalCost.negated(),
        };

      case 'CASH_BALANCE': {
        const cash = dto.cashAmount ? new Prisma.Decimal(dto.cashAmount) : null;
        const balance = dto.balanceAmount
          ? new Prisma.Decimal(dto.balanceAmount)
          : null;
        const cashAmt = cash ?? totalCost.sub(balance!);
        const balAmt = balance ?? totalCost.sub(cash!);
        if (cashAmt.lessThan(0) || balAmt.lessThan(0))
          throw new BadRequestException(
            'Los montos parciales no pueden ser negativos.',
          );
        return {
          cashAmount: cashAmt,
          creditAmount: zero,
          balanceAmount: balAmt,
          balanceDelta: balAmt.negated(),
        };
      }

      case 'CASH_CREDIT': {
        const cash = dto.cashAmount ? new Prisma.Decimal(dto.cashAmount) : null;
        const credit = dto.creditAmount
          ? new Prisma.Decimal(dto.creditAmount)
          : null;
        const cashAmt = cash ?? totalCost.sub(credit!);
        const credAmt = credit ?? totalCost.sub(cash!);
        if (cashAmt.lessThan(0) || credAmt.lessThan(0))
          throw new BadRequestException(
            'Los montos parciales no pueden ser negativos.',
          );
        return {
          cashAmount: cashAmt,
          creditAmount: credAmt,
          balanceAmount: zero,
          balanceDelta: credAmt.negated(),
        };
      }

      case 'BALANCE_CREDIT': {
        const balance = dto.balanceAmount
          ? new Prisma.Decimal(dto.balanceAmount)
          : null;
        const credit = dto.creditAmount
          ? new Prisma.Decimal(dto.creditAmount)
          : null;
        const balAmt = balance ?? totalCost.sub(credit!);
        const credAmt = credit ?? totalCost.sub(balance!);
        if (balAmt.lessThan(0) || credAmt.lessThan(0))
          throw new BadRequestException(
            'Los montos parciales no pueden ser negativos.',
          );
        return {
          cashAmount: zero,
          creditAmount: credAmt,
          balanceAmount: balAmt,
          balanceDelta: balAmt.negated().sub(credAmt),
        };
      }
    }
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

    const daysLeft = daysRemainingFrom(cutoffDate, today);
    const isAlreadyExpired = isExpiredFrom(cutoffDate, today);
    const initialStatus = isAlreadyExpired
      ? StreamingAccountStatus.EXPIRED
      : StreamingAccountStatus.ACTIVE;

    const amounts = this.resolvePaymentAmounts(dto.paymentMode, totalCost, dto);

    return this.prisma.$transaction(async (tx) => {
      const platform = await tx.streamingPlatform.findFirst({
        where: { id: dto.platformId, companyId },
        select: { id: true },
      });
      if (!platform) throw new NotFoundException('Plataforma no accesible.');

      const supplier = await tx.supplier.findFirst({
        where: { id: dto.supplierId, companyId },
        select: { id: true, balance: true },
      });
      if (!supplier) throw new NotFoundException('Proveedor no accesible.');

      const balanceBefore = new Prisma.Decimal(supplier.balance);
      const balanceAfter = balanceBefore.add(amounts.balanceDelta);

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
            paymentMode: dto.paymentMode,
            cashAmount: amounts.cashAmount,
            creditAmount: amounts.creditAmount,
            balanceAmount: amounts.balanceAmount,
          },
        });

        const oldProfiles = await tx.accountProfile.findMany({
          where: { accountId: deleted.id },
          select: { id: true },
        });
        const oldProfileIds = oldProfiles.map((p) => p.id);

        if (oldProfileIds.length > 0) {
          await tx.streamingSale.deleteMany({
            where: { profileId: { in: oldProfileIds } },
          });
        }

        await tx.accountProfile.deleteMany({
          where: { accountId: deleted.id },
        });
        await tx.accountProfile.createMany({
          data: Array.from({ length: profilesTotal }, (_, i) => ({
            accountId: deleted.id,
            profileNo: i + 1,
            status: 'AVAILABLE' as const,
          })),
        });

        accountId = deleted.id;
      } else {
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
              status: initialStatus,
              paymentMode: dto.paymentMode,
              cashAmount: amounts.cashAmount,
              creditAmount: amounts.creditAmount,
              balanceAmount: amounts.balanceAmount,
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

      // Actualizar balance del proveedor
      if (!amounts.balanceDelta.equals(0)) {
        await tx.supplier.update({
          where: { id: dto.supplierId },
          data: { balance: balanceAfter },
        });

        await tx.supplierMovement.create({
          data: {
            companyId,
            supplierId: dto.supplierId,
            type: 'PURCHASE',
            amount: totalCost,
            balanceBefore,
            balanceAfter,
            accountId,
            date: new Date(),
          },
        });
      }

      // Registrar compra inicial como primera entrada del historial
      await tx.accountRenewal.create({
        data: {
          companyId,
          accountId,
          purchaseDate,
          cutoffDate,
          durationDays,
          totalCost,
          paymentMode: dto.paymentMode,
          cashAmount: amounts.cashAmount,
          creditAmount: amounts.creditAmount,
          balanceAmount: amounts.balanceAmount,
        },
      });

      if (daysLeft > 0) {
        await this.kardex.registerIn(
          {
            companyId,
            platformId: dto.platformId,
            qty: profilesTotal * daysLeft,
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
        paymentMode: true, // ← agregar
        cashAmount: true, // ← agregar
        creditAmount: true, // ← agregar
        balanceAmount: true, // ← agregar
      },
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    return account;
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
          where: {
            status: {
              in: [SaleStatus.ACTIVE, SaleStatus.PAUSED, SaleStatus.EXPIRED],
            },
          },

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

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BaseRole,
  KardexRefType,
  Prisma,
  StreamingAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import type { CurrentUserJwt } from '../common/types/current-user-jwt.type';
import { CreateStreamingAccountDto } from './dto/create-streaming-account.dto';
import { UpdateStreamingAccountDto } from './dto/update-streaming-account.dto';

type KardexInPayload = {
  companyId: number;
  platformId: number;
  qty: number;
  unitCost: Prisma.Decimal;
  refType: KardexRefType;
  accountId?: number;
};

type KardexAdjustOutPayload = {
  companyId: number;
  platformId: number;
  qty: number;
  refType: KardexRefType;
  accountId?: number;
};

type KardexOp =
  | { kind: 'IN'; payload: KardexInPayload }
  | { kind: 'ADJUST_OUT'; payload: KardexAdjustOutPayload };

const ACCOUNT_SELECT = {
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
  createdAt: true,
  updatedAt: true,
  platform: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true, balance: true } },
  profiles: {
    select: { id: true, profileNo: true, status: true },
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

  private calcDailyCost(
    totalCost: Prisma.Decimal,
    profilesTotal: number,
    durationDays: number,
  ): Prisma.Decimal {
    if (profilesTotal === 0 || durationDays === 0) return new Prisma.Decimal(0);
    return totalCost.div(profilesTotal).div(durationDays);
  }

  private async findAndAssert(id: number, companyId: number) {
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

    // costo diario por perfil = totalCost / perfiles / días
    const dailyCost = this.calcDailyCost(
      totalCost,
      profilesTotal,
      durationDays,
    );

    return this.prisma.$transaction(async (tx) => {
      // 1) Crear cuenta
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
        if (e?.code === 'P2002') {
          throw new BadRequestException(
            'Ya existe una cuenta con ese correo en esta empresa y plataforma.',
          );
        }
        throw e;
      }

      // 2) Descontar del balance del proveedor
      await tx.supplier.update({
        where: { id: dto.supplierId },
        data: { balance: { decrement: totalCost } },
      });

      // 3) Crear perfiles AVAILABLE
      await tx.accountProfile.createMany({
        data: Array.from({ length: profilesTotal }, (_, i) => ({
          accountId: account.id,
          profileNo: i + 1,
          status: 'AVAILABLE' as const,
        })),
      });

      // 4) Kardex IN dentro de la misma transacción
      await this.kardex.registerIn(
        {
          companyId,
          platformId: dto.platformId,
          qty: profilesTotal,
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
  // LIST
  // =========================
  async findAll(companyId: number) {
    return this.prisma.streamingAccount.findMany({
      where: { companyId },
      select: ACCOUNT_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const account = await this.prisma.streamingAccount.findFirst({
      where: { id, companyId },
      select: ACCOUNT_SELECT,
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada.');
    return account;
  }

  // =========================
  // UPDATE
  // =========================
  async update(id: number, dto: UpdateStreamingAccountDto, companyId: number) {
    const account = await this.findAndAssert(id, companyId);

    if (dto.platformId !== undefined) {
      const p = await this.prisma.streamingPlatform.findFirst({
        where: { id: dto.platformId, companyId },
        select: { id: true },
      });
      if (!p) throw new NotFoundException('Plataforma no accesible.');
    }

    if (dto.supplierId !== undefined) {
      const s = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, companyId },
        select: { id: true },
      });
      if (!s) throw new NotFoundException('Proveedor no accesible.');
    }

    const oldSupplierId = account.supplierId;
    const newSupplierId = dto.supplierId ?? oldSupplierId;
    const oldCost = account.totalCost;
    const newCost =
      dto.totalCost !== undefined
        ? this.parseDecimal(dto.totalCost, 'totalCost')
        : oldCost;
    const newDurationDays = dto.durationDays ?? account.durationDays;
    const effectivePlatformId = dto.platformId ?? account.platformId;

    const data: Prisma.StreamingAccountUpdateInput = {};
    if (dto.email !== undefined) data.email = dto.email.trim();
    if (dto.password !== undefined) data.password = dto.password;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;
    if (dto.purchaseDate !== undefined)
      data.purchaseDate = this.parseDate(dto.purchaseDate, 'purchaseDate');
    if (dto.cutoffDate !== undefined)
      data.cutoffDate = this.parseDate(dto.cutoffDate, 'cutoffDate');
    if (dto.totalCost !== undefined) data.totalCost = newCost;
    if (dto.durationDays !== undefined) data.durationDays = dto.durationDays;
    if (dto.platformId !== undefined)
      data.platform = { connect: { id: dto.platformId } };
    if (dto.supplierId !== undefined)
      data.supplier = { connect: { id: dto.supplierId } };

    const kardexOps: KardexOp[] = [];

    await this.prisma.$transaction(async (tx) => {
      // 1) Cambio profilesTotal
      if (
        dto.profilesTotal !== undefined &&
        dto.profilesTotal !== account.profilesTotal
      ) {
        const newTotal = dto.profilesTotal;
        const oldTotal = account.profilesTotal;

        const soldCount = await tx.accountProfile.count({
          where: { accountId: account.id, status: 'SOLD' },
        });
        const availableCount = await tx.accountProfile.count({
          where: { accountId: account.id, status: 'AVAILABLE' },
        });

        if (newTotal < soldCount) {
          throw new BadRequestException(
            `No se puede reducir a ${newTotal}: ya vendiste ${soldCount} perfiles.`,
          );
        }

        if (newTotal > oldTotal) {
          const delta = newTotal - oldTotal;
          await tx.accountProfile.createMany({
            data: Array.from({ length: delta }, (_, i) => ({
              accountId: account.id,
              profileNo: oldTotal + i + 1,
              status: 'AVAILABLE' as const,
            })),
          });

          // recalcular dailyCost con nuevos valores efectivos
          const dailyCost = this.calcDailyCost(
            newCost,
            newTotal,
            newDurationDays,
          );

          kardexOps.push({
            kind: 'IN',
            payload: {
              companyId,
              platformId: effectivePlatformId,
              qty: delta,
              unitCost: dailyCost,
              refType: KardexRefType.PROFILE_ADJUST,
              accountId: account.id,
            },
          });
        } else {
          const need = oldTotal - newTotal;
          if (availableCount < need) {
            throw new BadRequestException(
              `No se puede reducir: disponibles ${availableCount}, necesitas dar de baja ${need}.`,
            );
          }

          const toDelete = await tx.accountProfile.findMany({
            where: { accountId: account.id, status: 'AVAILABLE' },
            orderBy: { profileNo: 'desc' },
            take: need,
            select: { id: true },
          });

          await tx.accountProfile.deleteMany({
            where: { id: { in: toDelete.map((p) => p.id) } },
          });

          kardexOps.push({
            kind: 'ADJUST_OUT',
            payload: {
              companyId,
              platformId: effectivePlatformId,
              qty: need,
              refType: KardexRefType.PROFILE_ADJUST,
              accountId: account.id,
            },
          });
        }

        data.profilesTotal = newTotal;
      }

      // 2) Inactivación
      if (
        dto.status === StreamingAccountStatus.INACTIVE &&
        account.status !== StreamingAccountStatus.INACTIVE
      ) {
        const availableCount = await tx.accountProfile.count({
          where: { accountId: account.id, status: 'AVAILABLE' },
        });

        if (availableCount > 0) {
          await tx.accountProfile.updateMany({
            where: { accountId: account.id, status: 'AVAILABLE' },
            data: { status: 'BLOCKED' },
          });

          kardexOps.push({
            kind: 'ADJUST_OUT',
            payload: {
              companyId,
              platformId: effectivePlatformId,
              qty: availableCount,
              refType: KardexRefType.ACCOUNT_INACTIVATION,
              accountId: account.id,
            },
          });
        }

        data.status = StreamingAccountStatus.INACTIVE;
      }

      // 3) Balance proveedor
      if (oldSupplierId !== newSupplierId) {
        await tx.supplier.update({
          where: { id: oldSupplierId },
          data: { balance: { increment: oldCost } }, // devuelve al viejo
        });
        await tx.supplier.update({
          where: { id: newSupplierId },
          data: { balance: { decrement: newCost } }, // descuenta al nuevo
        });
      } else if (dto.totalCost !== undefined) {
        const delta = newCost.sub(oldCost);
        await tx.supplier.update({
          where: { id: oldSupplierId },
          data: { balance: { decrement: delta } },
        });
      }

      // 4) Kardex ops dentro de tx
      for (const op of kardexOps) {
        if (op.kind === 'IN') {
          await this.kardex.registerIn(op.payload, tx);
        } else {
          await this.kardex.registerAdjustOut(op.payload, tx);
        }
      }

      // 5) Update cuenta
      try {
        await tx.streamingAccount.update({
          where: { id: account.id },
          data,
        });
      } catch (e: any) {
        if (e?.code === 'P2002') {
          throw new BadRequestException(
            'Ya existe una cuenta con ese correo en esta empresa y plataforma.',
          );
        }
        throw e;
      }
    });

    return this.findOne(account.id, companyId);
  }

  // =========================
  // REMOVE — solo inactivar
  // =========================
  async remove(id: number, companyId: number) {
    await this.findAndAssert(id, companyId);
    throw new BadRequestException(
      'No se permite eliminar cuentas. Inactiva la cuenta desde el update.',
    );
  }
}

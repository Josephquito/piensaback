import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, KardexRefType, StreamingAccountStatus } from '@prisma/client';
import { KardexService } from '../kardex/kardex.service';

import { CreateStreamingAccountDto } from './dto/create-streaming-account.dto';
import { UpdateStreamingAccountDto } from './dto/update-streaming-account.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

// ✅ Tipos explícitos para evitar "unknown" en op.payload
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

@Injectable()
export class StreamingAccountsService {
  constructor(
    private prisma: PrismaService,
    private kardex: KardexService,
  ) {}

  private parseDate(value: string, field: string) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${field} inválida.`);
    }
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

  async create(
    dto: CreateStreamingAccountDto,
    _actor: ReqUser,
    companyId: number,
  ) {
    // Validar platform pertenece a company
    const platform = await this.prisma.streamingPlatform.findFirst({
      where: { id: dto.platformId, companyId },
      select: { id: true },
    });
    if (!platform) throw new NotFoundException('Plataforma no accesible.');

    // Validar supplier pertenece a company
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, companyId },
      select: { id: true },
    });
    if (!supplier) throw new NotFoundException('Proveedor no accesible.');

    const purchaseDate = this.parseDate(dto.purchaseDate, 'purchaseDate');
    const cutoffDate = this.parseDate(dto.cutoffDate, 'cutoffDate');
    const totalCost = this.parseDecimal(dto.totalCost, 'totalCost');

    const profilesTotal = dto.profilesTotal;

    // unitCost por perfil (según tu lógica)
    const unitCost =
      profilesTotal === 0
        ? new Prisma.Decimal(0)
        : totalCost.div(profilesTotal);

    return this.prisma
      .$transaction(async (tx) => {
        // 1) Crear cuenta
        let account;
        try {
          account = await tx.streamingAccount.create({
            data: {
              companyId,
              platformId: dto.platformId,
              supplierId: dto.supplierId,
              email: dto.email.trim(),
              password: dto.password,
              profilesTotal,
              purchaseDate,
              cutoffDate,
              totalCost,
              notes: dto.notes ?? null,
              status: StreamingAccountStatus.ACTIVE,
            },
          });
        } catch (e: any) {
          throw new BadRequestException(
            'Ya existe una cuenta con ese correo en esta empresa y plataforma.',
          );
        }

        // ✅ 1.1) Sumar gasto histórico al proveedor (ATÓMICO)
        await tx.supplier.update({
          where: { id: dto.supplierId },
          data: { historicalSpend: { increment: totalCost } },
        });

        // 2) Crear perfiles 1..N
        const profilesData = Array.from({ length: profilesTotal }, (_, i) => ({
          accountId: account.id,
          profileNo: i + 1,
          status: 'AVAILABLE' as const,
        }));

        if (profilesData.length > 0) {
          await tx.accountProfile.createMany({ data: profilesData });
        }

        // (Kardex se registra fuera)
        return account;
      })
      .then(async (account) => {
        // 3) Kardex IN (N perfiles)
        await this.kardex.registerIn({
          companyId,
          platformId: dto.platformId,
          qty: profilesTotal,
          unitCost,
          refType: KardexRefType.ACCOUNT_PURCHASE,
          accountId: account.id,
        });

        return this.prisma.streamingAccount.findUnique({
          where: { id: account.id },
          include: { profiles: true, platform: true, supplier: true },
        });
      });
  }

  async findAll(_actor: ReqUser, companyId: number) {
    return this.prisma.streamingAccount.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      include: {
        platform: true,
        supplier: true,
        profiles: true,
      },
    });
  }

  async findOne(id: number, _actor: ReqUser, companyId: number) {
    const account = await this.prisma.streamingAccount.findFirst({
      where: { id, companyId },
      include: {
        platform: true,
        supplier: true,
        profiles: true,
      },
    });
    if (!account) throw new NotFoundException('Cuenta no existe.');
    return account;
  }

  /**
   * UPDATE:
   * - Cambios normales: email/password/fechas/costo/notas
   * - Cambio profilesTotal: delta IN o ADJUST OUT con reglas
   * - Cambio status a INACTIVE: baja perfiles AVAILABLE (ADJUST OUT) y bloquea perfiles
   */
  async update(
    id: number,
    dto: UpdateStreamingAccountDto,
    actor: ReqUser,
    companyId: number,
  ) {
    const account = await this.findOne(id, actor, companyId);

    // validar platform/supplier si vienen
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

    // ---- Cálculo para gasto histórico ----
    const oldSupplierId = account.supplierId;
    const newSupplierId = dto.supplierId ?? oldSupplierId;

    const oldCost = account.totalCost; // Prisma.Decimal
    const newCost =
      dto.totalCost !== undefined
        ? this.parseDecimal(dto.totalCost, 'totalCost')
        : oldCost;

    const sameSupplier = oldSupplierId === newSupplierId;

    // ---- Preparar data update ----
    const data: Prisma.StreamingAccountUpdateInput = {};

    if (dto.email !== undefined) data.email = dto.email.trim();
    if (dto.password !== undefined) data.password = dto.password;
    if (dto.notes !== undefined) data.notes = dto.notes ?? null;

    if (dto.purchaseDate !== undefined) {
      data.purchaseDate = this.parseDate(dto.purchaseDate, 'purchaseDate');
    }
    if (dto.cutoffDate !== undefined) {
      data.cutoffDate = this.parseDate(dto.cutoffDate, 'cutoffDate');
    }
    if (dto.totalCost !== undefined) {
      data.totalCost = newCost;
    }

    if (dto.platformId !== undefined)
      data.platform = { connect: { id: dto.platformId } };
    if (dto.supplierId !== undefined)
      data.supplier = { connect: { id: dto.supplierId } };

    // ✅ ops de kardex bien tipadas (adiós unknown)
    const kardexOps: KardexOp[] = [];

    // Valores efectivos para kardex
    const effectivePlatformId = dto.platformId ?? account.platformId;

    await this.prisma.$transaction(async (tx) => {
      // 1) Manejo cambio profilesTotal (usa tx en vez de prisma directo)
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

          const newProfiles = Array.from({ length: delta }, (_, i) => ({
            accountId: account.id,
            profileNo: oldTotal + i + 1,
            status: 'AVAILABLE' as const,
          }));

          if (newProfiles.length > 0) {
            await tx.accountProfile.createMany({ data: newProfiles });
          }

          // unitCost = totalCost / newTotal (usar newCost efectivo)
          const unitCost =
            newTotal === 0 ? new Prisma.Decimal(0) : newCost.div(newTotal);

          kardexOps.push({
            kind: 'IN',
            payload: {
              companyId,
              platformId: effectivePlatformId,
              qty: delta,
              unitCost,
              refType: KardexRefType.PROFILE_ADJUST,
              accountId: account.id,
            },
          });

          data.profilesTotal = newTotal;
        } else {
          const need = oldTotal - newTotal;

          if (availableCount < need) {
            throw new BadRequestException(
              `No se puede reducir: disponibles ${availableCount}, se necesita dar de baja ${need}.`,
            );
          }

          const toBlock = await tx.accountProfile.findMany({
            where: { accountId: account.id, status: 'AVAILABLE' },
            orderBy: { profileNo: 'desc' },
            take: need,
            select: { id: true },
          });

          if (toBlock.length > 0) {
            await tx.accountProfile.updateMany({
              where: { id: { in: toBlock.map((p) => p.id) } },
              data: { status: 'BLOCKED' },
            });
          }

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

          data.profilesTotal = newTotal;
        }
      }

      // 2) Manejo inactivación (con tx)
      if (
        dto.status === 'INACTIVE' &&
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

      // 3) ✅ Recalcular gasto histórico (con tx)
      if (oldSupplierId !== newSupplierId) {
        // restar al viejo el costo anterior
        await tx.supplier.update({
          where: { id: oldSupplierId },
          data: { historicalSpend: { decrement: oldCost } },
        });

        // sumar al nuevo el costo nuevo
        await tx.supplier.update({
          where: { id: newSupplierId },
          data: { historicalSpend: { increment: newCost } },
        });
      } else {
        // mismo proveedor: ajustar delta si cambió costo
        if (dto.totalCost !== undefined) {
          const delta = newCost.sub(oldCost);
          await tx.supplier.update({
            where: { id: oldSupplierId },
            data: { historicalSpend: { increment: delta } },
          });
        }
      }

      // 4) Ejecutar update de cuenta (con tx)
      try {
        await tx.streamingAccount.update({
          where: { id: account.id },
          data,
        });
      } catch {
        throw new BadRequestException('No se pudo actualizar la cuenta.');
      }
    });

    // 5) Ejecutar kardex fuera (misma estrategia que tu create)
    for (const op of kardexOps) {
      if (op.kind === 'IN') {
        await this.kardex.registerIn(op.payload);
      } else {
        await this.kardex.registerAdjustOut(op.payload);
      }
    }

    return this.findOne(account.id, actor, companyId);
  }

  async remove(id: number, actor: ReqUser, companyId: number) {
    // Si quieres permitir delete, hay que decidir qué pasa con kardex.
    // Recomendación: no borrar cuentas (soft delete / inactivate).
    await this.findOne(id, actor, companyId);
    throw new BadRequestException(
      'No se permite eliminar cuentas. Inactiva la cuenta.',
    );
  }
}

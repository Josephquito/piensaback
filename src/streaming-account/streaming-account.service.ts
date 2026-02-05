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

        // 2) Crear perfiles 1..N
        const profilesData = Array.from({ length: profilesTotal }, (_, i) => ({
          accountId: account.id,
          profileNo: i + 1,
          status: 'AVAILABLE' as const,
        }));

        if (profilesData.length > 0) {
          await tx.accountProfile.createMany({ data: profilesData });
        }

        // 3) Kardex IN (N perfiles)
        //    OJO: usamos el KardexService, pero aquí estamos dentro de tx,
        //    así que lo hacemos directo con el prisma global? Para no mezclar,
        //    llamamos al service fuera de la tx. Mejor:
        //    -> Creamos el IN fuera de la tx y si falla, tiramos error.
        //    Pero si quieres 100% atomicidad, refactorizamos KardexService para aceptar tx.
        //    Por ahora lo hacemos fuera de tx: no suele fallar.
        return account;
      })
      .then(async (account) => {
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

    // Si cambian platform/supplier, validar pertenencia a company
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

    // Preparar campos
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
      data.totalCost = this.parseDecimal(dto.totalCost, 'totalCost');
    }

    if (dto.platformId !== undefined)
      data.platform = { connect: { id: dto.platformId } };
    if (dto.supplierId !== undefined)
      data.supplier = { connect: { id: dto.supplierId } };

    // 1) Manejo cambio profilesTotal
    if (
      dto.profilesTotal !== undefined &&
      dto.profilesTotal !== account.profilesTotal
    ) {
      const newTotal = dto.profilesTotal;
      const oldTotal = account.profilesTotal;

      // contar vendidos/disponibles
      const soldCount = await this.prisma.accountProfile.count({
        where: { accountId: account.id, status: 'SOLD' },
      });
      const availableCount = await this.prisma.accountProfile.count({
        where: { accountId: account.id, status: 'AVAILABLE' },
      });

      // no puedes bajar por debajo de lo vendido
      if (newTotal < soldCount) {
        throw new BadRequestException(
          `No se puede reducir a ${newTotal}: ya vendiste ${soldCount} perfiles.`,
        );
      }

      if (newTotal > oldTotal) {
        // delta IN
        const delta = newTotal - oldTotal;

        // crear perfiles nuevos (oldTotal+1..newTotal)
        const newProfiles = Array.from({ length: delta }, (_, i) => ({
          accountId: account.id,
          profileNo: oldTotal + i + 1,
          status: 'AVAILABLE' as const,
        }));

        await this.prisma.accountProfile.createMany({ data: newProfiles });

        // unitCost = totalCost / newTotal (tu lógica)
        const totalCost =
          dto.totalCost !== undefined
            ? this.parseDecimal(dto.totalCost, 'totalCost')
            : account.totalCost;

        const unitCost = totalCost.div(newTotal);

        await this.kardex.registerIn({
          companyId,
          platformId: dto.platformId ?? account.platformId,
          qty: delta,
          unitCost,
          refType: KardexRefType.PROFILE_ADJUST,
          accountId: account.id,
        });

        data.profilesTotal = newTotal;
      } else {
        // delta ADJUST OUT (quitar disponibles)
        const need = oldTotal - newTotal;

        if (availableCount < need) {
          throw new BadRequestException(
            `No se puede reducir: disponibles ${availableCount}, se necesita dar de baja ${need}.`,
          );
        }

        // bloquear los últimos perfiles disponibles
        const toBlock = await this.prisma.accountProfile.findMany({
          where: { accountId: account.id, status: 'AVAILABLE' },
          orderBy: { profileNo: 'desc' },
          take: need,
          select: { id: true },
        });

        await this.prisma.accountProfile.updateMany({
          where: { id: { in: toBlock.map((p) => p.id) } },
          data: { status: 'BLOCKED' },
        });

        await this.kardex.registerAdjustOut({
          companyId,
          platformId: dto.platformId ?? account.platformId,
          qty: need,
          refType: KardexRefType.PROFILE_ADJUST,
          accountId: account.id,
        });

        data.profilesTotal = newTotal;
      }
    }

    // 2) Manejo inactivación
    if (
      dto.status === 'INACTIVE' &&
      account.status !== StreamingAccountStatus.INACTIVE
    ) {
      const availableCount = await this.prisma.accountProfile.count({
        where: { accountId: account.id, status: 'AVAILABLE' },
      });

      if (availableCount > 0) {
        // bloquear disponibles
        await this.prisma.accountProfile.updateMany({
          where: { accountId: account.id, status: 'AVAILABLE' },
          data: { status: 'BLOCKED' },
        });

        await this.kardex.registerAdjustOut({
          companyId,
          platformId: dto.platformId ?? account.platformId,
          qty: availableCount,
          refType: KardexRefType.ACCOUNT_INACTIVATION,
          accountId: account.id,
        });
      }

      data.status = StreamingAccountStatus.INACTIVE;
    }

    // Ejecutar update
    try {
      await this.prisma.streamingAccount.update({
        where: { id: account.id },
        data,
      });
    } catch {
      throw new BadRequestException('No se pudo actualizar la cuenta.');
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

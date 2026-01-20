import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================
  // CREATE
  // =========================
  async create(companyId: number, userId: number, dto: CreateAccountDto) {
    // 1) fechas
    const purchasedAt = new Date(dto.purchasedAt);
    const cutOffAt = new Date(dto.cutOffAt);

    if (isNaN(purchasedAt.getTime()) || isNaN(cutOffAt.getTime())) {
      throw new BadRequestException('Fechas inválidas');
    }
    // comprado no puede ser en el pasado (según tu regla)
    const now = new Date();
    if (purchasedAt.getTime() < now.getTime()) {
      throw new BadRequestException(
        'purchasedAt no puede ser menor a la fecha actual',
      );
    }
    if (cutOffAt.getTime() <= purchasedAt.getTime()) {
      throw new BadRequestException('cutOffAt debe ser mayor a purchasedAt');
    }

    const totalCost = new Prisma.Decimal(dto.purchaseTotalCost);
    const qty = dto.profilesCount;
    if (qty < 1) throw new BadRequestException('profilesCount must be >= 1');

    const unitCost = totalCost.div(new Prisma.Decimal(qty));

    return this.prisma.$transaction(async (tx) => {
      // 2) validar product PLATFORM en esta company
      const product = await tx.product.findFirst({
        where: { id: dto.productId, companyId, type: 'PLATFORM' },
        select: { id: true },
      });
      if (!product) {
        throw new BadRequestException(
          'productId inválido: debe existir y ser PLATFORM en esta empresa',
        );
      }

      // 3) resolver supplier
      let supplierId: number | null = null;

      if (dto.supplierId) {
        const supplier = await tx.supplier.findFirst({
          where: { id: dto.supplierId, companyId },
          select: { id: true },
        });
        if (!supplier) {
          throw new BadRequestException(
            'supplierId inválido: no pertenece a esta empresa',
          );
        }
        supplierId = supplier.id;
      } else if (dto.supplier) {
        // crear supplier nuevo (si no existe uno con mismo name)
        const existing = await tx.supplier.findFirst({
          where: { companyId, name: dto.supplier.name },
          select: { id: true },
        });

        if (existing) {
          supplierId = existing.id;
        } else {
          const created = await tx.supplier.create({
            data: {
              companyId,
              name: dto.supplier.name,
              contact: dto.supplier.contact,
              createdByUserId: userId,
            },
            select: { id: true },
          });
          supplierId = created.id;
        }
      }

      // 4) crear account (unique correo+product+company lo valida DB)
      const account = await tx.account.create({
        data: {
          companyId,
          productId: dto.productId,
          supplierId,
          emailLogin: dto.emailLogin,
          passwordLogin: dto.passwordLogin,
          purchasedAt,
          cutOffAt,
          profilesCount: qty,
          purchaseTotalCost: totalCost,
          status: 'ACTIVE',
          createdByUserId: userId,
        },
      });

      // 5) slots P1..Pn
      await tx.accountSlot.createMany({
        data: Array.from({ length: qty }, (_, i) => ({
          accountId: account.id,
          code: `P${i + 1}`,
          status: 'AVAILABLE',
          createdByUserId: userId,
        })),
      });

      // 6) movimiento IN
      await tx.inventoryMovement.create({
        data: {
          companyId,
          productId: dto.productId,
          type: 'IN',
          qty,
          unitCost,
          totalCost,
          accountId: account.id,
          createdByUserId: userId,
        },
      });

      // 7) balance ponderado
      await this.applyWeightedBalance(
        tx,
        companyId,
        dto.productId,
        qty,
        totalCost,
      );

      return tx.account.findUnique({
        where: { id: account.id },
        include: {
          product: true,
          supplier: true,
          slots: { orderBy: { id: 'asc' } },
        },
      });
    });
  }

  // =========================
  // READ
  // =========================
  async findAll(
    companyId: number,
    productId?: number,
    includeInactive = false,
  ) {
    return this.prisma.account.findMany({
      where: {
        companyId,
        ...(productId ? { productId } : {}),
        ...(includeInactive ? {} : { status: { not: 'INACTIVE' } }),
      },
      orderBy: { id: 'desc' },
      include: { product: true, supplier: true, slots: true },
    });
  }

  async findOne(companyId: number, id: number, includeInactive = false) {
    const account = await this.prisma.account.findFirst({
      where: {
        id,
        companyId,
        ...(includeInactive ? {} : { status: { not: 'INACTIVE' } }),
      },
      include: {
        product: true,
        supplier: true,
        slots: { orderBy: { id: 'asc' } },
      },
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async listSlots(companyId: number, accountId: number) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId, status: { not: 'INACTIVE' } },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    return this.prisma.accountSlot.findMany({
      where: { accountId },
      orderBy: { id: 'asc' },
    });
  }

  // =========================
  // UPDATE (todos los campos + recalculos)
  // =========================
  async update(
    companyId: number,
    id: number,
    userId: number,
    dto: UpdateAccountDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.findFirst({
        where: { id, companyId },
      });
      if (!account) throw new NotFoundException('Account not found');

      if (account.status === 'INACTIVE') {
        throw new BadRequestException(
          'No puedes actualizar una cuenta INACTIVE',
        );
      }

      // Si se envía purchasedAt/cutOffAt validar coherencia
      const purchasedAt = dto.purchasedAt ? new Date(dto.purchasedAt) : null;
      const cutOffAt = dto.cutOffAt ? new Date(dto.cutOffAt) : null;

      if (purchasedAt && isNaN(purchasedAt.getTime())) {
        throw new BadRequestException('purchasedAt inválida');
      }
      if (cutOffAt && isNaN(cutOffAt.getTime())) {
        throw new BadRequestException('cutOffAt inválida');
      }
      if (purchasedAt && purchasedAt.getTime() < new Date().getTime()) {
        throw new BadRequestException(
          'purchasedAt no puede ser menor a la fecha actual',
        );
      }
      const finalPurchasedAt = purchasedAt ?? account.purchasedAt;
      const finalCutOffAt = cutOffAt ?? account.cutOffAt;
      if (finalCutOffAt.getTime() <= finalPurchasedAt.getTime()) {
        throw new BadRequestException('cutOffAt debe ser mayor a purchasedAt');
      }

      // validar product si cambia
      if (dto.productId) {
        const product = await tx.product.findFirst({
          where: { id: dto.productId, companyId, type: 'PLATFORM' },
          select: { id: true },
        });
        if (!product)
          throw new BadRequestException(
            'productId inválido (PLATFORM de esta empresa)',
          );
      }

      // supplier: permitir null / id / crear inline
      let supplierId: number | null | undefined = undefined;

      if (dto.supplierId === null) {
        supplierId = null;
      } else if (dto.supplierId) {
        const supplier = await tx.supplier.findFirst({
          where: { id: dto.supplierId, companyId },
          select: { id: true },
        });
        if (!supplier)
          throw new BadRequestException(
            'supplierId inválido (no pertenece a la empresa)',
          );
        supplierId = supplier.id;
      } else if (dto.supplier) {
        const existing = await tx.supplier.findFirst({
          where: { companyId, name: dto.supplier.name },
          select: { id: true },
        });
        if (existing) supplierId = existing.id;
        else {
          const created = await tx.supplier.create({
            data: {
              companyId,
              name: dto.supplier.name,
              contact: dto.supplier.contact,
              createdByUserId: userId,
            },
            select: { id: true },
          });
          supplierId = created.id;
        }
      }

      // 1) Si cambia profilesCount => ajustar slots + movimiento ADJUST qty
      if (
        dto.profilesCount !== undefined &&
        dto.profilesCount !== account.profilesCount
      ) {
        await this.adjustSlotsAndStock(tx, account, userId, dto.profilesCount);
      }

      // 2) Si cambia purchaseTotalCost => ajustar kardex (ADJUST qty=0)
      if (dto.purchaseTotalCost !== undefined) {
        const newTotal = new Prisma.Decimal(dto.purchaseTotalCost);
        const oldTotal = account.purchaseTotalCost;

        const diff = newTotal.sub(oldTotal);
        // si diff != 0 registramos el movimiento
        if (!diff.isZero()) {
          await tx.inventoryMovement.create({
            data: {
              companyId: account.companyId,
              productId: account.productId,
              type: 'ADJUST',
              qty: 0,
              unitCost: new Prisma.Decimal(0),
              totalCost: diff, // ✅ ajusta valor sin tocar stock
              accountId: account.id,
              createdByUserId: userId,
            },
          });

          // recalcular avgCost con deltaQty = 0 y deltaTotalCost = diff
          await this.applyWeightedBalance(
            tx,
            account.companyId,
            account.productId,
            0,
            diff,
          );
        }
      }

      // 3) update de campos
      return tx.account.update({
        where: { id: account.id },
        data: {
          productId: dto.productId ?? undefined,
          supplierId: supplierId === undefined ? undefined : supplierId,
          emailLogin: dto.emailLogin ?? undefined,
          passwordLogin: dto.passwordLogin ?? undefined,
          purchasedAt: purchasedAt ?? undefined,
          cutOffAt: cutOffAt ?? undefined,
          purchaseTotalCost: dto.purchaseTotalCost
            ? new Prisma.Decimal(dto.purchaseTotalCost)
            : undefined,
          profilesCount: dto.profilesCount ?? undefined,
        },
        include: {
          product: true,
          supplier: true,
          slots: { orderBy: { id: 'asc' } },
        },
      });
    });
  }

  // =========================
  // DELETE (soft)
  // =========================
  async softDelete(companyId: number, id: number, userId: number) {
    const account = await this.prisma.account.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    if (account.status === 'INACTIVE') {
      return { ok: true, message: 'Account ya estaba INACTIVE' };
    }

    // recomendación: no deshabilitar si tiene ventas activas (cuando exista SlotSale)
    // por ahora solo deshabilita:
    await this.prisma.account.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    return { ok: true };
  }

  // =========================
  // Helpers
  // =========================
  private async adjustSlotsAndStock(
    tx: Prisma.TransactionClient,
    account: any,
    userId: number,
    newCount: number,
  ) {
    if (newCount < 1)
      throw new BadRequestException('profilesCount must be >= 1');

    const oldCount = account.profilesCount;
    const delta = newCount - oldCount;

    if (delta > 0) {
      await tx.accountSlot.createMany({
        data: Array.from({ length: delta }, (_, i) => ({
          accountId: account.id,
          code: `P${oldCount + i + 1}`,
          status: 'AVAILABLE',
          createdByUserId: userId,
        })),
      });

      await tx.inventoryMovement.create({
        data: {
          companyId: account.companyId,
          productId: account.productId,
          type: 'ADJUST',
          qty: delta,
          unitCost: new Prisma.Decimal(0),
          totalCost: new Prisma.Decimal(0),
          accountId: account.id,
          createdByUserId: userId,
        },
      });

      await this.applyWeightedBalance(
        tx,
        account.companyId,
        account.productId,
        delta,
        new Prisma.Decimal(0),
      );
      return;
    }

    if (delta < 0) {
      const reduceBy = Math.abs(delta);

      const slots = await tx.accountSlot.findMany({
        where: { accountId: account.id },
        orderBy: { id: 'asc' },
      });

      const extras = slots.slice(newCount);
      const notAvailable = extras.filter((s) => s.status !== 'AVAILABLE');
      if (notAvailable.length > 0) {
        throw new BadRequestException(
          'No puedes reducir perfiles: hay slots vendidos/bloqueados.',
        );
      }

      await tx.accountSlot.updateMany({
        where: { id: { in: extras.map((e) => e.id) } },
        data: { status: 'DISABLED' },
      });

      await tx.inventoryMovement.create({
        data: {
          companyId: account.companyId,
          productId: account.productId,
          type: 'ADJUST',
          qty: -reduceBy,
          unitCost: new Prisma.Decimal(0),
          totalCost: new Prisma.Decimal(0),
          accountId: account.id,
          createdByUserId: userId,
        },
      });

      await this.applyWeightedBalance(
        tx,
        account.companyId,
        account.productId,
        -reduceBy,
        new Prisma.Decimal(0),
      );
    }
  }

  /**
   * Ponderado:
   * newAvg = (oldAvg*oldQty + deltaTotalCost) / (oldQty + deltaQty)
   * deltaQty puede ser 0 (ajuste de costo)
   */
  private async applyWeightedBalance(
    tx: Prisma.TransactionClient,
    companyId: number,
    productId: number,
    deltaQty: number,
    deltaTotalCost: Prisma.Decimal,
  ) {
    const current = await tx.productInventoryBalance.findUnique({
      where: { companyId_productId: { companyId, productId } },
    });

    if (!current) {
      const initialQty = deltaQty;
      const initialAvg =
        initialQty === 0
          ? new Prisma.Decimal(0)
          : deltaTotalCost.div(new Prisma.Decimal(initialQty));

      await tx.productInventoryBalance.create({
        data: {
          companyId,
          productId,
          qtyOnHand: initialQty,
          avgCost: initialAvg,
        },
      });
      return;
    }

    const oldQty = current.qtyOnHand;
    const newQty = oldQty + deltaQty;
    if (newQty < 0) throw new BadRequestException('Inventario insuficiente');

    if (newQty === 0) {
      await tx.productInventoryBalance.update({
        where: { companyId_productId: { companyId, productId } },
        data: { qtyOnHand: 0 },
      });
      return;
    }

    const oldTotal = current.avgCost.mul(new Prisma.Decimal(oldQty));
    const newTotal = oldTotal.add(deltaTotalCost);
    const newAvg = newTotal.div(new Prisma.Decimal(newQty));

    await tx.productInventoryBalance.update({
      where: { companyId_productId: { companyId, productId } },
      data: { qtyOnHand: newQty, avgCost: newAvg },
    });
  }
}

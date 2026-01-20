import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma, InventoryMovementType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================
  // IN (crear cuenta)
  // ============================
  async registerIn(params: {
    companyId: number;
    productId: number;
    qty: number;
    totalCost: Prisma.Decimal;
    unitCost: Prisma.Decimal;
    accountId?: number;
    userId: number;
  }) {
    if (params.qty <= 0) {
      throw new BadRequestException('IN qty debe ser mayor a 0');
    }

    await this.prisma.$transaction(async (tx) => {
      // 1️⃣ registrar movimiento
      await tx.inventoryMovement.create({
        data: {
          companyId: params.companyId,
          productId: params.productId,
          type: InventoryMovementType.IN,
          qty: params.qty,
          unitCost: params.unitCost,
          totalCost: params.totalCost,
          accountId: params.accountId,
          createdByUserId: params.userId,
        },
      });

      // 2️⃣ actualizar balance
      await this.recalculateBalance(tx, {
        companyId: params.companyId,
        productId: params.productId,
      });
    });
  }

  // ============================
  // OUT (venta slot)
  // ============================
  async registerOut(params: {
    companyId: number;
    productId: number;
    qty: number;
    slotSaleId?: number;
    userId: number;
  }): Promise<Prisma.Decimal> {
    if (params.qty <= 0) {
      throw new BadRequestException('OUT qty debe ser mayor a 0');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1️⃣ obtener balance actual
      const balance = await tx.productInventoryBalance.findUnique({
        where: {
          companyId_productId: {
            companyId: params.companyId,
            productId: params.productId,
          },
        },
      });

      if (!balance || balance.qtyOnHand < params.qty) {
        throw new BadRequestException('Stock insuficiente');
      }

      const unitCost = balance.avgCost;
      const totalCost = unitCost.mul(params.qty);

      // 2️⃣ registrar movimiento
      await tx.inventoryMovement.create({
        data: {
          companyId: params.companyId,
          productId: params.productId,
          type: InventoryMovementType.OUT,
          qty: params.qty,
          unitCost,
          totalCost,
          slotSaleId: params.slotSaleId,
          createdByUserId: params.userId,
        },
      });

      // 3️⃣ actualizar balance
      await this.recalculateBalance(tx, {
        companyId: params.companyId,
        productId: params.productId,
      });

      // 👉 retornamos el costo (COGS) para guardarlo en SlotSale
      return unitCost;
    });
  }

  // ============================
  // ADJUST (cambio de perfiles o costo)
  // ============================
  async registerAdjust(params: {
    companyId: number;
    productId: number;
    qty: number; // puede ser + / -
    totalCost: Prisma.Decimal; // puede ser + / -
    userId: number;
  }) {
    if (params.qty === 0 && params.totalCost.equals(0)) {
      return; // no hay nada que ajustar
    }

    const unitCost =
      params.qty !== 0
        ? params.totalCost.div(params.qty)
        : new Prisma.Decimal(0);

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.create({
        data: {
          companyId: params.companyId,
          productId: params.productId,
          type: InventoryMovementType.ADJUST,
          qty: params.qty,
          unitCost,
          totalCost: params.totalCost,
          createdByUserId: params.userId,
        },
      });

      await this.recalculateBalance(tx, {
        companyId: params.companyId,
        productId: params.productId,
      });
    });
  }

  // ============================
  // RECÁLCULO DE BALANCE
  // ============================
  private async recalculateBalance(
    tx: Prisma.TransactionClient,
    params: { companyId: number; productId: number },
  ) {
    const movements = await tx.inventoryMovement.findMany({
      where: {
        companyId: params.companyId,
        productId: params.productId,
      },
      orderBy: { createdAt: 'asc' },
    });

    let qty = new Prisma.Decimal(0);
    let value = new Prisma.Decimal(0);

    for (const m of movements) {
      if (
        m.type === InventoryMovementType.IN ||
        m.type === InventoryMovementType.ADJUST
      ) {
        qty = qty.add(m.qty);
        value = value.add(m.totalCost);
      } else if (m.type === InventoryMovementType.OUT) {
        qty = qty.sub(m.qty);
        value = value.sub(m.totalCost);
      }
    }

    if (qty.lessThan(0)) {
      throw new BadRequestException('Inventario inconsistente (qty negativa)');
    }

    const avgCost = qty.equals(0) ? new Prisma.Decimal(0) : value.div(qty);

    await tx.productInventoryBalance.upsert({
      where: {
        companyId_productId: {
          companyId: params.companyId,
          productId: params.productId,
        },
      },
      update: {
        qtyOnHand: qty.toNumber(),
        avgCost,
      },
      create: {
        companyId: params.companyId,
        productId: params.productId,
        qtyOnHand: qty.toNumber(),
        avgCost,
      },
    });
  }
}

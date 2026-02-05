import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexRefType, KardexType } from '@prisma/client';
import { Prisma } from '@prisma/client';

@Injectable()
export class KardexService {
  constructor(private prisma: PrismaService) {}

  /**
   * Asegura que exista el CostItem para (companyId, platformId)
   */
  async ensureItem(companyId: number, platformId: number) {
    const existing = await this.prisma.costItem.findUnique({
      where: { companyId_platformId: { companyId, platformId } },
    });
    if (existing) return existing;

    // Crear con stock 0 y avgCost 0
    return this.prisma.costItem.create({
      data: {
        companyId,
        platformId,
        unit: 'PROFILE',
        stock: 0,
        // avgCost lo seteamos a 0
        avgCost: new Prisma.Decimal(0),
      },
    });
  }

  /**
   * Registra movimiento IN (entrada de perfiles) y recalcula promedio ponderado.
   * unitCost viene calculado (totalCost / qty) desde el módulo de cuentas.
   */
  async registerIn(params: {
    companyId: number;
    platformId: number;
    qty: number;
    unitCost: Prisma.Decimal;
    refType: KardexRefType;
    accountId?: number;
  }) {
    const { companyId, platformId, qty, unitCost, refType, accountId } = params;
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('qty inválido para kardex IN.');
    }
    if (unitCost.lessThan(0)) {
      throw new BadRequestException('unitCost inválido para kardex IN.');
    }

    // Transacción para evitar carreras
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.costItem.upsert({
        where: { companyId_platformId: { companyId, platformId } },
        update: {},
        create: {
          companyId,
          platformId,
          unit: 'PROFILE',
          stock: 0,
          avgCost: new Prisma.Decimal(0),
        },
      });

      const oldStock = item.stock;
      const oldAvg = item.avgCost;

      const inTotal = unitCost.mul(qty);
      const newStock = oldStock + qty;

      // newAvg = (oldStock*oldAvg + qty*unitCost) / newStock
      const newAvg =
        newStock === 0
          ? new Prisma.Decimal(0)
          : oldAvg.mul(oldStock).add(inTotal).div(newStock);

      const updatedItem = await tx.costItem.update({
        where: { id: item.id },
        data: {
          stock: newStock,
          avgCost: newAvg,
        },
      });

      const movement = await tx.kardexMovement.create({
        data: {
          companyId,
          itemId: item.id,
          type: KardexType.IN,
          refType,
          qty,
          unitCost,
          totalCost: inTotal,
          stockAfter: newStock,
          avgCostAfter: newAvg,
          accountId: accountId ?? null,
          saleId: null,
        },
      });

      return { item: updatedItem, movement };
    });
  }

  /**
   * Registra movimiento OUT (venta) a costo promedio actual.
   * Retorna el unitCost usado (avgCost vigente) para guardarlo en la venta.
   */
  async registerOut(params: {
    companyId: number;
    platformId: number;
    qty: number; // normalmente 1
    refType: KardexRefType;
    accountId?: number;
    saleId?: number;
  }) {
    const { companyId, platformId, qty, refType, accountId, saleId } = params;
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('qty inválido para kardex OUT.');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.costItem.findUnique({
        where: { companyId_platformId: { companyId, platformId } },
      });
      if (!item) throw new BadRequestException('CostItem no existe.');
      if (item.stock < qty) {
        throw new BadRequestException('Stock insuficiente para la salida.');
      }

      const unitCost = item.avgCost;
      const outTotal = unitCost.mul(qty);
      const newStock = item.stock - qty;

      // Promedio no cambia en salida
      const newAvg = item.avgCost;

      const updatedItem = await tx.costItem.update({
        where: { id: item.id },
        data: { stock: newStock, avgCost: newAvg },
      });

      const movement = await tx.kardexMovement.create({
        data: {
          companyId,
          itemId: item.id,
          type: KardexType.OUT,
          refType,
          qty,
          unitCost,
          totalCost: outTotal,
          stockAfter: newStock,
          avgCostAfter: newAvg,
          accountId: accountId ?? null,
          saleId: saleId ?? null,
        },
      });

      return { item: updatedItem, movement, unitCost };
    });
  }

  /**
   * Ajuste OUT (por inactivación o reducción de perfilesTotal).
   * Igual que OUT: baja stock y usa avgCost vigente.
   */
  async registerAdjustOut(params: {
    companyId: number;
    platformId: number;
    qty: number;
    refType: KardexRefType;
    accountId?: number;
  }) {
    const { companyId, platformId, qty, refType, accountId } = params;
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('qty inválido para kardex ADJUST OUT.');
    }

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.costItem.findUnique({
        where: { companyId_platformId: { companyId, platformId } },
      });
      if (!item) throw new BadRequestException('CostItem no existe.');
      if (item.stock < qty) {
        throw new BadRequestException('Stock insuficiente para el ajuste.');
      }

      const unitCost = item.avgCost;
      const totalCost = unitCost.mul(qty);
      const newStock = item.stock - qty;

      const updatedItem = await tx.costItem.update({
        where: { id: item.id },
        data: { stock: newStock },
      });

      const movement = await tx.kardexMovement.create({
        data: {
          companyId,
          itemId: item.id,
          type: KardexType.ADJUST,
          refType,
          qty,
          unitCost,
          totalCost,
          stockAfter: newStock,
          avgCostAfter: item.avgCost,
          accountId: accountId ?? null,
          saleId: null,
        },
      });

      return { item: updatedItem, movement, unitCost };
    });
  }
}

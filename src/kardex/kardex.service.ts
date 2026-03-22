import { BadRequestException, Injectable } from '@nestjs/common';
import { KardexRefType, KardexType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type TxClient = Prisma.TransactionClient;

@Injectable()
export class KardexService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================
  // Escritura
  // =========================
  async registerIn(
    params: {
      companyId: number;
      platformId: number;
      qty: number;
      unitCost: Prisma.Decimal;
      refType: KardexRefType;
      accountId?: number;
    },
    tx?: TxClient,
  ) {
    const { companyId, platformId, qty, unitCost, refType, accountId } = params;
    const client = tx ?? this.prisma;

    if (!Number.isInteger(qty) || qty <= 0)
      throw new BadRequestException('qty inválido para kardex IN.');
    if (unitCost.lessThan(0))
      throw new BadRequestException('unitCost inválido para kardex IN.');

    const item = await client.costItem.upsert({
      where: { companyId_platformId: { companyId, platformId } },
      update: {},
      create: {
        companyId,
        platformId,
        unit: 'PROFILE_DAY',
        stock: 0,
        avgCost: new Prisma.Decimal(0),
      },
    });

    const oldStock = item.stock;
    const oldAvg = item.avgCost;
    const inTotal = unitCost.mul(qty);
    const newStock = oldStock + qty;

    const newAvg =
      newStock === 0
        ? new Prisma.Decimal(0)
        : oldAvg.mul(oldStock).add(inTotal).div(newStock);

    const updatedItem = await client.costItem.update({
      where: { id: item.id },
      data: { stock: newStock, avgCost: newAvg },
    });

    const movement = await client.kardexMovement.create({
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
  }

  async registerOut(
    params: {
      companyId: number;
      platformId: number;
      qty: number;
      refType: KardexRefType;
      accountId?: number;
      saleId?: number;
    },
    tx?: TxClient,
  ) {
    const { companyId, platformId, qty, refType, accountId, saleId } = params;
    const client = tx ?? this.prisma;

    if (!Number.isInteger(qty) || qty <= 0)
      throw new BadRequestException('qty inválido para kardex OUT.');

    const item = await client.costItem.findUnique({
      where: { companyId_platformId: { companyId, platformId } },
    });
    if (!item) throw new BadRequestException('CostItem no existe.');

    // Solo valida stock si NO es una venta
    if (refType !== KardexRefType.PROFILE_SALE && item.stock < qty)
      throw new BadRequestException('Stock insuficiente para la salida.');

    const unitCost = item.avgCost;
    const outTotal = unitCost.mul(qty);
    const newStock = item.stock - qty;

    const updatedItem = await client.costItem.update({
      where: { id: item.id },
      data: { stock: newStock },
    });

    const movement = await client.kardexMovement.create({
      data: {
        companyId,
        itemId: item.id,
        type: KardexType.OUT,
        refType,
        qty,
        unitCost,
        totalCost: outTotal,
        stockAfter: newStock,
        avgCostAfter: item.avgCost,
        accountId: accountId ?? null,
        saleId: saleId ?? null,
      },
    });

    return { item: updatedItem, movement, unitCost };
  }

  async registerAdjustOut(
    params: {
      companyId: number;
      platformId: number;
      qty: number;
      refType: KardexRefType;
      accountId?: number;
      unitCost?: Prisma.Decimal; // ← opcional
    },
    tx?: TxClient,
  ) {
    const {
      companyId,
      platformId,
      qty,
      refType,
      accountId,
      unitCost: overrideUnitCost,
    } = params;
    const client = tx ?? this.prisma;

    if (!Number.isInteger(qty) || qty <= 0)
      throw new BadRequestException('qty inválido para kardex ADJUST OUT.');

    const item = await client.costItem.findUnique({
      where: { companyId_platformId: { companyId, platformId } },
    });
    if (!item) throw new BadRequestException('CostItem no existe.');
    if (item.stock < qty)
      throw new BadRequestException('Stock insuficiente para el ajuste.');

    // Si viene unitCost externo lo usa, si no usa el avgCost actual
    const unitCost = overrideUnitCost ?? item.avgCost;
    const totalCost = unitCost.mul(qty);
    const newStock = item.stock - qty;

    // Recalcula avgCost solo si viene unitCost externo
    const newAvg = overrideUnitCost
      ? newStock === 0
        ? new Prisma.Decimal(0)
        : item.avgCost.mul(item.stock).sub(totalCost).div(newStock)
      : item.avgCost;

    const updatedItem = await client.costItem.update({
      where: { id: item.id },
      data: { stock: newStock, avgCost: newAvg },
    });

    const movement = await client.kardexMovement.create({
      data: {
        companyId,
        itemId: item.id,
        type: KardexType.ADJUST,
        refType,
        qty,
        unitCost,
        totalCost,
        stockAfter: newStock,
        avgCostAfter: newAvg,
        accountId: accountId ?? null,
        saleId: null,
      },
    });

    return { item: updatedItem, movement, unitCost };
  }

  // =========================
  // Lectura
  // =========================
  async getItems(companyId: number) {
    return this.prisma.costItem.findMany({
      where: { companyId },
      select: {
        id: true,
        unit: true,
        stock: true,
        avgCost: true,
        platform: { select: { id: true, name: true, active: true } },
        updatedAt: true,
      },
      orderBy: { platform: { name: 'asc' } },
    });
  }

  async getMovements(
    companyId: number,
    params: { platformId?: number; take?: number; skip?: number },
  ) {
    const { platformId, take = 50, skip = 0 } = params;

    return this.prisma.kardexMovement.findMany({
      where: {
        companyId,
        ...(platformId ? { item: { platformId } } : {}),
      },
      select: {
        id: true,
        type: true,
        refType: true,
        qty: true,
        unitCost: true,
        totalCost: true,
        stockAfter: true,
        avgCostAfter: true,
        createdAt: true,
        item: {
          select: { platform: { select: { id: true, name: true } } },
        },
        account: { select: { id: true, email: true } },
        sale: { select: { id: true, salePrice: true, daysAssigned: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }
}

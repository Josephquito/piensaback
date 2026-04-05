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

  /**
   * Entrada de inventario con recálculo de costo promedio ponderado.
   * Unidad: PROFILE_DAY.
   */
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

    // Costo promedio ponderado:
    // Si el stock previo era negativo (ventas anticipadas), el nuevo avg
    // se calcula solo sobre el qty entrante para no distorsionar el promedio.
    const newAvg =
      newStock <= 0
        ? new Prisma.Decimal(0)
        : oldStock <= 0
          ? unitCost
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

  /**
   * Salida de inventario al costo promedio actual.
   * Permite stock negativo solo para PROFILE_SALE (ventas anticipadas).
   */
  async registerOut(
    params: {
      companyId: number;
      platformId: number;
      qty: number;
      refType: KardexRefType;
      accountId?: number;
      saleId?: number;
      allowNegative?: boolean;
    },
    tx?: TxClient,
  ) {
    const {
      companyId,
      platformId,
      qty,
      refType,
      accountId,
      saleId,
      allowNegative = false,
    } = params;
    const client = tx ?? this.prisma;

    if (!Number.isInteger(qty) || qty <= 0)
      throw new BadRequestException('qty inválido para kardex OUT.');

    const item = await client.costItem.findUnique({
      where: { companyId_platformId: { companyId, platformId } },
    });
    if (!item) throw new BadRequestException('CostItem no existe.');

    if (
      !allowNegative &&
      refType !== KardexRefType.PROFILE_SALE &&
      item.stock < qty
    )
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

  /**
   * Ajuste de salida. Permite override de unitCost y stock negativo opcional.
   * Recalcula avgCost solo si se provee unitCost override.
   */
  async registerAdjustOut(
    params: {
      companyId: number;
      platformId: number;
      qty: number;
      refType: KardexRefType;
      accountId?: number;
      unitCost?: Prisma.Decimal;
      allowNegative?: boolean;
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
      allowNegative = false,
    } = params;
    const client = tx ?? this.prisma;

    if (!Number.isInteger(qty) || qty <= 0)
      throw new BadRequestException('qty inválido para kardex ADJUST OUT.');

    const item = await client.costItem.findUnique({
      where: { companyId_platformId: { companyId, platformId } },
    });
    if (!item) throw new BadRequestException('CostItem no existe.');

    if (!allowNegative && item.stock < qty)
      throw new BadRequestException('Stock insuficiente para el ajuste.');

    const unitCost = overrideUnitCost ?? item.avgCost;
    const totalCost = unitCost.mul(qty);
    const newStock = item.stock - qty;

    const newAvg = overrideUnitCost
      ? newStock <= 0
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

  /**
   * Corrección de costo promedio sin mover stock.
   * Registra la revalorización completa del inventario actual.
   * Usar cuando cambia el totalCost de una cuenta ya registrada.
   */
  async registerCostCorrection(
    params: {
      companyId: number;
      platformId: number;
      newAvgCost: Prisma.Decimal;
      refType: KardexRefType;
      accountId?: number;
    },
    tx?: TxClient,
  ) {
    const { companyId, platformId, newAvgCost, refType, accountId } = params;
    const client = tx ?? this.prisma;

    if (newAvgCost.lessThan(0))
      throw new BadRequestException('newAvgCost inválido para corrección.');

    const item = await client.costItem.findUnique({
      where: { companyId_platformId: { companyId, platformId } },
    });
    if (!item) throw new BadRequestException('CostItem no existe.');

    if (newAvgCost.equals(item.avgCost)) return null; // nada que corregir

    const stock = item.stock;
    // totalCost refleja el impacto de la revalorización sobre el stock actual
    // puede ser negativo si el costo bajó (corrección a la baja)
    const totalCost = newAvgCost.sub(item.avgCost).mul(Math.abs(stock));

    const updatedItem = await client.costItem.update({
      where: { id: item.id },
      data: { avgCost: newAvgCost },
    });

    const movement = await client.kardexMovement.create({
      data: {
        companyId,
        itemId: item.id,
        type: KardexType.ADJUST,
        refType,
        qty: Math.abs(stock), // refleja sobre cuántas unidades aplica la corrección
        unitCost: newAvgCost,
        totalCost,
        stockAfter: stock, // stock no cambia
        avgCostAfter: newAvgCost,
        accountId: accountId ?? null,
        saleId: null,
      },
    });

    return { item: updatedItem, movement };
  }

  /**
   * Cierre limpio de stock positivo residual.
   * Stock negativo (ventas anticipadas) se respeta y no se toca.
   * Usar antes de registerIn en reactivaciones de cuenta.
   */
  async resetStock(
    params: {
      companyId: number;
      platformId: number;
      refType: KardexRefType;
      accountId?: number;
    },
    tx?: TxClient,
  ) {
    const { companyId, platformId, refType, accountId } = params;
    const client = tx ?? this.prisma;

    const item = await client.costItem.findUnique({
      where: { companyId_platformId: { companyId, platformId } },
    });

    // Stock negativo = ventas anticipadas válidas, no tocar
    if (!item || item.stock <= 0) return null;

    const qty = item.stock;

    const updatedItem = await client.costItem.update({
      where: { id: item.id },
      data: { stock: 0 },
    });

    const movement = await client.kardexMovement.create({
      data: {
        companyId,
        itemId: item.id,
        type: KardexType.ADJUST,
        refType,
        qty,
        unitCost: item.avgCost,
        totalCost: item.avgCost.mul(qty),
        stockAfter: 0,
        avgCostAfter: item.avgCost,
        accountId: accountId ?? null,
        saleId: null,
      },
    });

    return { item: updatedItem, movement };
  }

  /**
   * Recalculo completo de stock por cambio de días o perfiles.
   * Cierra el stock actual (ADJUST_OUT) y abre nuevo (IN) con los
   * parámetros correctos. Es la operación atómica para ediciones
   * que alteran la cantidad de días en inventario.
   */
  async recalculateStock(
    params: {
      companyId: number;
      platformId: number;
      newQty: number; // profilesTotal * durationDays nuevo
      newDailyCost: Prisma.Decimal;
      refType: KardexRefType;
      accountId?: number;
    },
    tx?: TxClient,
  ) {
    const { companyId, platformId, newQty, newDailyCost, refType, accountId } =
      params;
    const client = tx ?? this.prisma;

    if (!Number.isInteger(newQty) || newQty <= 0)
      throw new BadRequestException('newQty inválido para recalculateStock.');
    if (newDailyCost.lessThan(0))
      throw new BadRequestException(
        'newDailyCost inválido para recalculateStock.',
      );

    const item = await client.costItem.findUnique({
      where: { companyId_platformId: { companyId, platformId } },
    });
    if (!item) throw new BadRequestException('CostItem no existe.');

    const currentStock = item.stock;

    // Paso 1: cerrar stock actual
    // Si es negativo (ventas anticipadas), también se cierra — el IN posterior
    // lo reestablecerá correctamente con el nuevo dailyCost
    if (currentStock !== 0) {
      const closeQty = Math.abs(currentStock);
      const closeCost = item.avgCost.mul(closeQty);

      await client.costItem.update({
        where: { id: item.id },
        data: { stock: 0 },
      });

      await client.kardexMovement.create({
        data: {
          companyId,
          itemId: item.id,
          type: KardexType.ADJUST,
          refType,
          qty: closeQty,
          unitCost: item.avgCost,
          totalCost: closeCost,
          stockAfter: 0,
          avgCostAfter: item.avgCost,
          accountId: accountId ?? null,
          saleId: null,
        },
      });
    }

    // Paso 2: abrir nuevo stock con los parámetros actualizados
    return this.registerIn(
      {
        companyId,
        platformId,
        qty: newQty,
        unitCost: newDailyCost,
        refType,
        accountId,
      },
      client as TxClient,
    );
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

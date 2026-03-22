import { BadRequestException, Injectable } from '@nestjs/common';
import { KardexRefType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import {
  StreamingAccountsService,
  ACCOUNT_SELECT,
} from './streaming-accounts.service';
import { CorrectCostDto } from './dto/correct-cost.dto';

@Injectable()
export class StreamingAccountCostCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
  ) {}

  async correctCost(id: number, dto: CorrectCostDto, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);

    const newTotalCost = this.accounts.parseDecimal(dto.totalCost, 'totalCost');
    const oldTotalCost = account.totalCost;

    if (newTotalCost.equals(oldTotalCost))
      throw new BadRequestException('El costo nuevo es igual al actual.');

    const newDailyCost = this.accounts.calcDailyCost(
      newTotalCost,
      account.profilesTotal,
      account.durationDays,
    );

    const oldDailyCost = this.accounts.calcDailyCost(
      oldTotalCost,
      account.profilesTotal,
      account.durationDays,
    );

    const sales = await this.prisma.streamingSale.findMany({
      where: { accountId: account.id, companyId },
      select: {
        id: true,
        daysAssigned: true,
        dailyCost: true,
        costAtSale: true,
        status: true,
      },
    });

    const costDelta = newTotalCost.sub(oldTotalCost);
    const dailyCostDelta = newDailyCost.sub(oldDailyCost);

    await this.prisma.$transaction(async (tx) => {
      // 1) Recalcular costAtSale y dailyCost de todas las ventas
      for (const sale of sales) {
        const newCostAtSale = newDailyCost.mul(sale.daysAssigned);
        await tx.streamingSale.update({
          where: { id: sale.id },
          data: {
            dailyCost: newDailyCost,
            costAtSale: newCostAtSale,
          },
        });
      }

      // 2) Ajuste kardex sobre el stock real actual
      if (!dailyCostDelta.isZero()) {
        const costItem = await tx.costItem.findUnique({
          where: {
            companyId_platformId: { companyId, platformId: account.platformId },
          },
          select: { stock: true },
        });

        const currentStock = costItem?.stock ?? 0;

        if (currentStock !== 0) {
          if (dailyCostDelta.greaterThan(0)) {
            // costo subió — IN por la diferencia sobre el stock actual
            await this.kardex.registerIn(
              {
                companyId,
                platformId: account.platformId,
                qty: Math.abs(currentStock), // ← abs por si es negativo
                unitCost: dailyCostDelta,
                refType: KardexRefType.COST_CORRECTION,
                accountId: account.id,
              },
              tx,
            );
          } else {
            // costo bajó — ADJUST_OUT sobre el stock actual
            await this.kardex.registerAdjustOut(
              {
                companyId,
                platformId: account.platformId,
                qty: Math.abs(currentStock), // ← abs por si es negativo
                refType: KardexRefType.COST_CORRECTION,
                accountId: account.id,
                allowNegative: true, // ← permite negativo
              },
              tx,
            );
          }
        }
      }

      // 3) Balance proveedor — ajusta la diferencia
      await tx.supplier.update({
        where: { id: account.supplierId },
        data: { balance: { decrement: costDelta } },
      });

      // 4) Actualizar totalCost en la cuenta
      await tx.streamingAccount.update({
        where: { id: account.id },
        data: { totalCost: newTotalCost },
      });
    });

    return this.prisma.streamingAccount.findUnique({
      where: { id: account.id },
      select: ACCOUNT_SELECT,
    });
  }
}

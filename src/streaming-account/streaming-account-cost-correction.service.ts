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

    // Si dailyCost no cambia (caso raro pero posible por redondeo decimal)
    // igual se actualiza el totalCost y el balance del proveedor
    const dailyCostChanged = !newDailyCost.equals(oldDailyCost);

    const costDelta = newTotalCost.sub(oldTotalCost);

    // Traer ventas fuera de la tx para no alargarla innecesariamente
    const sales = await this.prisma.streamingSale.findMany({
      where: { accountId: account.id, companyId },
      select: {
        id: true,
        daysAssigned: true,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      // 1) Recalcular costAtSale y dailyCost de todas las ventas de esta cuenta
      if (dailyCostChanged && sales.length > 0) {
        for (const sale of sales) {
          await tx.streamingSale.update({
            where: { id: sale.id },
            data: {
              dailyCost: newDailyCost,
              costAtSale: newDailyCost.mul(sale.daysAssigned),
            },
          });
        }
      }

      // 2) Corrección de costo promedio en kardex sin mover stock
      // registerCostCorrection actualiza avgCost en CostItem y registra
      // el movimiento con qty = stock actual y totalCost = delta de valoración
      if (dailyCostChanged) {
        await this.kardex.registerCostCorrection(
          {
            companyId,
            platformId: account.platformId,
            newAvgCost: newDailyCost,
            refType: KardexRefType.COST_CORRECTION,
            accountId: account.id,
          },
          tx,
        );
      }

      // 3) Balance proveedor — ajusta solo la diferencia
      // costDelta positivo = costo subió = proveedor debe más = decrement
      // costDelta negativo = costo bajó = proveedor debe menos = increment (decrement negativo)
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

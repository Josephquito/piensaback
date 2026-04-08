import { BadRequestException, Injectable } from '@nestjs/common';
import { KardexRefType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import {
  StreamingAccountsService,
  ACCOUNT_SELECT,
} from './streaming-accounts.service';
import { StreamingAccountUpdateService } from './streaming-account-update.service';
import { CorrectCostDto } from './dto/correct-cost.dto';

@Injectable()
export class StreamingAccountCostCorrectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
    private readonly updateService: StreamingAccountUpdateService,
  ) {}

  async correctCost(id: number, dto: CorrectCostDto, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);

    const newTotalCost = this.accounts.parseDecimal(dto.totalCost, 'totalCost');
    const oldTotalCost = new Prisma.Decimal(account.totalCost);

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

    const dailyCostChanged = !newDailyCost.equals(oldDailyCost);

    // Resolver nuevos montos parciales con la modalidad actual y el nuevo totalCost
    const newAmounts = this.accounts['resolvePaymentAmounts'](
      account.paymentMode,
      newTotalCost,
      {
        cashAmount: account.cashAmount?.toString(),
        creditAmount: account.creditAmount?.toString(),
        balanceAmount: account.balanceAmount?.toString(),
      },
    );

    // Delta viejo que estaba aplicado en el proveedor
    const oldDelta = this.updateService['resolveExistingDelta'](
      account.paymentMode,
      oldTotalCost,
      account.cashAmount ? new Prisma.Decimal(account.cashAmount) : null,
      account.creditAmount ? new Prisma.Decimal(account.creditAmount) : null,
      account.balanceAmount ? new Prisma.Decimal(account.balanceAmount) : null,
    );

    // Delta nuevo con el nuevo totalCost
    const newDelta = newAmounts.balanceDelta;

    // Diferencia neta a aplicar al balance
    const balanceAdjustment = newDelta.sub(oldDelta);

    const sales = await this.prisma.streamingSale.findMany({
      where: {
        accountId: account.id,
        companyId,
        status: { in: ['ACTIVE', 'PAUSED'] },
      },
      select: { id: true, daysAssigned: true },
    });

    await this.prisma.$transaction(async (tx) => {
      // 1) Recalcular costAtSale y dailyCost de ventas vigentes
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

      // 2) Corrección de costo promedio en kardex
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

      // 3) Ajuste de balance del proveedor si hay diferencia
      if (!balanceAdjustment.equals(0)) {
        const supplier = await tx.supplier.findUnique({
          where: { id: account.supplierId },
          select: { balance: true },
        });

        const balanceBefore = new Prisma.Decimal(supplier!.balance);
        const balanceAfter = balanceBefore.add(balanceAdjustment);

        await tx.supplier.update({
          where: { id: account.supplierId },
          data: { balance: balanceAfter },
        });

        await tx.supplierMovement.create({
          data: {
            companyId,
            supplierId: account.supplierId,
            type: 'ADJUSTMENT',
            amount: newTotalCost,
            balanceBefore,
            balanceAfter,
            accountId: account.id,
            date: new Date(),
          },
        });
      }

      // 4) Actualizar cuenta con nuevo costo y nuevos montos parciales
      await tx.streamingAccount.update({
        where: { id: account.id },
        data: {
          totalCost: newTotalCost,
          cashAmount: newAmounts.cashAmount,
          creditAmount: newAmounts.creditAmount,
          balanceAmount: newAmounts.balanceAmount,
        },
      });
    });

    return this.prisma.streamingAccount.findUnique({
      where: { id: account.id },
      select: ACCOUNT_SELECT,
    });
  }
}

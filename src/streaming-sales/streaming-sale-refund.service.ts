import { BadRequestException, Injectable } from '@nestjs/common';
import { KardexRefType, Prisma, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { StreamingSalesService, SALE_SELECT } from './streaming-sales.service';
import { daysRemainingFrom } from '../common/utils/date.utils';

@Injectable()
export class StreamingSaleRefundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly sales: StreamingSalesService,
  ) {}

  async refund(id: number, companyId: number) {
    const sale = await this.sales.findAndAssert(id, companyId);

    if (sale.status !== SaleStatus.PAUSED)
      throw new BadRequestException(
        'Solo se pueden reembolsar ventas pausadas.',
      );

    if (!sale.creditAmount || sale.creditAmount.isZero())
      throw new BadRequestException('No hay saldo a reembolsar.');

    if (sale.creditRefunded)
      throw new BadRequestException('Esta venta ya fue reembolsada.');

    const customer = await this.prisma.customer.findFirst({
      where: { id: sale.customerId, companyId },
      select: { id: true, balance: true },
    });
    if (!customer) throw new BadRequestException('Cliente no encontrado.');

    const currentBalance = new Prisma.Decimal(customer.balance ?? '0');
    const newBalance = currentBalance.add(sale.creditAmount).toFixed(4);

    return this.prisma.$transaction(async (tx) => {
      await tx.accountProfile.update({
        where: { id: sale.profileId },
        data: { status: 'AVAILABLE' },
      });

      const updatedSale = await tx.streamingSale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.CLOSED,
          creditRefunded: true,
          pausedAt: null,
          pausedDaysLeft: null,
        },
        select: SALE_SELECT,
      });

      await tx.customer.update({
        where: { id: sale.customerId },
        data: { balance: newBalance },
      });

      return updatedSale;
    });
  }

  async emptyAll(accountId: number, companyId: number, today: Date) {
    const account = await this.prisma.streamingAccount.findFirst({
      where: { id: accountId, companyId },
      select: { id: true, platformId: true },
    });
    if (!account) throw new BadRequestException('Cuenta no encontrada.');

    const activeSales = await this.prisma.streamingSale.findMany({
      where: {
        accountId: account.id,
        companyId,
        status: {
          in: [SaleStatus.ACTIVE, SaleStatus.EXPIRED, SaleStatus.PAUSED],
        },
      },
      select: {
        id: true,
        profileId: true,
        cutoffDate: true,
        dailyCost: true,
        status: true,
        pausedDaysLeft: true,
      },
    });

    if (activeSales.length === 0)
      throw new BadRequestException('No hay perfiles activos para vaciar.');

    await this.prisma.$transaction(async (tx) => {
      for (const sale of activeSales) {
        const daysLeft =
          sale.status === SaleStatus.PAUSED && sale.pausedDaysLeft != null
            ? Number(sale.pausedDaysLeft)
            : daysRemainingFrom(sale.cutoffDate, today);

        if (daysLeft > 0) {
          await this.kardex.registerIn(
            {
              companyId,
              platformId: account.platformId,
              qty: daysLeft,
              unitCost: sale.dailyCost,
              refType: KardexRefType.PROFILE_SALE,
              accountId: account.id,
            },
            tx,
          );
        }

        await tx.accountProfile.update({
          where: { id: sale.profileId },
          data: { status: 'AVAILABLE' },
        });

        await tx.streamingSale.update({
          where: { id: sale.id },
          data: {
            status: SaleStatus.CLOSED,
            pausedAt: null,
            pausedDaysLeft: null,
            creditAmount: null,
          },
        });
      }
    });

    return { ok: true, emptied: activeSales.length };
  }
}

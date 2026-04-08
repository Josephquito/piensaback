import { BadRequestException, Injectable } from '@nestjs/common';
import {
  KardexRefType,
  RenewalMessageStatus,
  SaleStatus,
  StreamingAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import {
  StreamingAccountsService,
  ACCOUNT_SELECT,
} from './streaming-accounts.service';
import { RenewAccountDto } from './dto/renew-account.dto';

@Injectable()
export class StreamingAccountRenewalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
  ) {}

  async renew(
    id: number,
    dto: RenewAccountDto,
    companyId: number,
    today: Date,
  ) {
    const account = await this.accounts.findAndAssert(id, companyId);

    const newPurchaseDate = this.accounts.parseDate(
      dto.purchaseDate,
      'purchaseDate',
    );
    const newTotalCost = this.accounts.parseDecimal(dto.totalCost, 'totalCost');

    if (!Number.isInteger(dto.durationDays) || dto.durationDays <= 0)
      throw new BadRequestException('durationDays inválido.');

    const newCutoffDate = new Date(
      Date.UTC(
        newPurchaseDate.getUTCFullYear(),
        newPurchaseDate.getUTCMonth(),
        newPurchaseDate.getUTCDate() + dto.durationDays,
      ),
    );

    const dailyCost = this.accounts.calcDailyCost(
      newTotalCost,
      account.profilesTotal,
      dto.durationDays,
    );

    const qty = account.profilesTotal * dto.durationDays;

    await this.prisma.$transaction(async (tx) => {
      // 1) Actualizar cuenta — si estaba EXPIRED vuelve a ACTIVE
      await tx.streamingAccount.update({
        where: { id: account.id },
        data: {
          purchaseDate: newPurchaseDate,
          cutoffDate: newCutoffDate,
          durationDays: dto.durationDays,
          totalCost: newTotalCost,
          ...(account.status === StreamingAccountStatus.EXPIRED
            ? { status: StreamingAccountStatus.ACTIVE }
            : {}),
        },
      });

      // 2) Si la cuenta estaba EXPIRED
      if (account.status === StreamingAccountStatus.EXPIRED) {
        // 2a) Desbloquear perfiles BLOCKED → AVAILABLE
        await tx.accountProfile.updateMany({
          where: { accountId: account.id, status: 'BLOCKED' },
          data: { status: 'AVAILABLE' },
        });

        // 2b) Reanudar ventas PAUSED con su cutoffDate original intacta
        // No se recalcula nada — en la plataforma la cuenta nunca dejó
        // de funcionar, solo no estaba registrada en el sistema.
        const pausedSales = await tx.streamingSale.findMany({
          where: {
            companyId,
            accountId: account.id,
            status: SaleStatus.PAUSED,
          },
          select: { id: true, cutoffDate: true },
        });

        for (const sale of pausedSales) {
          const todayStr = today.toISOString().split('T')[0];
          const cutoffStr = sale.cutoffDate.toISOString().split('T')[0];

          const renewalStatus =
            todayStr === cutoffStr
              ? RenewalMessageStatus.PENDING
              : RenewalMessageStatus.NOT_APPLICABLE;

          await tx.streamingSale.update({
            where: { id: sale.id },
            data: {
              status: SaleStatus.ACTIVE,
              pausedAt: null,
              pausedDaysLeft: null,
              creditAmount: null,
              renewalStatus,
            },
          });
        }
      }

      // 3) Balance proveedor
      await tx.supplier.update({
        where: { id: account.supplierId },
        data: { balance: { decrement: newTotalCost } },
      });

      // 4) Kardex IN — agregar días nuevos al stock de la plataforma
      await this.kardex.registerIn(
        {
          companyId,
          platformId: account.platformId,
          qty,
          unitCost: dailyCost,
          refType: KardexRefType.ACCOUNT_RENEWAL,
          accountId: account.id,
        },
        tx,
      );
    });

    return this.prisma.streamingAccount.findUnique({
      where: { id: account.id },
      select: ACCOUNT_SELECT,
    });
  }
}

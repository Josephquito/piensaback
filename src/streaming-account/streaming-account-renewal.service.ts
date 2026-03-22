import { BadRequestException, Injectable } from '@nestjs/common';
import { KardexRefType, StreamingAccountStatus } from '@prisma/client';
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

  async renew(id: number, dto: RenewAccountDto, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);

    const newPurchaseDate = this.accounts.parseDate(
      dto.purchaseDate,
      'purchaseDate',
    );
    const newCutoffDate = this.accounts.parseDate(dto.cutoffDate, 'cutoffDate');
    const newTotalCost = this.accounts.parseDecimal(dto.totalCost, 'totalCost');

    if (!Number.isInteger(dto.durationDays) || dto.durationDays <= 0)
      throw new BadRequestException('durationDays inválido.');

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

      // 2) Balance proveedor
      await tx.supplier.update({
        where: { id: account.supplierId },
        data: { balance: { decrement: newTotalCost } },
      });

      // 3) Kardex IN
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

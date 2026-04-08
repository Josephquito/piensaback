import { BadRequestException, Injectable } from '@nestjs/common';
import { KardexRefType, Prisma, StreamingAccountStatus } from '@prisma/client';
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

    if (account.status === StreamingAccountStatus.DELETED)
      throw new BadRequestException(
        'No se puede renovar una cuenta eliminada.',
      );

    if (account.status === StreamingAccountStatus.INACTIVE)
      throw new BadRequestException(
        'No se puede renovar una cuenta inactiva. Reactívala primero.',
      );

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

    // Resolver montos según modalidad de pago
    const amounts = this.accounts['resolvePaymentAmounts'](
      dto.paymentMode,
      newTotalCost,
      dto,
    );

    await this.prisma.$transaction(async (tx) => {
      // 1) Validar proveedor dentro de la tx
      const supplier = await tx.supplier.findFirst({
        where: { id: account.supplierId, companyId },
        select: { id: true, balance: true },
      });
      if (!supplier) throw new BadRequestException('Proveedor no accesible.');

      // 2) Actualizar cuenta
      await tx.streamingAccount.update({
        where: { id: account.id },
        data: {
          purchaseDate: newPurchaseDate,
          cutoffDate: newCutoffDate,
          durationDays: dto.durationDays,
          totalCost: newTotalCost,
          paymentMode: dto.paymentMode,
          cashAmount: amounts.cashAmount,
          creditAmount: amounts.creditAmount,
          balanceAmount: amounts.balanceAmount,
          ...(account.status === StreamingAccountStatus.EXPIRED
            ? { status: StreamingAccountStatus.ACTIVE }
            : {}),
        },
      });

      // 3) Desbloquear perfiles BLOCKED si estaba EXPIRED
      if (account.status === StreamingAccountStatus.EXPIRED) {
        await tx.accountProfile.updateMany({
          where: { accountId: account.id, status: 'BLOCKED' },
          data: { status: 'AVAILABLE' },
        });
      }

      // 4) Balance proveedor según modalidad
      if (!amounts.balanceDelta.equals(0)) {
        const balanceBefore = new Prisma.Decimal(supplier.balance);
        const balanceAfter = balanceBefore.add(amounts.balanceDelta);

        await tx.supplier.update({
          where: { id: account.supplierId },
          data: { balance: balanceAfter },
        });

        // Registrar movimiento
        await tx.supplierMovement.create({
          data: {
            companyId,
            supplierId: account.supplierId,
            type: 'PURCHASE',
            amount: newTotalCost,
            balanceBefore,
            balanceAfter,
            accountId: account.id,
            date: new Date(),
          },
        });
      }

      // 5) Registrar renovación en historial
      await tx.accountRenewal.create({
        data: {
          companyId,
          accountId: account.id,
          purchaseDate: newPurchaseDate,
          cutoffDate: newCutoffDate,
          durationDays: dto.durationDays,
          totalCost: newTotalCost,
          paymentMode: dto.paymentMode,
          cashAmount: amounts.cashAmount,
          creditAmount: amounts.creditAmount,
          balanceAmount: amounts.balanceAmount,
        },
      });

      // 6) Kardex IN — agregar días nuevos al stock
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

  async getRenewalHistory(id: number, companyId: number) {
    await this.accounts.findAndAssert(id, companyId);

    const renewals = await this.prisma.accountRenewal.findMany({
      where: { accountId: id, companyId },
      orderBy: { createdAt: 'asc' },
    });

    const totalInvested = renewals.reduce(
      (sum, r) => sum.add(r.totalCost),
      new Prisma.Decimal(0),
    );

    const totalDays = renewals.reduce((sum, r) => sum + r.durationDays, 0);

    return {
      renewalCount: renewals.length,
      totalInvested,
      totalDays,
      firstRenewalDate: renewals[0]?.purchaseDate ?? null,
      lastRenewalDate: renewals[renewals.length - 1]?.purchaseDate ?? null,
      renewals,
    };
  }
}

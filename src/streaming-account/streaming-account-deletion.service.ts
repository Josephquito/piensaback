import { BadRequestException, Injectable } from '@nestjs/common';
import {
  KardexRefType,
  SaleStatus,
  StreamingAccountStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { StreamingAccountsService } from './streaming-accounts.service';

@Injectable()
export class StreamingAccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
  ) {}

  // Calcula daysLeft con comparación por fecha
  private daysRemainingByDate(cutoffDate: Date): number {
    const now = new Date();
    const cutoff = new Date(
      Date.UTC(
        cutoffDate.getUTCFullYear(),
        cutoffDate.getUTCMonth(),
        cutoffDate.getUTCDate(),
      ),
    );
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    return Math.max(
      0,
      Math.ceil((cutoff.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
    );
  }

  async remove(id: number, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);

    if (account.status === StreamingAccountStatus.DELETED)
      throw new BadRequestException('La cuenta ya está eliminada.');

    const now = new Date();

    const activeSales = await this.prisma.streamingSale.count({
      where: {
        accountId: account.id,
        status: { in: [SaleStatus.ACTIVE, SaleStatus.PAUSED] },
        cutoffDate: { gte: now },
      },
    });

    if (activeSales > 0)
      throw new BadRequestException(
        `No se puede eliminar: hay ${activeSales} perfiles con ventas vigentes.`,
      );

    // Usa comparación por fecha, no por timestamp
    const daysLeft = this.daysRemainingByDate(account.cutoffDate);

    await this.prisma.$transaction(async (tx) => {
      // 1) Vaciar ventas ACTIVE y EXPIRED vencidas
      const expiredSales = await tx.streamingSale.findMany({
        where: {
          accountId: account.id,
          status: { in: [SaleStatus.ACTIVE, SaleStatus.EXPIRED] },
          cutoffDate: { lt: now },
        },
        select: { id: true, profileId: true },
      });

      if (expiredSales.length > 0) {
        await tx.streamingSale.updateMany({
          where: { id: { in: expiredSales.map((s) => s.id) } },
          data: { status: SaleStatus.CLOSED },
        });
        await tx.accountProfile.updateMany({
          where: { id: { in: expiredSales.map((s) => s.profileId) } },
          data: { status: 'AVAILABLE' },
        });
      }

      // 2) Ajuste kardex — solo perfiles que YA eran AVAILABLE antes del paso 1
      // (los recién liberados ya no tienen días vigentes)
      const originalAvailableCount = await tx.accountProfile.count({
        where: {
          accountId: account.id,
          status: 'AVAILABLE',
          // excluye los que acabamos de liberar en el paso 1
          id: { notIn: expiredSales.map((s) => s.profileId) },
        },
      });

      const qtyToAdjust = originalAvailableCount * daysLeft;
      if (qtyToAdjust > 0) {
        await this.kardex.registerAdjustOut(
          {
            companyId,
            platformId: account.platformId,
            qty: qtyToAdjust,
            refType: KardexRefType.ACCOUNT_INACTIVATION,
            accountId: account.id,
          },
          tx,
        );
      }

      // 3) Marcar cuenta como DELETED
      await tx.streamingAccount.update({
        where: { id: account.id },
        data: { status: StreamingAccountStatus.DELETED },
      });
    });

    return { ok: true, deletedId: id };
  }
}

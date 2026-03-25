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

  async remove(id: number, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);

    if (account.status === StreamingAccountStatus.DELETED)
      throw new BadRequestException('La cuenta ya está eliminada.');

    const now = new Date();

    // Bloquear eliminación si hay ventas vigentes con clientes activos
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

    const daysLeft = this.accounts.daysRemainingByDate(account.cutoffDate);

    await this.prisma.$transaction(async (tx) => {
      // 1) Cerrar ventas vencidas que quedaron en ACTIVE o EXPIRED
      // Estos perfiles pasan a AVAILABLE para que el conteo del paso 2
      // refleje el estado real al momento de eliminar
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

      // 2) Ajuste kardex — todos los perfiles AVAILABLE después del paso 1
      // Incluye los que ya eran AVAILABLE y los que se liberaron de ventas
      // vencidas, porque todos representan días que ya no estarán en inventario.
      // Los perfiles BLOCKED (cuenta inactiva) también se ajustan porque
      // al eliminar la cuenta esos días desaparecen del negocio.
      const availableAndBlockedCount = await tx.accountProfile.count({
        where: {
          accountId: account.id,
          status: { in: ['AVAILABLE', 'BLOCKED'] },
        },
      });

      const qtyToAdjust = availableAndBlockedCount * daysLeft;
      if (qtyToAdjust > 0) {
        await this.kardex.registerAdjustOut(
          {
            companyId,
            platformId: account.platformId,
            qty: qtyToAdjust,
            refType: KardexRefType.ACCOUNT_DELETION,
            accountId: account.id,
            allowNegative: true,
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

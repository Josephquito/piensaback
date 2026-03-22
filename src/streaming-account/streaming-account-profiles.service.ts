import { BadRequestException, Injectable } from '@nestjs/common';
import { KardexRefType, StreamingAccountStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { StreamingAccountsService } from './streaming-accounts.service';

@Injectable()
export class StreamingAccountProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
  ) {}

  // =========================
  // AGREGAR SLOT
  // =========================
  async addProfile(id: number, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);
    const newTotal = account.profilesTotal + 1;
    const daysLeft = this.accounts.daysRemainingByDate(account.cutoffDate);

    // Recalcula dailyCost con el nuevo total de perfiles
    const newDailyCost = this.accounts.calcDailyCost(
      account.totalCost,
      newTotal, // ← nuevo total
      account.durationDays,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.accountProfile.create({
        data: {
          accountId: account.id,
          profileNo: newTotal,
          status: 'AVAILABLE',
        },
      });

      await tx.streamingAccount.update({
        where: { id: account.id },
        data: { profilesTotal: newTotal },
      });

      if (daysLeft > 0) {
        await this.kardex.registerIn(
          {
            companyId,
            platformId: account.platformId,
            qty: daysLeft,
            unitCost: newDailyCost, // ← costo recalculado
            refType: KardexRefType.PROFILE_ADJUST,
            accountId: account.id,
          },
          tx,
        );
      }
    });

    return this.accounts.findOne(account.id, companyId);
  }

  // =========================
  // ELIMINAR SLOT
  // =========================
  async removeProfile(id: number, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);
    const newTotal = account.profilesTotal - 1;

    const soldCount = await this.prisma.accountProfile.count({
      where: { accountId: account.id, status: 'SOLD' },
    });

    if (newTotal < soldCount)
      throw new BadRequestException(
        'No se puede reducir: todos los perfiles están vendidos.',
      );

    const daysLeft = this.accounts.daysRemainingByDate(account.cutoffDate);

    // Calcula el dailyCost con el nuevo total de perfiles
    const newDailyCost = this.accounts.calcDailyCost(
      account.totalCost,
      newTotal,
      account.durationDays,
    );

    await this.prisma.$transaction(async (tx) => {
      const toDelete = await tx.accountProfile.findFirst({
        where: { accountId: account.id, status: 'AVAILABLE' },
        orderBy: { profileNo: 'desc' },
        select: { id: true },
      });

      if (!toDelete)
        throw new BadRequestException(
          'No hay perfiles disponibles para eliminar.',
        );

      await tx.accountProfile.delete({ where: { id: toDelete.id } });

      await tx.streamingAccount.update({
        where: { id: account.id },
        data: { profilesTotal: newTotal },
      });

      if (daysLeft > 0) {
        await this.kardex.registerAdjustOut(
          {
            companyId,
            platformId: account.platformId,
            qty: daysLeft,
            unitCost: newDailyCost, // ← costo del nuevo total
            refType: KardexRefType.PROFILE_ADJUST,
            accountId: account.id,
          },
          tx,
        );
      }
    });

    return this.accounts.findOne(account.id, companyId);
  }

  // =========================
  // INACTIVAR
  // =========================
  async inactivate(id: number, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);

    if (account.status === StreamingAccountStatus.INACTIVE)
      throw new BadRequestException('La cuenta ya está inactiva.');

    const daysLeft = this.accounts.daysRemainingByDate(account.cutoffDate);

    await this.prisma.$transaction(async (tx) => {
      const availableProfiles = await tx.accountProfile.findMany({
        where: { accountId: account.id, status: 'AVAILABLE' },
        select: { id: true },
      });

      if (availableProfiles.length > 0) {
        await tx.accountProfile.updateMany({
          where: { accountId: account.id, status: 'AVAILABLE' },
          data: { status: 'BLOCKED' },
        });

        const qtyToAdjust = availableProfiles.length * daysLeft;
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
      }

      await tx.streamingAccount.update({
        where: { id: account.id },
        data: { status: StreamingAccountStatus.INACTIVE },
      });
    });

    return this.accounts.findOne(account.id, companyId);
  }

  // =========================
  // REACTIVAR
  // =========================
  async reactivate(id: number, companyId: number) {
    const account = await this.accounts.findAndAssert(id, companyId);

    if (account.status !== StreamingAccountStatus.INACTIVE)
      throw new BadRequestException('La cuenta no está inactiva.');

    if (this.accounts.isExpired(account.cutoffDate))
      throw new BadRequestException(
        'No se puede reactivar: la cuenta está vencida. Renuévala primero.',
      );

    await this.prisma.$transaction(async (tx) => {
      await tx.accountProfile.updateMany({
        where: { accountId: account.id, status: 'BLOCKED' },
        data: { status: 'AVAILABLE' },
      });

      await tx.streamingAccount.update({
        where: { id: account.id },
        data: { status: StreamingAccountStatus.ACTIVE },
      });
    });

    return this.accounts.findOne(account.id, companyId);
  }
}

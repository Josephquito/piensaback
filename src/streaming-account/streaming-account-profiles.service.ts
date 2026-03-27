import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KardexRefType, Prisma, StreamingAccountStatus } from '@prisma/client';
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

      // El perfil extra no tuvo costo adicional — el proveedor
      // no cobró más por él. unitCost = 0 es la realidad.
      // El avgCost de la plataforma se diluye proporcionalmente.
      if (daysLeft > 0) {
        await this.kardex.registerIn(
          {
            companyId,
            platformId: account.platformId,
            qty: daysLeft,
            unitCost: new Prisma.Decimal(0),
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

    if (newTotal < 0)
      throw new BadRequestException('La cuenta no tiene perfiles.');

    const soldCount = await this.prisma.accountProfile.count({
      where: { accountId: account.id, status: 'SOLD' },
    });

    if (newTotal < soldCount)
      throw new BadRequestException(
        'No se puede reducir: todos los perfiles están vendidos.',
      );

    const daysLeft = this.accounts.daysRemainingByDate(account.cutoffDate);

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

      // Sale al avgCost actual sin override — el costo promedio ponderado
      // se encarga de reflejar correctamente la pérdida.
      // No se pasa unitCost para que use el avgCost real del momento.
      if (daysLeft > 0) {
        await this.kardex.registerAdjustOut(
          {
            companyId,
            platformId: account.platformId,
            qty: daysLeft,
            refType: KardexRefType.PROFILE_ADJUST,
            accountId: account.id,
            allowNegative: true,
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

        // Sale al avgCost actual — son días reales que se pierden
        // temporalmente. Se recuperan en reactivate con registerIn.
        const qtyToAdjust = availableProfiles.length * daysLeft;
        if (qtyToAdjust > 0) {
          await this.kardex.registerAdjustOut(
            {
              companyId,
              platformId: account.platformId,
              qty: qtyToAdjust,
              refType: KardexRefType.ACCOUNT_INACTIVATION,
              accountId: account.id,
              allowNegative: true,
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

    const daysLeft = this.accounts.daysRemainingByDate(account.cutoffDate);
    const dailyCost = this.accounts.calcDailyCost(
      account.totalCost,
      account.profilesTotal,
      account.durationDays,
    );

    await this.prisma.$transaction(async (tx) => {
      const blockedProfiles = await tx.accountProfile.findMany({
        where: { accountId: account.id, status: 'BLOCKED' },
        select: { id: true },
      });

      if (blockedProfiles.length > 0) {
        await tx.accountProfile.updateMany({
          where: { accountId: account.id, status: 'BLOCKED' },
          data: { status: 'AVAILABLE' },
        });

        // Restaurar los días que se ajustaron al inactivar.
        // Entran al dailyCost original de la cuenta.
        const qtyToRestore = blockedProfiles.length * daysLeft;
        if (qtyToRestore > 0) {
          await this.kardex.registerIn(
            {
              companyId,
              platformId: account.platformId,
              qty: qtyToRestore,
              unitCost: dailyCost,
              refType: KardexRefType.ACCOUNT_REACTIVATION,
              accountId: account.id,
            },
            tx,
          );
        }
      }

      await tx.streamingAccount.update({
        where: { id: account.id },
        data: { status: StreamingAccountStatus.ACTIVE },
      });
    });

    return this.accounts.findOne(account.id, companyId);
  }

  // =========================
  // ASIGNAR ETIQUETA
  // =========================
  async assignLabel(
    profileId: number,
    labelId: number | null,
    companyId: number,
  ) {
    const profile = await this.prisma.accountProfile.findFirst({
      where: { id: profileId, account: { companyId } },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Perfil no encontrado.');

    if (labelId !== null) {
      const label = await this.prisma.profileLabel.findFirst({
        where: { id: labelId, companyId },
        select: { id: true },
      });
      if (!label) throw new NotFoundException('Etiqueta no encontrada.');
    }

    return this.prisma.accountProfile.update({
      where: { id: profileId },
      data: { labelId },
      select: {
        id: true,
        profileNo: true,
        status: true,
        labelId: true,
        label: { select: { id: true, name: true, color: true } },
      },
    });
  }
}

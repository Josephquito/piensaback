import { Injectable } from '@nestjs/common';
import { KardexRefType, Prisma, StreamingAccountStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import { AccountGroup, ProfileData } from './helpers/csv-parser.helper';
import {
  CustomerIndex,
  resolveCustomerId,
} from './helpers/customer-index.helper';
import { resolveSupplier } from './helpers/supplier-resolver.helper';
import { addDays } from './utils/date.util';
import {
  KardexRefType as KRT,
  RenewalMessageStatus,
  SaleStatus,
} from '@prisma/client';
import { isExpiredFrom, getTodayUTC } from '../common/utils/date.utils';

export interface ImportWarning {
  email: string;
  profileNo: number;
  reason: string;
}

export interface ImportSkip {
  email: string;
  reason: string;
}

@Injectable()
export class AccountImporterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
  ) {}

  async importAccount(
    group: AccountGroup,
    platformId: number,
    companyId: number,
    customerIndex: CustomerIndex,
    today: Date = getTodayUTC(), // ← agrega con default
  ): Promise<ImportWarning[]> {
    const warnings: ImportWarning[] = [];

    if (!group.password) throw new Error('Contraseña vacía.');
    if (!group.purchaseDate || isNaN(group.purchaseDate.getTime()))
      throw new Error('Fecha de compra inválida.');
    if (!group.durationDays || group.durationDays <= 0)
      throw new Error('duration_days inválido.');
    if (group.totalCost.lessThan(0)) throw new Error('total_cost inválido.');
    if (!group.profiles.length) throw new Error('Sin perfiles.');

    const cutoffDate = addDays(group.purchaseDate, group.durationDays);
    const profilesTotal = group.profiles.length;
    const dailyCost =
      profilesTotal > 0 && group.durationDays > 0
        ? group.totalCost.div(profilesTotal).div(group.durationDays)
        : new Prisma.Decimal(0);

    // ← status inicial de la cuenta según si ya venció
    const accountExpired = isExpiredFrom(cutoffDate, today);
    const initialAccountStatus = accountExpired
      ? StreamingAccountStatus.EXPIRED
      : StreamingAccountStatus.ACTIVE;

    await this.prisma.$transaction(
      async (tx) => {
        const supplier = await resolveSupplier(
          tx,
          companyId,
          group.supplierName,
          group.supplierContact,
        );

        const deleted = await tx.streamingAccount.findFirst({
          where: {
            companyId,
            platformId,
            email: group.email,
            status: StreamingAccountStatus.DELETED,
          },
          select: { id: true },
        });

        const existing = await tx.streamingAccount.findFirst({
          where: {
            companyId,
            platformId,
            email: group.email,
            status: { not: StreamingAccountStatus.DELETED },
          },
          select: {
            id: true,
            supplierId: true,
            totalCost: true,
            profilesTotal: true,
            password: true,
            durationDays: true,
            purchaseDate: true,
            cutoffDate: true,
          },
        });

        let accountId: number;
        let isNew = false;

        if (deleted && !existing) {
          await tx.streamingAccount.update({
            where: { id: deleted.id },
            data: {
              supplierId: supplier.id,
              password: group.password,
              profilesTotal,
              durationDays: group.durationDays,
              purchaseDate: group.purchaseDate,
              cutoffDate,
              totalCost: group.totalCost,
              notes: null,
              status: initialAccountStatus, // ← corregido
            },
          });

          const oldProfiles = await tx.accountProfile.findMany({
            where: { accountId: deleted.id },
            select: { id: true },
          });
          const oldProfileIds = oldProfiles.map((p) => p.id);
          if (oldProfileIds.length > 0) {
            await tx.streamingSale.deleteMany({
              where: { profileId: { in: oldProfileIds } },
            });
          }
          await tx.accountProfile.deleteMany({
            where: { accountId: deleted.id },
          });

          accountId = deleted.id;
          isNew = true;

          await tx.supplier.update({
            where: { id: supplier.id },
            data: { balance: { decrement: group.totalCost } },
          });
        } else if (existing) {
          accountId = existing.id;
          isNew = false;

          const oldSupplierId = existing.supplierId;
          const oldCost = existing.totalCost;
          const newCost = group.totalCost;
          const newSupplierId = supplier.id;

          await tx.streamingAccount.update({
            where: { id: accountId },
            data: {
              supplierId: newSupplierId,
              password: group.password,
              profilesTotal,
              durationDays: group.durationDays,
              purchaseDate: group.purchaseDate,
              cutoffDate,
              totalCost: newCost,
              status: initialAccountStatus, // ← corregido también aquí
            },
          });

          if (oldSupplierId !== newSupplierId) {
            await tx.supplier.update({
              where: { id: oldSupplierId },
              data: { balance: { increment: oldCost } },
            });
            await tx.supplier.update({
              where: { id: newSupplierId },
              data: { balance: { decrement: newCost } },
            });
          } else if (!oldCost.equals(newCost)) {
            const delta = newCost.sub(oldCost);
            await tx.supplier.update({
              where: { id: oldSupplierId },
              data: { balance: { decrement: delta } },
            });
          }
        } else {
          const account = await tx.streamingAccount.create({
            data: {
              companyId,
              platformId,
              supplierId: supplier.id,
              email: group.email,
              password: group.password,
              profilesTotal,
              durationDays: group.durationDays,
              purchaseDate: group.purchaseDate,
              cutoffDate,
              totalCost: group.totalCost,
              notes: null,
              status: initialAccountStatus, // ← corregido
            },
            select: { id: true },
          });
          accountId = account.id;
          isNew = true;

          await tx.supplier.update({
            where: { id: supplier.id },
            data: { balance: { decrement: group.totalCost } },
          });
        }

        if (isNew) {
          await this.kardex.registerIn(
            {
              companyId,
              platformId,
              qty: profilesTotal * group.durationDays,
              unitCost: dailyCost,
              refType: KardexRefType.ACCOUNT_PURCHASE,
              accountId,
            },
            tx,
          );
        }

        const existingProfiles = await tx.accountProfile.findMany({
          where: { accountId },
          select: { id: true, profileNo: true, status: true },
        });
        const existingByNo = new Map(
          existingProfiles.map((p) => [p.profileNo, p]),
        );
        const csvProfileNos = new Set(group.profiles.map((p) => p.profileNo));

        for (const ep of existingProfiles) {
          if (!csvProfileNos.has(ep.profileNo) && ep.status === 'SOLD') {
            warnings.push({
              email: group.email,
              profileNo: ep.profileNo,
              reason:
                `El perfil #${ep.profileNo} está VENDIDO en el sistema pero no aparece en el CSV. ` +
                `Cierra la venta manualmente y vuelve a importar.`,
            });
          }
        }

        const profilesToCreate = group.profiles.filter(
          (p) => !existingByNo.has(p.profileNo),
        );
        if (profilesToCreate.length > 0) {
          await tx.accountProfile.createMany({
            data: profilesToCreate.map((p) => ({
              accountId,
              profileNo: p.profileNo,
              status: 'AVAILABLE' as const,
            })),
          });
        }

        const profileWarnings = await this.processProfiles(
          tx,
          group.profiles,
          accountId,
          companyId,
          platformId,
          group.email,
          customerIndex,
          today,
        );
        warnings.push(...profileWarnings);
      },
      { timeout: 30000, maxWait: 10000 },
    );

    return warnings;
  }

  // ================================================================
  // Procesar ventas y etiquetas para cada perfil del CSV
  // ================================================================
  private async processProfiles(
    tx: Prisma.TransactionClient,
    profiles: ProfileData[],
    accountId: number,
    companyId: number,
    platformId: number,
    email: string,
    customerIndex: CustomerIndex,
    today: Date, // ← agrega
  ): Promise<ImportWarning[]> {
    const warnings: ImportWarning[] = [];

    for (const p of profiles) {
      const profile = await tx.accountProfile.findFirst({
        where: { accountId, profileNo: p.profileNo },
        select: { id: true, status: true },
      });
      if (!profile) continue;

      if (p.labelName) {
        const label = await tx.profileLabel.upsert({
          where: {
            companyId_platformId_name: {
              companyId,
              platformId,
              name: p.labelName,
            },
          },
          create: {
            companyId,
            platformId,
            name: p.labelName,
            color: p.labelColor || '#6b7280',
          },
          update: {},
          select: { id: true },
        });
        await tx.accountProfile.update({
          where: { id: profile.id },
          data: { labelId: label.id },
        });
      }

      if (
        !p.salePrice ||
        !p.saleDate ||
        !p.customerName ||
        !p.saleDurationDays
      ) {
        continue;
      }

      const customerId = resolveCustomerId(p.customerName, customerIndex);
      if (!customerId) {
        warnings.push({
          email,
          profileNo: p.profileNo,
          reason:
            `Cliente '${p.customerName}' no encontrado ni por nombre ni por contacto. ` +
            `Créalo manualmente y vuelve a importar.`,
        });
        continue;
      }

      const saleCutoffDate = addDays(p.saleDate, p.saleDurationDays);
      const saleExpired = isExpiredFrom(saleCutoffDate, today); // ← chequeo
      const initialSaleStatus = saleExpired
        ? SaleStatus.EXPIRED
        : SaleStatus.ACTIVE;

      if (profile.status === 'SOLD') {
        const activeSale = await tx.streamingSale.findFirst({
          where: {
            profileId: profile.id,
            status: { in: ['ACTIVE', 'PAUSED'] },
          },
          select: {
            id: true,
            salePrice: true,
            saleDate: true,
            daysAssigned: true,
            cutoffDate: true,
            customerId: true,
          },
        });

        if (!activeSale) continue;

        const changed =
          !activeSale.salePrice.equals(p.salePrice) ||
          activeSale.saleDate.getTime() !== p.saleDate.getTime() ||
          activeSale.daysAssigned !== p.saleDurationDays ||
          activeSale.customerId !== customerId;

        if (changed) {
          await tx.streamingSale.update({
            where: { id: activeSale.id },
            data: {
              salePrice: p.salePrice,
              saleDate: p.saleDate,
              daysAssigned: p.saleDurationDays,
              cutoffDate: saleCutoffDate,
              customerId,
              status: initialSaleStatus, // ← actualiza status también al editar
            },
          });
          await tx.customer.update({
            where: { id: customerId },
            data: { lastPurchaseAt: p.saleDate },
          });
        }
        continue;
      }

      // Perfil AVAILABLE: crear venta nueva
      const { unitCost: saleDailyCost } = await this.kardex.registerOut(
        {
          companyId,
          platformId,
          qty: p.saleDurationDays,
          refType: KardexRefType.PROFILE_SALE,
          accountId,
        },
        tx,
      );

      const costAtSale = saleDailyCost.mul(p.saleDurationDays);

      await tx.accountProfile.update({
        where: { id: profile.id },
        data: { status: 'SOLD' },
      });

      const sale = await tx.streamingSale.create({
        data: {
          companyId,
          platformId,
          accountId,
          profileId: profile.id,
          customerId,
          salePrice: p.salePrice,
          saleDate: p.saleDate,
          daysAssigned: p.saleDurationDays,
          cutoffDate: saleCutoffDate,
          costAtSale,
          dailyCost: saleDailyCost,
          notes: null,
          status: initialSaleStatus, // ← corregido
          renewalStatus: RenewalMessageStatus.NOT_APPLICABLE,
        },
        select: { id: true },
      });

      await tx.customer.update({
        where: { id: customerId },
        data: { lastPurchaseAt: p.saleDate },
      });

      await tx.kardexMovement.updateMany({
        where: {
          companyId,
          accountId,
          refType: KardexRefType.PROFILE_SALE,
          type: 'OUT',
          saleId: null,
        },
        data: { saleId: sale.id },
      });
    }

    return warnings;
  }
}

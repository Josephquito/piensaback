// streaming-account-transfer.service.ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { KardexRefType, SaleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KardexService } from '../kardex/kardex.service';
import {
  StreamingAccountsService,
  ACCOUNT_SELECT,
} from '../streaming-account/streaming-accounts.service';
import { TransferProfileDto } from './dto/transfer-profile.dto';

@Injectable()
export class StreamingSaleTransferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kardex: KardexService,
    private readonly accounts: StreamingAccountsService,
  ) {}

  async transferProfile(
    profileId: number,
    dto: TransferProfileDto,
    companyId: number,
    today: Date,
  ) {
    // ── 1) Cargar perfil origen con su venta activa ──────────────────
    const originProfile = await this.prisma.accountProfile.findFirst({
      where: { id: profileId },
      select: {
        id: true,
        accountId: true,
        profileNo: true,
        status: true,
        account: {
          select: {
            id: true,
            companyId: true,
            platformId: true,
            status: true,
            cutoffDate: true,
          },
        },
        sales: {
          where: { status: { in: [SaleStatus.ACTIVE, SaleStatus.PAUSED] } },
          select: {
            id: true,
            cutoffDate: true,
            dailyCost: true,
            daysAssigned: true,
            status: true,
            pausedDaysLeft: true,
          },
          take: 1,
        },
      },
    });

    if (!originProfile) throw new BadRequestException('Perfil no encontrado.');
    if (originProfile.account.companyId !== companyId)
      throw new BadRequestException('Perfil no accesible.');
    if (originProfile.status !== 'SOLD')
      throw new BadRequestException(
        'Solo se pueden trasladar perfiles vendidos.',
      );

    const sale = originProfile.sales[0];
    if (!sale)
      throw new BadRequestException(
        'El perfil no tiene venta activa para trasladar.',
      );

    // ── 2) Cargar cuenta destino ─────────────────────────────────────
    const targetAccount = await this.accounts.findAndAssert(
      dto.targetAccountId,
      companyId,
    );

    if (targetAccount.id === originProfile.accountId)
      throw new BadRequestException(
        'La cuenta destino es la misma que la origen.',
      );

    if (targetAccount.platformId !== originProfile.account.platformId)
      throw new BadRequestException(
        'Solo se pueden trasladar perfiles entre cuentas de la misma plataforma.',
      );

    if (
      targetAccount.status === 'DELETED' ||
      targetAccount.status === 'INACTIVE'
    )
      throw new BadRequestException('La cuenta destino no está disponible.');

    // ── 3) Buscar perfil disponible en cuenta destino ────────────────
    const targetProfile = await this.prisma.accountProfile.findFirst({
      where: { accountId: targetAccount.id, status: 'AVAILABLE' },
      orderBy: { profileNo: 'asc' },
      select: { id: true, profileNo: true },
    });

    if (!targetProfile)
      throw new BadRequestException(
        'La cuenta destino no tiene perfiles disponibles.',
      );

    // ── 4) Calcular días restantes de la venta ───────────────────────
    const daysLeft =
      sale.status === 'PAUSED' && sale.pausedDaysLeft != null
        ? Number(sale.pausedDaysLeft)
        : this.accounts.daysRemainingByDate(sale.cutoffDate, today);

    // ── 5) Transacción ───────────────────────────────────────────────
    await this.prisma.$transaction(
      async (tx) => {
        // a) Perfil origen → AVAILABLE
        await tx.accountProfile.update({
          where: { id: originProfile.id },
          data: { status: 'AVAILABLE' },
        });

        // b) Perfil destino → SOLD
        await tx.accountProfile.update({
          where: { id: targetProfile.id },
          data: { status: 'SOLD' },
        });

        // c) Reasignar venta al perfil y cuenta destino
        await tx.streamingSale.update({
          where: { id: sale.id },
          data: {
            profileId: targetProfile.id,
            accountId: targetAccount.id,
          },
        });

        // d) Kardex: devolver días al stock desde cuenta origen
        if (daysLeft > 0) {
          await this.kardex.registerIn(
            {
              companyId,
              platformId: originProfile.account.platformId,
              qty: daysLeft,
              unitCost: sale.dailyCost,
              refType: KardexRefType.PROFILE_TRANSFER,
              accountId: originProfile.accountId,
            },
            tx,
          );

          // e) Kardex: sacar días del stock para cuenta destino
          await this.kardex.registerOut(
            {
              companyId,
              platformId: targetAccount.platformId,
              qty: daysLeft,
              refType: KardexRefType.PROFILE_TRANSFER,
              accountId: targetAccount.id,
            },
            tx,
          );

          // f) Reasignar movimientos de kardex del registerOut a la venta
          await tx.kardexMovement.updateMany({
            where: {
              companyId,
              accountId: targetAccount.id,
              refType: KardexRefType.PROFILE_TRANSFER,
              type: 'OUT',
              saleId: null,
            },
            data: { saleId: sale.id },
          });
        }
      },
      { timeout: 15000 },
    );

    // Retorna la cuenta origen actualizada
    return this.prisma.streamingAccount.findUnique({
      where: { id: originProfile.accountId },
      select: ACCOUNT_SELECT,
    });
  }
}

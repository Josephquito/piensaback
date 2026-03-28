import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserJwt } from '../common/types/current-user-jwt.type';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import {
  AdjustBalanceDto,
  BalanceMovementType,
} from './dto/adjust-balance.dto';
import { GoogleAuthService } from '../google/google-auth.service';
import { GoogleContactsService } from '../google/google-contacts.service';

const SUPPLIER_SELECT = {
  id: true,
  name: true,
  contact: true,
  balance: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly googleAuth: GoogleAuthService,
    private readonly googleContacts: GoogleContactsService,
  ) {}

  // ─── Google sync helper ────────────────────────────────────────────

  private async getGoogleContext(companyId: number) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        googleConnected: true,
        googleGroupSuppliers: true,
      },
    });
    if (!company?.googleConnected) return null;
    const accessToken = await this.googleAuth.getAccessToken(companyId);
    return { accessToken, groupResourceName: company.googleGroupSuppliers };
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  private assertNotEmployee(actor: CurrentUserJwt) {
    if (actor.role === BaseRole.EMPLOYEE) {
      throw new ForbiddenException('EMPLOYEE no puede gestionar proveedores.');
    }
  }

  private async findAndAssert(id: number, companyId: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado.');
    return supplier;
  }

  // ─── CRUD ──────────────────────────────────────────────────────────

  async findAll(companyId: number) {
    return this.prisma.supplier.findMany({
      where: { companyId },
      select: SUPPLIER_SELECT,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, companyId },
      select: {
        ...SUPPLIER_SELECT,
        _count: { select: { accounts: true } },
      },
    });
    if (!supplier) throw new NotFoundException('Proveedor no encontrado.');
    return supplier;
  }

  async create(
    dto: CreateSupplierDto,
    companyId: number,
    actor: CurrentUserJwt,
  ) {
    this.assertNotEmployee(actor);
    try {
      const supplier = await this.prisma.supplier.create({
        data: {
          companyId,
          name: dto.name,
          contact: dto.contact,
          notes: dto.notes,
        },
        select: { ...SUPPLIER_SELECT, id: true },
      });

      // Sync → Google
      this.syncCreateToGoogle(supplier, companyId).catch(() => null);

      return supplier;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un proveedor con ese nombre en esta empresa.',
        );
      }
      throw e;
    }
  }

  async update(
    id: number,
    dto: UpdateSupplierDto,
    companyId: number,
    actor: CurrentUserJwt,
  ) {
    this.assertNotEmployee(actor);
    await this.findAndAssert(id, companyId);

    const hasChanges =
      dto.name !== undefined ||
      dto.contact !== undefined ||
      dto.notes !== undefined;

    if (!hasChanges) {
      throw new BadRequestException('No hay campos para actualizar.');
    }

    try {
      const supplier = await this.prisma.supplier.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.contact !== undefined ? { contact: dto.contact } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        select: { ...SUPPLIER_SELECT, id: true, googleContactId: true },
      });

      // Sync → Google
      this.syncUpdateToGoogle(supplier, companyId).catch(() => null);

      return supplier;
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe un proveedor con ese nombre en esta empresa.',
        );
      }
      throw e;
    }
  }

  async remove(id: number, companyId: number, actor: CurrentUserJwt) {
    this.assertNotEmployee(actor);
    const supplier = await this.findAndAssert(id, companyId);
    try {
      await this.prisma.supplier.delete({ where: { id } });

      // Sync → Google
      this.syncDeleteToGoogle(supplier.googleContactId, companyId).catch(
        () => null,
      );

      return { ok: true, deletedId: id };
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2003') {
          throw new BadRequestException(
            'No se puede eliminar: el proveedor tiene cuentas asociadas.',
          );
        }
      }
      throw e;
    }
  }

  // ─── Google sync privados ──────────────────────────────────────────

  private async syncCreateToGoogle(
    supplier: {
      id: number;
      name: string;
      contact: string;
      notes?: string | null;
    },
    companyId: number,
  ) {
    const ctx = await this.getGoogleContext(companyId);
    if (!ctx) return;

    const resourceName = await this.googleContacts.createContact(
      ctx.accessToken,
      {
        name: supplier.name,
        phone: supplier.contact,
        notes: supplier.notes ?? undefined,
      },
    );

    if (ctx.groupResourceName) {
      await this.googleContacts.addContactToGroup(
        ctx.accessToken,
        ctx.groupResourceName,
        resourceName,
      );
    }

    await this.prisma.supplier.update({
      where: { id: supplier.id },
      data: { googleContactId: resourceName },
    });
  }

  private async syncUpdateToGoogle(
    supplier: {
      googleContactId?: string | null;
      name: string;
      contact: string;
      notes?: string | null;
    },
    companyId: number,
  ) {
    if (!supplier.googleContactId) return;
    const ctx = await this.getGoogleContext(companyId);
    if (!ctx) return;

    await this.googleContacts.updateContact(
      ctx.accessToken,
      supplier.googleContactId,
      {
        name: supplier.name,
        phone: supplier.contact,
        notes: supplier.notes ?? undefined,
      },
    );
  }

  private async syncDeleteToGoogle(
    googleContactId: string | null,
    companyId: number,
  ) {
    if (!googleContactId) return;
    const ctx = await this.getGoogleContext(companyId);
    if (!ctx) return;

    await this.googleContacts.deleteContact(ctx.accessToken, googleContactId);
  }

  // ─── Balance ───────────────────────────────────────────────────────

  async adjustBalance(
    id: number,
    dto: AdjustBalanceDto,
    companyId: number,
    actor: CurrentUserJwt,
  ) {
    this.assertNotEmployee(actor);
    const supplier = await this.findAndAssert(id, companyId);

    const delta =
      dto.type === BalanceMovementType.DEPOSIT ? dto.amount : -dto.amount;

    const newBalance = Number(supplier.balance) + delta;

    return this.prisma.supplier.update({
      where: { id },
      data: { balance: newBalance },
      select: { id: true, name: true, balance: true },
    });
  }

  // ─── Cuentas del proveedor ─────────────────────────────────────────

  async accountsBySupplier(id: number, companyId: number) {
    await this.findAndAssert(id, companyId);

    return this.prisma.streamingAccount.findMany({
      where: { companyId, supplierId: id },
      select: {
        id: true,
        email: true,
        purchaseDate: true,
        cutoffDate: true,
        status: true,
        totalCost: true,
        platform: { select: { id: true, name: true } },
      },
      orderBy: { purchaseDate: 'desc' },
    });
  }
}

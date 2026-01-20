import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

type BaseRoleName = 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';

type CurrentUser = {
  id: number;
  // rol base ya resuelto desde JWT o desde DB (si ya lo haces en auth)
  role: BaseRoleName;
};

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // =======================
  // Selects
  // =======================
  private selectUserPublic() {
    return {
      id: true,
      email: true,
      phone: true,
      nombre: true,
      status: true,
      createdByUserId: true,
      createdAt: true,
      updatedAt: true,
      globalRoles: {
        select: {
          role: {
            select: {
              id: true,
              key: true,
              name: true,
              scope: true,
              ownerUserId: true,
            },
          },
        },
      },
    } satisfies Prisma.UserSelect;
  }

  // =======================
  // Helpers
  // =======================
  private isSuperadmin(u: CurrentUser) {
    return u.role === 'SUPERADMIN';
  }
  private isAdmin(u: CurrentUser) {
    return u.role === 'ADMIN';
  }

  /**
   * Acceso a un usuario:
   * - self siempre
   * - creador siempre
   */
  private async assertSelfOrCreator(
    targetUserId: number,
    currentUser: CurrentUser,
  ) {
    if (targetUserId === currentUser.id) return;

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, createdByUserId: true },
    });

    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if (target.createdByUserId !== currentUser.id) {
      throw new ForbiddenException('No tienes permisos sobre este usuario.');
    }
  }

  private async getBaseRoleByKeyOrThrow(key: string) {
    const role = await this.prisma.role.findUnique({
      where: { key },
      select: { id: true, key: true, name: true, ownerUserId: true },
    });
    if (!role) throw new BadRequestException(`Rol base no existe: ${key}`);
    if (role.ownerUserId !== null) {
      throw new BadRequestException(
        `Rol ${key} no es base (ownerUserId debe ser null).`,
      );
    }
    return role;
  }

  /**
   * Resolver de rol asignable según reglas:
   *
   * - Si roleName es "ADMIN" => solo SUPERADMIN y se asigna BASE:ADMIN
   * - Si roleName es "EMPLOYEE" => solo ADMIN y se asigna BASE:EMPLOYEE
   * - Si roleName es "SUPERADMIN" => nunca
   *
   * - Si roleName es cualquier otro => rol custom del currentUser (ownerUserId = currentUser.id)
   */
  private async getAssignableRoleOrThrow(
    roleName: string,
    currentUser: CurrentUser,
  ) {
    const upper = roleName.trim().toUpperCase();

    // Bloqueo total
    if (upper === 'SUPERADMIN') {
      throw new ForbiddenException('No se puede asignar el rol SUPERADMIN.');
    }

    // Roles base
    if (upper === 'ADMIN') {
      if (!this.isSuperadmin(currentUser)) {
        throw new ForbiddenException(
          'Solo SUPERADMIN puede crear/asignar el rol ADMIN base.',
        );
      }
      return this.getBaseRoleByKeyOrThrow('BASE:ADMIN');
    }

    if (upper === 'EMPLOYEE') {
      if (!this.isAdmin(currentUser)) {
        throw new ForbiddenException(
          'Solo ADMIN puede crear/asignar el rol EMPLOYEE base.',
        );
      }
      return this.getBaseRoleByKeyOrThrow('BASE:EMPLOYEE');
    }

    // Roles custom (privados del dueño)
    const custom = await this.prisma.role.findFirst({
      where: {
        name: roleName,
        ownerUserId: currentUser.id,
        // normalmente estos roles son GLOBAL (se asignan por UserRole)
        scope: 'GLOBAL',
      },
      select: { id: true, key: true, name: true, ownerUserId: true },
    });

    if (!custom) {
      throw new ForbiddenException(
        `El rol "${roleName}" no existe o no te pertenece.`,
      );
    }

    return custom;
  }

  // =======================
  // CREATE USER
  // =======================
  async create(dto: CreateUserDto, currentUser: CurrentUser) {
    // Solo SUPERADMIN y ADMIN crean usuarios
    if (!this.isSuperadmin(currentUser) && !this.isAdmin(currentUser)) {
      throw new ForbiddenException('No tienes permisos para crear usuarios.');
    }

    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('Email ya registrado.');

    const role = await this.getAssignableRoleOrThrow(dto.role, currentUser);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const userId = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          nombre: dto.nombre,
          passwordHash,
          status: 'ACTIVE',
          createdByUserId: currentUser.id,
        },
        select: { id: true },
      });

      await tx.userRole.create({
        data: { userId: user.id, roleId: role.id },
      });

      return user.id;
    });

    return this.prisma.user.findUnique({
      where: { id: userId },
      select: this.selectUserPublic(),
    });
  }

  // =======================
  // LIST USERS (solo los que yo creé)
  // =======================
  async findAll(currentUser: CurrentUser) {
    if (!this.isSuperadmin(currentUser) && !this.isAdmin(currentUser)) {
      throw new ForbiddenException('No tienes permisos para listar usuarios.');
    }

    // Siempre: solo los creados por mí
    const baseWhere: Prisma.UserWhereInput = {
      createdByUserId: currentUser.id,
    };

    // SUPERADMIN: ve sus ADMIN base + usuarios con roles custom del superadmin
    if (this.isSuperadmin(currentUser)) {
      return this.prisma.user.findMany({
        where: {
          ...baseWhere,
          OR: [
            // base ADMIN
            { globalRoles: { some: { role: { key: 'BASE:ADMIN' } } } },
            // roles custom del superadmin
            {
              globalRoles: { some: { role: { ownerUserId: currentUser.id } } },
            },
          ],
        },
        select: this.selectUserPublic(),
        orderBy: { createdAt: 'desc' },
      });
    }

    // ADMIN: ve sus EMPLOYEE base + usuarios con roles custom del admin
    return this.prisma.user.findMany({
      where: {
        ...baseWhere,
        OR: [
          { globalRoles: { some: { role: { key: 'BASE:EMPLOYEE' } } } },
          { globalRoles: { some: { role: { ownerUserId: currentUser.id } } } },
        ],
      },
      select: this.selectUserPublic(),
      orderBy: { createdAt: 'desc' },
    });
  }

  // =======================
  // FIND ONE (self o creator)
  // =======================
  async findOne(id: number, currentUser: CurrentUser) {
    await this.assertSelfOrCreator(id, currentUser);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.selectUserPublic(),
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    return user;
  }

  // =======================
  // UPDATE (self o creator) - email NO
  // =======================
  async update(id: number, dto: UpdateUserDto, currentUser: CurrentUser) {
    await this.assertSelfOrCreator(id, currentUser);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        globalRoles: { select: { role: { select: { key: true } } } },
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    if (user.status === 'BLOCKED' && id === currentUser.id) {
      throw new ForbiddenException('Tu usuario está bloqueado.');
    }

    if ((dto as any).email) {
      throw new BadRequestException('No se puede modificar el email.');
    }

    const isSelf = id === currentUser.id;
    const isCreator = !isSelf;

    if (dto.status && isSelf) {
      throw new ForbiddenException('No puedes cambiar tu propio status.');
    }
    if (
      dto.status &&
      isCreator &&
      !this.isSuperadmin(currentUser) &&
      !this.isAdmin(currentUser)
    ) {
      throw new ForbiddenException('No puedes cambiar status de otro usuario.');
    }

    const willChangeStatus =
      typeof dto.status !== 'undefined' && dto.status !== user.status;

    const isAdminBase = user.globalRoles.some(
      (ur) => ur.role.key === 'BASE:ADMIN',
    );

    const data: Prisma.UserUpdateInput = {
      nombre: dto.nombre,
      phone: dto.phone,
      ...(dto.status ? { status: dto.status } : {}),
    };

    if (dto.password) {
      (data as any).passwordHash = await bcrypt.hash(dto.password, 10);
    }

    // si no hay cambio de status o no es admin base => update normal
    if (!willChangeStatus || !isAdminBase) {
      return this.prisma.user.update({
        where: { id },
        data,
        select: this.selectUserPublic(),
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: this.selectUserPublic(),
      });

      // ✅ ADMIN -> INACTIVE: cascada SOLO a empleados ACTIVE
      if (dto.status === 'INACTIVE') {
        await tx.user.updateMany({
          where: {
            createdByUserId: id,
            status: 'ACTIVE',
          },
          data: {
            status: 'INACTIVE',
            cascadeInactivatedByUserId: id,
          },
        });
      }

      // ✅ ADMIN -> ACTIVE: restaurar SOLO los que fueron cascada
      if (dto.status === 'ACTIVE') {
        await tx.user.updateMany({
          where: {
            cascadeInactivatedByUserId: id,
            status: 'INACTIVE',
          },
          data: {
            status: 'ACTIVE',
            cascadeInactivatedByUserId: null,
          },
        });
      }

      return updated;
    });
  }

  // =======================
  // REMOVE (soft delete) - solo creator, SUPERADMIN elimina a ADMIN se eliminan tambien sus EMPLOYEE
  // =======================
  async remove(id: number, currentUser: CurrentUser) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        createdByUserId: true,
        globalRoles: { select: { role: { select: { key: true } } } },
      },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    // ✅ solo creador puede eliminar
    if (target.createdByUserId !== currentUser.id) {
      throw new ForbiddenException('Solo el usuario creador puede eliminar.');
    }

    // ✅ NO permitir hard delete de SUPERADMIN o ADMIN (roles base)
    const hasBaseSuperadmin = target.globalRoles.some(
      (ur) => ur.role.key === 'BASE:SUPERADMIN',
    );
    const hasBaseAdmin = target.globalRoles.some(
      (ur) => ur.role.key === 'BASE:ADMIN',
    );

    if (hasBaseSuperadmin || hasBaseAdmin) {
      throw new ForbiddenException(
        'No se puede eliminar un usuario ADMIN o SUPERADMIN.',
      );
    }

    // ✅ Antes de borrar, verificar si tiene referencias (por onDelete: Restrict)
    const [
      suppliers,
      customers,
      products,
      accounts,
      slots,
      slotSales,
      inventoryMovements,
      companiesOwned,
    ] = await Promise.all([
      this.prisma.supplier.count({ where: { createdByUserId: id } }),
      this.prisma.customer.count({ where: { createdByUserId: id } }),
      this.prisma.product.count({ where: { createdByUserId: id } }),

      this.prisma.account.count({ where: { createdByUserId: id } }),
      this.prisma.accountSlot.count({ where: { createdByUserId: id } }),
      this.prisma.slotSale.count({ where: { soldByUserId: id } }),
      this.prisma.inventoryMovement.count({ where: { createdByUserId: id } }),

      this.prisma.company.count({ where: { ownerUserId: id } }),
    ]);

    const hasReferences =
      suppliers +
        customers +
        products +
        accounts +
        slots +
        slotSales +
        inventoryMovements +
        companiesOwned >
      0;

    if (hasReferences) {
      throw new BadRequestException({
        message:
          'No se puede eliminar este usuario porque tiene registros asociados (trazabilidad). Desactívalo en su lugar o cambia las FK a SetNull.',
        references: {
          suppliers,
          customers,
          products,
          accounts,
          slots,
          slotSales,
          inventoryMovements,
          companiesOwned,
        },
      });
    }

    // ✅ Hard delete (en cascada se van user_roles, company_users, etc. si tus FKs lo permiten)
    try {
      await this.prisma.user.delete({ where: { id } });
      return { ok: true, deletedUserId: id };
    } catch (e) {
      // Si algo se escapó por FK restrict
      throw new BadRequestException(
        'No se pudo eliminar por restricciones de integridad. Revisa referencias o usa desactivación.',
      );
    }
  }
}

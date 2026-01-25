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
  role: BaseRoleName; // viene del JWT
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
      role: true, // ✅ base role en tabla
      createdByUserId: true,
      cascadeInactivatedByUserId: true,
      createdAt: true,
      updatedAt: true,
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

  /**
   * Reglas para asignar baseRole al CREAR un usuario:
   * - SUPERADMIN puede crear ADMIN o EMPLOYEE
   * - ADMIN solo puede crear EMPLOYEE
   * - Nadie crea SUPERADMIN (si quieres permitirlo, lo cambias aquí)
   */
  private assertCanAssignBaseRole(
    baseRole: BaseRoleName,
    currentUser: CurrentUser,
  ) {
    if (baseRole === 'SUPERADMIN') {
      throw new ForbiddenException(
        'No se permite asignar el rol base SUPERADMIN.',
      );
    }

    if (baseRole === 'ADMIN') {
      if (!this.isSuperadmin(currentUser)) {
        throw new ForbiddenException(
          'Solo SUPERADMIN puede crear/asignar el rol base ADMIN.',
        );
      }
      return;
    }

    // EMPLOYEE
    if (baseRole === 'EMPLOYEE') {
      if (!this.isAdmin(currentUser) && !this.isSuperadmin(currentUser)) {
        throw new ForbiddenException('No tienes permisos para crear EMPLOYEE.');
      }
      return;
    }
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

    // ✅ base role directo en User
    this.assertCanAssignBaseRole(dto.baseRole, currentUser);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        nombre: dto.nombre,
        passwordHash,
        status: UserStatus.ACTIVE,
        createdByUserId: currentUser.id,
        role: dto.baseRole, // ✅ guardamos BaseRole en tabla
      },
      select: this.selectUserPublic(),
    });

    return user;
  }

  // =======================
  // LIST USERS (solo los que yo creé)
  // =======================
  async findAll(currentUser: CurrentUser) {
    if (!this.isSuperadmin(currentUser) && !this.isAdmin(currentUser)) {
      throw new ForbiddenException('No tienes permisos para listar usuarios.');
    }

    // Mantienes tu regla: listamos solo los creados por el currentUser
    return this.prisma.user.findMany({
      where: { createdByUserId: currentUser.id },
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
      select: { id: true, status: true, role: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    if (user.status === UserStatus.BLOCKED && id === currentUser.id) {
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

    const isAdminBase = user.role === 'ADMIN';

    const data: Prisma.UserUpdateInput = {
      nombre: dto.nombre,
      phone: dto.phone,
      ...(dto.status ? { status: dto.status } : {}),
    };

    if (dto.password) {
      (data as any).passwordHash = await bcrypt.hash(dto.password, 10);
    }

    // Si no es cambio de status de un ADMIN, update normal
    if (!willChangeStatus || !isAdminBase) {
      return this.prisma.user.update({
        where: { id },
        data,
        select: this.selectUserPublic(),
      });
    }

    // Si es ADMIN y cambia status: aplicar cascada como antes
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: this.selectUserPublic(),
      });

      // ✅ ADMIN -> INACTIVE: cascada SOLO a empleados ACTIVE
      if (dto.status === UserStatus.INACTIVE) {
        await tx.user.updateMany({
          where: {
            createdByUserId: id,
            status: UserStatus.ACTIVE,
          },
          data: {
            status: UserStatus.INACTIVE,
            cascadeInactivatedByUserId: id,
          },
        });
      }

      // ✅ ADMIN -> ACTIVE: restaurar SOLO los que fueron cascada
      if (dto.status === UserStatus.ACTIVE) {
        await tx.user.updateMany({
          where: {
            cascadeInactivatedByUserId: id,
            status: UserStatus.INACTIVE,
          },
          data: {
            status: UserStatus.ACTIVE,
            cascadeInactivatedByUserId: null,
          },
        });
      }

      return updated;
    });
  }

  // =======================
  // REMOVE (hard delete) - solo creator
  // =======================
  async remove(id: number, currentUser: CurrentUser) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        createdByUserId: true,
        role: true,
      },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if (target.createdByUserId !== currentUser.id) {
      throw new ForbiddenException('Solo el usuario creador puede eliminar.');
    }

    // ✅ Nunca borrar ADMIN/SUPERADMIN
    if (target.role === 'SUPERADMIN' || target.role === 'ADMIN') {
      throw new ForbiddenException(
        'No se puede eliminar un usuario ADMIN o SUPERADMIN.',
      );
    }

    try {
      await this.prisma.user.delete({ where: { id } });
      return { ok: true, deletedUserId: id };
    } catch (e) {
      throw new BadRequestException(
        'No se pudo eliminar por restricciones de integridad. Revisa referencias o usa desactivación.',
      );
    }
  }
}

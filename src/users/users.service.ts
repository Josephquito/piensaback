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

type CurrentUserJwt = {
  id: number;
  role: BaseRoleName; // viene del JWT (pero vamos a validar con DB)
};

type Actor = {
  id: number;
  role: BaseRoleName;
  createdByUserId: number | null; // para EMPLOYEE apunta al ADMIN creador
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
      role: true,
      createdByUserId: true,
      cascadeInactivatedByUserId: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.UserSelect;
  }

  // =======================
  // Actor loader (DB source of truth)
  // =======================
  private async getActor(currentUser: CurrentUserJwt): Promise<Actor> {
    const actor = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, createdByUserId: true },
    });

    if (!actor) throw new ForbiddenException('Usuario actual inválido.');

    // Si tu tabla role es enum/string, Prisma lo tipará. Aquí lo tratamos como BaseRoleName.
    return actor as Actor;
  }

  // =======================
  // Scope rules
  // =======================
  private assertCanCreateRole(actor: Actor, baseRole: BaseRoleName) {
    if (actor.role === 'SUPERADMIN') {
      if (baseRole !== 'ADMIN') {
        throw new ForbiddenException('No tienes permisos para crear EMPLOYEE.');
      }
      return;
    }

    if (actor.role === 'ADMIN') {
      if (baseRole !== 'EMPLOYEE') {
        throw new ForbiddenException(
          'No tienes permisos para crear SUPERADMIN o ADMIN.',
        );
      }
      return;
    }

    // EMPLOYEE
    if (actor.role === 'EMPLOYEE') {
      if (baseRole !== 'EMPLOYEE') {
        throw new ForbiddenException('Solo puedes crear usuarios EMPLOYEE.');
      }
      if (!actor.createdByUserId) {
        throw new ForbiddenException(
          'EMPLOYEE inválido: no tiene createdByUserId (ADMIN dueño).',
        );
      }
      return;
    }
  }

  /**
   * Define quién será el createdByUserId del usuario nuevo:
   * - SUPERADMIN creando ADMIN => createdByUserId = superadmin.id
   * - ADMIN creando EMPLOYEE => createdByUserId = admin.id
   * - EMPLOYEE creando EMPLOYEE => createdByUserId = actor.createdByUserId (el ADMIN dueño)
   */
  private createdByForNewUser(actor: Actor): number {
    if (actor.role === 'SUPERADMIN') return actor.id;
    if (actor.role === 'ADMIN') return actor.id;

    // EMPLOYEE
    if (!actor.createdByUserId) {
      throw new ForbiddenException(
        'EMPLOYEE inválido: no tiene createdByUserId (ADMIN dueño).',
      );
    }
    return actor.createdByUserId;
  }

  private async assertCanReadTarget(targetId: number, actor: Actor) {
    if (targetId === actor.id) return; // self siempre

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, createdByUserId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if (actor.role === 'SUPERADMIN') {
      // solo ADMIN creados por él
      if (target.role !== 'ADMIN' || target.createdByUserId !== actor.id) {
        throw new ForbiddenException(
          'No tienes permisos para ver este usuario.',
        );
      }
      return;
    }

    if (actor.role === 'ADMIN') {
      // solo EMPLOYEE creados por él
      if (target.role !== 'EMPLOYEE' || target.createdByUserId !== actor.id) {
        throw new ForbiddenException(
          'No tienes permisos para ver este usuario.',
        );
      }
      return;
    }

    // EMPLOYEE: solo EMPLOYEE con mismo createdByUserId (mismo ADMIN dueño)
    if (!actor.createdByUserId) {
      throw new ForbiddenException('EMPLOYEE inválido.');
    }
    if (
      target.role !== 'EMPLOYEE' ||
      target.createdByUserId !== actor.createdByUserId
    ) {
      throw new ForbiddenException('No tienes permisos para ver este usuario.');
    }
  }

  private async assertCanUpdateTarget(targetId: number, actor: Actor) {
    // mismas reglas que READ
    await this.assertCanReadTarget(targetId, actor);
  }

  private async assertCanDeleteTarget(targetId: number, actor: Actor) {
    if (targetId === actor.id) {
      throw new ForbiddenException('No puedes eliminar tu propio usuario.');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, createdByUserId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    // Nunca borrar ADMIN/SUPERADMIN
    if (target.role !== 'EMPLOYEE') {
      throw new ForbiddenException(
        'Solo se permite eliminar usuarios EMPLOYEE.',
      );
    }

    if (actor.role === 'SUPERADMIN') {
      throw new ForbiddenException('SUPERADMIN no puede eliminar usuarios.');
    }

    if (actor.role === 'ADMIN') {
      if (target.createdByUserId !== actor.id) {
        throw new ForbiddenException(
          'Solo puedes eliminar tus EMPLOYEE creados.',
        );
      }
      return;
    }

    // EMPLOYEE
    if (!actor.createdByUserId)
      throw new ForbiddenException('EMPLOYEE inválido.');

    if (target.createdByUserId !== actor.createdByUserId) {
      throw new ForbiddenException(
        'Solo puedes eliminar EMPLOYEE con tu mismo createdByUserId.',
      );
    }
  }

  // =======================
  // CREATE USER
  // =======================
  async create(dto: CreateUserDto, currentUser: CurrentUserJwt) {
    const actor = await this.getActor(currentUser);

    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('Email ya registrado.');

    this.assertCanCreateRole(actor, dto.baseRole);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const createdByUserId = this.createdByForNewUser(actor);

    const user = await this.prisma.$transaction(async (tx) => {
      // 1) crear usuario
      const created = await tx.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          nombre: dto.nombre,
          passwordHash,
          status: UserStatus.ACTIVE,
          role: dto.baseRole,
          createdByUserId,
        },
        select: this.selectUserPublic(),
      });

      // 2) traer defaults del rol
      const roleDefaults = await tx.rolePermission.findMany({
        where: { role: dto.baseRole },
        select: { permissionId: true },
      });

      // 3) asignar al usuario (si hay)
      if (roleDefaults.length) {
        await tx.userPermission.createMany({
          data: roleDefaults.map((r) => ({
            userId: created.id,
            permissionId: r.permissionId,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return user;
  }

  // =======================
  // LIST USERS (según scope)
  // =======================
  async findAll(currentUser: CurrentUserJwt) {
    const actor = await this.getActor(currentUser);

    if (actor.role === 'SUPERADMIN') {
      // solo ADMIN creados por él
      return this.prisma.user.findMany({
        where: {
          role: 'ADMIN',
          createdByUserId: actor.id,
        },
        select: this.selectUserPublic(),
        orderBy: { createdAt: 'desc' },
      });
    }

    if (actor.role === 'ADMIN') {
      // solo EMPLOYEE creados por él
      return this.prisma.user.findMany({
        where: {
          role: 'EMPLOYEE',
          createdByUserId: actor.id,
        },
        select: this.selectUserPublic(),
        orderBy: { createdAt: 'desc' },
      });
    }

    // EMPLOYEE: otros EMPLOYEE del mismo ADMIN dueño
    if (!actor.createdByUserId)
      throw new ForbiddenException('EMPLOYEE inválido.');

    return this.prisma.user.findMany({
      where: {
        role: 'EMPLOYEE',
        createdByUserId: actor.createdByUserId,
        // si quieres excluirse a sí mismo:
        // id: { not: actor.id },
      },
      select: this.selectUserPublic(),
      orderBy: { createdAt: 'desc' },
    });
  }

  // =======================
  // FIND ONE (scope)
  // =======================
  async findOne(id: number, currentUser: CurrentUserJwt) {
    const actor = await this.getActor(currentUser);
    await this.assertCanReadTarget(id, actor);

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.selectUserPublic(),
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    return user;
  }

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.selectUserPublic(), // aquí viene nombre, phone, status, role...
    });

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  // =======================
  // UPDATE (scope) - email NO
  // =======================
  async update(id: number, dto: UpdateUserDto, currentUser: CurrentUserJwt) {
    const actor = await this.getActor(currentUser);
    await this.assertCanUpdateTarget(id, actor);

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if ((dto as any).email) {
      throw new BadRequestException('No se puede modificar el email.');
    }

    const isSelf = id === actor.id;

    // Status rules:
    // - nadie cambia su propio status (tu regla actual)
    // - EMPLOYEE puede cambiar status SOLO de otros EMPLOYEE dentro de su scope
    if (typeof dto.status !== 'undefined') {
      if (isSelf) {
        throw new ForbiddenException('No puedes cambiar tu propio status.');
      }

      if (actor.role === 'EMPLOYEE') {
        const targetMini = await this.prisma.user.findUnique({
          where: { id },
          select: { id: true, role: true, createdByUserId: true },
        });
        if (!targetMini) throw new NotFoundException('Usuario no encontrado.');

        if (targetMini.role !== 'EMPLOYEE') {
          throw new ForbiddenException(
            'EMPLOYEE solo puede cambiar status de usuarios EMPLOYEE.',
          );
        }

        if (
          !actor.createdByUserId ||
          targetMini.createdByUserId !== actor.createdByUserId
        ) {
          throw new ForbiddenException(
            'EMPLOYEE solo puede cambiar status de EMPLOYEE con el mismo createdByUserId.',
          );
        }
      }
    }

    const data: Prisma.UserUpdateInput = {
      nombre: dto.nombre,
      phone: dto.phone,
      ...(typeof dto.status !== 'undefined' ? { status: dto.status } : {}),
    };

    if (dto.password) {
      (data as any).passwordHash = await bcrypt.hash(dto.password, 10);
    }

    // Si quieres conservar tu lógica de cascada cuando un ADMIN cambia status:
    const willChangeStatus =
      typeof dto.status !== 'undefined' && dto.status !== target.status;

    const isAdminBase = target.role === 'ADMIN';

    if (!willChangeStatus || !isAdminBase) {
      return this.prisma.user.update({
        where: { id },
        data,
        select: this.selectUserPublic(),
      });
    }

    // OJO: según tus limitantes, ADMIN no puede editar otros ADMIN
    // y SUPERADMIN sí puede editar solo sus ADMIN. Esta cascada solo aplica si lo permites.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data,
        select: this.selectUserPublic(),
      });

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
  // REMOVE (hard delete) - scope + sin relaciones
  // =======================
  async remove(id: number, currentUser: CurrentUserJwt) {
    const actor = await this.getActor(currentUser);
    await this.assertCanDeleteTarget(id, actor);

    try {
      await this.prisma.user.delete({ where: { id } });
      return { ok: true, deletedUserId: id };
    } catch (e: any) {
      // Prisma FK constraint típicamente es P2003 (depende de tu schema)
      throw new BadRequestException(
        'No se pudo eliminar: el usuario tiene relaciones con otros recursos o restricciones de integridad.',
      );
    }
  }
}

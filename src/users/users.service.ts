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
import { CurrentUserJwt } from '../common/types/current-user-jwt.type';
import * as bcrypt from 'bcrypt';

type Actor = {
  id: number;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  createdByUserId: number | null;
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
  // Actor loader
  // =======================
  private async getActor(currentUser: CurrentUserJwt): Promise<Actor> {
    const actor = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { id: true, role: true, createdByUserId: true },
    });
    if (!actor) throw new ForbiddenException('Usuario actual inválido.');
    return actor as Actor;
  }

  // =======================
  // Scope rules
  // =======================
  private assertCanCreateRole(actor: Actor, baseRole: string) {
    if (actor.role === 'SUPERADMIN') {
      if (baseRole !== 'ADMIN') {
        throw new ForbiddenException(
          'SUPERADMIN solo puede crear usuarios ADMIN.',
        );
      }
      return;
    }

    if (actor.role === 'ADMIN') {
      if (baseRole !== 'EMPLOYEE') {
        throw new ForbiddenException(
          'ADMIN solo puede crear usuarios EMPLOYEE.',
        );
      }
      return;
    }

    // EMPLOYEE no puede crear usuarios
    throw new ForbiddenException('No tienes permisos para crear usuarios.');
  }

  private createdByForNewUser(actor: Actor): number {
    if (actor.role === 'SUPERADMIN') return actor.id;
    if (actor.role === 'ADMIN') return actor.id;
    throw new ForbiddenException('No tienes permisos para crear usuarios.');
  }

  private async assertCanReadTarget(targetId: number, actor: Actor) {
    if (targetId === actor.id) return;

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, createdByUserId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if (actor.role === 'SUPERADMIN') {
      if (target.role !== 'ADMIN' || target.createdByUserId !== actor.id) {
        throw new ForbiddenException(
          'No tienes permisos para ver este usuario.',
        );
      }
      return;
    }

    if (actor.role === 'ADMIN') {
      if (target.role !== 'EMPLOYEE' || target.createdByUserId !== actor.id) {
        throw new ForbiddenException(
          'No tienes permisos para ver este usuario.',
        );
      }
      return;
    }

    // EMPLOYEE: solo ve otros EMPLOYEE del mismo ADMIN
    if (!actor.createdByUserId)
      throw new ForbiddenException('EMPLOYEE inválido.');
    if (
      target.role !== 'EMPLOYEE' ||
      target.createdByUserId !== actor.createdByUserId
    ) {
      throw new ForbiddenException('No tienes permisos para ver este usuario.');
    }
  }

  private async assertCanDeleteTarget(targetId: number, actor: Actor) {
    if (targetId === actor.id) {
      throw new ForbiddenException('No puedes eliminar tu propio usuario.');
    }

    if (actor.role === 'SUPERADMIN') {
      throw new ForbiddenException('SUPERADMIN no puede eliminar usuarios.');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, createdByUserId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if (target.role !== 'EMPLOYEE') {
      throw new ForbiddenException(
        'Solo se permite eliminar usuarios EMPLOYEE.',
      );
    }

    if (actor.role === 'ADMIN') {
      if (target.createdByUserId !== actor.id) {
        throw new ForbiddenException(
          'Solo puedes eliminar tus EMPLOYEE creados.',
        );
      }
      return;
    }

    throw new ForbiddenException('No tienes permisos para eliminar usuarios.');
  }

  // =======================
  // CREATE
  // =======================
  // =======================
  // CREATE
  // =======================
  async create(dto: CreateUserDto, currentUser: CurrentUserJwt) {
    const actor = await this.getActor(currentUser);

    this.assertCanCreateRole(actor, dto.baseRole);

    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('Email ya registrado.');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const createdByUserId = this.createdByForNewUser(actor);

    const newUser = await this.prisma.user.create({
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

    // Asignar permisos por defecto según el rol creado
    await this.assignDefaultPermissions(newUser.id, dto.baseRole);

    return newUser;
  }

  // =======================
  // PERMISOS POR DEFECTO
  // =======================
  private async assignDefaultPermissions(userId: number, role: string) {
    // SUPERADMIN → se maneja solo en el seed, nunca se crea desde el service
    // EMPLOYEE   → pendiente definir, por ahora sin permisos
    if (role !== 'ADMIN') return;

    // Todos los permisos visibles (isSystem: false) se asignan al ADMIN
    const perms = await this.prisma.permission.findMany({
      where: { isSystem: false },
      select: { id: true },
    });

    if (!perms.length) return;

    await this.prisma.userPermission.createMany({
      data: perms.map((p) => ({ userId, permissionId: p.id })),
      skipDuplicates: true,
    });
  }

  // =======================
  // LIST
  // =======================
  async findAll(currentUser: CurrentUserJwt) {
    const actor = await this.getActor(currentUser);

    if (actor.role === 'SUPERADMIN') {
      return this.prisma.user.findMany({
        where: { role: 'ADMIN', createdByUserId: actor.id },
        select: this.selectUserPublic(),
        orderBy: { createdAt: 'desc' },
      });
    }

    if (actor.role === 'ADMIN') {
      return this.prisma.user.findMany({
        where: { role: 'EMPLOYEE', createdByUserId: actor.id },
        select: this.selectUserPublic(),
        orderBy: { createdAt: 'desc' },
      });
    }

    // EMPLOYEE: otros EMPLOYEE del mismo ADMIN
    if (!actor.createdByUserId)
      throw new ForbiddenException('EMPLOYEE inválido.');

    return this.prisma.user.findMany({
      where: { role: 'EMPLOYEE', createdByUserId: actor.createdByUserId },
      select: this.selectUserPublic(),
      orderBy: { createdAt: 'desc' },
    });
  }

  // =======================
  // FIND ONE
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
      select: this.selectUserPublic(),
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  // =======================
  // UPDATE
  // =======================
  async update(id: number, dto: UpdateUserDto, currentUser: CurrentUserJwt) {
    const actor = await this.getActor(currentUser);
    await this.assertCanReadTarget(id, actor);

    if ((dto as any).email) {
      throw new BadRequestException('No se puede modificar el email.');
    }

    const isSelf = id === actor.id;

    if (typeof dto.status !== 'undefined' && isSelf) {
      throw new ForbiddenException('No puedes cambiar tu propio status.');
    }

    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    const data: Prisma.UserUpdateInput = {
      ...(dto.nombre ? { nombre: dto.nombre } : {}),
      ...(dto.phone ? { phone: dto.phone } : {}),
      ...(typeof dto.status !== 'undefined' ? { status: dto.status } : {}),
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const willChangeStatus =
      typeof dto.status !== 'undefined' && dto.status !== target.status;

    // Cascada solo aplica si el target es ADMIN y cambia su status
    if (!willChangeStatus || target.role !== 'ADMIN') {
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

      if (dto.status === UserStatus.INACTIVE) {
        await tx.user.updateMany({
          where: { createdByUserId: id, status: UserStatus.ACTIVE },
          data: { status: UserStatus.INACTIVE, cascadeInactivatedByUserId: id },
        });
      }

      if (dto.status === UserStatus.ACTIVE) {
        await tx.user.updateMany({
          where: {
            cascadeInactivatedByUserId: id,
            status: UserStatus.INACTIVE,
          },
          data: { status: UserStatus.ACTIVE, cascadeInactivatedByUserId: null },
        });
      }

      return updated;
    });
  }

  // =======================
  // REMOVE
  // =======================
  async remove(id: number, currentUser: CurrentUserJwt) {
    const actor = await this.getActor(currentUser);
    await this.assertCanDeleteTarget(id, actor);

    try {
      await this.prisma.user.delete({ where: { id } });
      return { ok: true, deletedUserId: id };
    } catch {
      throw new BadRequestException(
        'No se pudo eliminar: el usuario tiene relaciones activas.',
      );
    }
  }
}

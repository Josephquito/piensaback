import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { MutateUserPermissionsDto } from './dto/mutate-user-permissions.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';

type CurrentUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
};

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ======================
  // Permissions catalog
  // ======================
  async findAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: {
        id: true,
        key: true,
        resource: true,
        action: true,
        group: true,
        label: true,
        order: true,
        isSystem: true,
      },
    });
  }

  async create(dto: CreatePermissionDto, currentUser: CurrentUser) {
    if (currentUser.role !== 'SUPERADMIN') {
      throw new ForbiddenException('Solo SUPERADMIN puede crear permisos.');
    }

    try {
      return await this.prisma.permission.create({
        data: {
          key: dto.key,
          resource: dto.resource,
          action: dto.action,
          group: dto.group,
          label: dto.label,
          order: dto.order,
          isSystem: true,
        },
        select: {
          id: true,
          key: true,
          resource: true,
          action: true,
          group: true,
          label: true,
          order: true,
          isSystem: true,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException('Ya existe un permiso con ese key.');
      }
      throw e;
    }
  }

  // ======================
  // User permissions
  // ======================
  async listUserPermissions(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const rows = await this.prisma.userPermission.findMany({
      where: { userId },
      select: {
        permission: {
          select: {
            id: true,
            key: true,
            resource: true,
            action: true,
            group: true,
            label: true,
            order: true,
            isSystem: true,
          },
        },
      },
      orderBy: { permissionId: 'asc' },
    });

    return rows.map((r) => r.permission);
  }

  /**
   * Reemplaza COMPLETO set de permisos del usuario.
   */
  async setUserPermissions(
    userId: number,
    dto: SetUserPermissionsDto,
    currentUser: CurrentUser,
  ) {
    // Regla opcional: solo SUPERADMIN o el creador del usuario puede cambiar permisos.
    // Ajústala a tu negocio.
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdByUserId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if (
      currentUser.role !== 'SUPERADMIN' &&
      target.createdByUserId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Solo SUPERADMIN o el creador puede modificar permisos del usuario.',
      );
    }

    // validar IDs
    const perms = await this.prisma.permission.findMany({
      where: { id: { in: dto.permissionIds } },
      select: { id: true },
    });
    const found = new Set(perms.map((p) => p.id));
    const missing = dto.permissionIds.filter((id) => !found.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Permisos no encontrados: ${missing.join(', ')}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });
      if (dto.permissionIds.length) {
        await tx.userPermission.createMany({
          data: dto.permissionIds.map((permissionId) => ({
            userId,
            permissionId,
          })),
          skipDuplicates: true,
        });
      }
    });

    return { ok: true, userId, permissions: dto.permissionIds };
  }

  async addUserPermissions(
    userId: number,
    dto: MutateUserPermissionsDto,
    currentUser: CurrentUser,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdByUserId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if (
      currentUser.role !== 'SUPERADMIN' &&
      target.createdByUserId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Solo SUPERADMIN o el creador puede modificar permisos del usuario.',
      );
    }

    // validar IDs
    const perms = await this.prisma.permission.findMany({
      where: { id: { in: dto.permissionIds } },
      select: { id: true },
    });
    const found = new Set(perms.map((p) => p.id));
    const missing = dto.permissionIds.filter((id) => !found.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Permisos no encontrados: ${missing.join(', ')}`,
      );
    }

    await this.prisma.userPermission.createMany({
      data: dto.permissionIds.map((permissionId) => ({ userId, permissionId })),
      skipDuplicates: true,
    });

    return { ok: true, added: dto.permissionIds };
  }

  async removeUserPermissions(
    userId: number,
    dto: MutateUserPermissionsDto,
    currentUser: CurrentUser,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, createdByUserId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if (
      currentUser.role !== 'SUPERADMIN' &&
      target.createdByUserId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'Solo SUPERADMIN o el creador puede modificar permisos del usuario.',
      );
    }

    await this.prisma.userPermission.deleteMany({
      where: { userId, permissionId: { in: dto.permissionIds } },
    });

    return { ok: true, removed: dto.permissionIds };
  }
}

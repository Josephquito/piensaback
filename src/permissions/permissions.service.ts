import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserJwt } from '../common/types/current-user-jwt.type';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionIdsDto } from './dto/permission-ids.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';

const PERMISSION_SELECT = {
  id: true,
  key: true,
  resource: true,
  action: true,
  group: true,
  label: true,
  order: true,
  isSystem: true,
} as const;

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly hierarchy: Record<BaseRole, BaseRole[]> = {
    [BaseRole.SUPERADMIN]: [BaseRole.ADMIN],
    [BaseRole.ADMIN]: [BaseRole.EMPLOYEE],
    [BaseRole.EMPLOYEE]: [],
  };

  // ======================
  // Catálogo de permisos
  // ======================

  async findAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
      select: PERMISSION_SELECT,
    });
  }

  async findOne(id: number) {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
      select: PERMISSION_SELECT,
    });
    if (!permission) throw new NotFoundException('Permiso no encontrado.');
    return permission;
  }

  async create(dto: CreatePermissionDto, currentUser: CurrentUserJwt) {
    this.assertIsSuperAdmin(currentUser);

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
        select: PERMISSION_SELECT,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException('Ya existe un permiso con ese key.');
      }
      throw e;
    }
  }

  async update(
    id: number,
    dto: UpdatePermissionDto,
    currentUser: CurrentUserJwt,
  ) {
    this.assertIsSuperAdmin(currentUser);
    await this.findOne(id);

    try {
      return await this.prisma.permission.update({
        where: { id },
        data: dto,
        select: PERMISSION_SELECT,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException('Ya existe un permiso con ese key.');
      }
      throw e;
    }
  }

  async remove(id: number, currentUser: CurrentUserJwt) {
    this.assertIsSuperAdmin(currentUser);
    await this.findOne(id);

    await this.prisma.permission.delete({ where: { id } });
    return { ok: true, deleted: id };
  }

  // ======================
  // Permisos por usuario
  // ======================

  async listUserPermissions(userId: number, currentUser: CurrentUserJwt) {
    await this.assertCanAccess(userId, currentUser);

    const rows = await this.prisma.userPermission.findMany({
      where: { userId },
      select: {
        permission: { select: PERMISSION_SELECT },
      },
      orderBy: { permissionId: 'asc' },
    });

    return rows.map((r) => r.permission);
  }

  async setUserPermissions(
    userId: number,
    dto: SetUserPermissionsDto,
    currentUser: CurrentUserJwt,
  ) {
    await this.assertCanAccess(userId, currentUser);

    if (dto.permissionIds.length) {
      await this.assertPermissionsExist(dto.permissionIds);
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
    dto: PermissionIdsDto,
    currentUser: CurrentUserJwt,
  ) {
    await this.assertCanAccess(userId, currentUser);
    await this.assertPermissionsExist(dto.permissionIds);

    await this.prisma.userPermission.createMany({
      data: dto.permissionIds.map((permissionId) => ({ userId, permissionId })),
      skipDuplicates: true,
    });

    return { ok: true, added: dto.permissionIds };
  }

  async removeUserPermissions(
    userId: number,
    dto: PermissionIdsDto,
    currentUser: CurrentUserJwt,
  ) {
    await this.assertCanAccess(userId, currentUser);

    await this.prisma.userPermission.deleteMany({
      where: { userId, permissionId: { in: dto.permissionIds } },
    });

    return { ok: true, removed: dto.permissionIds };
  }

  // ======================
  // Helpers privados
  // ======================

  private assertIsSuperAdmin(currentUser: CurrentUserJwt) {
    if (currentUser.role !== BaseRole.SUPERADMIN) {
      throw new ForbiddenException(
        'Solo SUPERADMIN puede realizar esta acción.',
      );
    }
  }

  private async assertCanAccess(userId: number, currentUser: CurrentUserJwt) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, createdByUserId: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado.');

    if (!this.hierarchy[currentUser.role].includes(target.role)) {
      throw new ForbiddenException(
        `Un ${currentUser.role} no puede gestionar permisos de un ${target.role}.`,
      );
    }

    if (target.createdByUserId !== currentUser.id) {
      throw new ForbiddenException(
        'Solo el creador puede gestionar los permisos de este usuario.',
      );
    }
  }

  private async assertPermissionsExist(permissionIds: number[]) {
    const perms = await this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: { id: true },
    });
    const found = new Set(perms.map((p) => p.id));
    const missing = permissionIds.filter((id) => !found.has(id));
    if (missing.length) {
      throw new BadRequestException(
        `Permisos no encontrados: ${missing.join(', ')}`,
      );
    }
  }
}

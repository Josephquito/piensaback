/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmployeePermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertEmployeeMember(companyId: number, memberId: number) {
    const member = await this.prisma.companyUser.findFirst({
      where: { id: memberId, companyId, status: 'ACTIVE' },
      select: { id: true, role: { select: { name: true } } },
    });

    if (!member) {
      throw new NotFoundException('Empleado no encontrado en esta empresa');
    }

    if (member.role.name !== 'EMPLOYEE') {
      throw new BadRequestException(
        'Solo se pueden administrar permisos de miembros con rol EMPLOYEE',
      );
    }

    return member;
  }

  async list(companyId: number, memberId: number) {
    await this.assertEmployeeMember(companyId, memberId);

    const rows = await this.prisma.companyUserPermission.findMany({
      where: { companyUserId: memberId },
      select: {
        permission: { select: { key: true, resource: true, action: true } },
      },
      orderBy: { permissionId: 'asc' },
    });

    return rows.map((r) => r.permission);
  }

  async add(companyId: number, memberId: number, keys: string[]) {
    await this.assertEmployeeMember(companyId, memberId);

    const perms = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true, key: true },
    });

    const found = new Set(perms.map((p) => p.key));
    const missing = keys.filter((k) => !found.has(k));
    if (missing.length) {
      throw new BadRequestException(
        `Permisos no existen: ${missing.join(', ')}`,
      );
    }

    await this.prisma.$transaction(
      perms.map((p) =>
        this.prisma.companyUserPermission.upsert({
          where: {
            companyUserId_permissionId: {
              companyUserId: memberId,
              permissionId: p.id,
            },
          },
          update: {},
          create: { companyUserId: memberId, permissionId: p.id },
        }),
      ),
    );

    return { ok: true, added: perms.map((p) => p.key) };
  }

  async set(companyId: number, memberId: number, keys: string[]) {
    await this.assertEmployeeMember(companyId, memberId);

    const perms = keys.length
      ? await this.prisma.permission.findMany({
          where: { key: { in: keys } },
          select: { id: true, key: true },
        })
      : [];

    const found = new Set(perms.map((p) => p.key));
    const missing = keys.filter((k) => !found.has(k));
    if (missing.length) {
      throw new BadRequestException(
        `Permisos no existen: ${missing.join(', ')}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.companyUserPermission.deleteMany({
        where: { companyUserId: memberId },
      });

      if (perms.length) {
        await tx.companyUserPermission.createMany({
          data: perms.map((p) => ({
            companyUserId: memberId,
            permissionId: p.id,
          })),
          skipDuplicates: true,
        });
      }
    });

    return { ok: true, set: perms.map((p) => p.key) };
  }

  async removeOne(companyId: number, memberId: number, key: string) {
    await this.assertEmployeeMember(companyId, memberId);

    const perm = await this.prisma.permission.findUnique({
      where: { key },
      select: { id: true, key: true },
    });

    if (!perm) throw new NotFoundException('Permiso no existe');

    await this.prisma.companyUserPermission.delete({
      where: {
        companyUserId_permissionId: {
          companyUserId: memberId,
          permissionId: perm.id,
        },
      },
    });

    return { ok: true, removed: key };
  }
}

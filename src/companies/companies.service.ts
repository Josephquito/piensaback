import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import {
  BaseRole,
  CompanyUserStatus,
  UserStatus,
  CompanyStatus,
} from '@prisma/client';

import { CurrentUserJwt } from '../common/types/current-user-jwt.type'; // ajusta ruta

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  // =========================
  // Helpers
  // =========================
  private assertAdmin(actor: CurrentUserJwt) {
    if (actor.role !== BaseRole.ADMIN) {
      throw new ForbiddenException('Solo ADMIN.');
    }
  }

  private async assertOwner(actor: CurrentUserJwt, companyId: number) {
    // SUPERADMIN nunca, EMPLOYEE nunca
    if (actor.role !== BaseRole.ADMIN) {
      throw new ForbiddenException('Solo el owner puede hacer esto.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, ownerUserId: true },
    });

    if (!company) throw new NotFoundException('Company no existe.');
    if (company.ownerUserId !== actor.id) {
      throw new ForbiddenException('No eres owner de esta company.');
    }

    return company;
  }

  // =========================
  // CRUD
  // =========================
  async create(dto: CreateCompanyDto, actor: CurrentUserJwt) {
    this.assertAdmin(actor);

    return this.prisma.company.create({
      data: {
        name: dto.name,
        phone: dto.phone,
        ownerUserId: actor.id,
      },
    });
  }

  async findAllVisible(actor: CurrentUserJwt) {
    // SUPERADMIN no ve nada
    if (actor.role === BaseRole.SUPERADMIN) return [];

    // ADMIN ve sus companies
    if (actor.role === BaseRole.ADMIN) {
      return this.prisma.company.findMany({
        where: { ownerUserId: actor.id },
        orderBy: { createdAt: 'desc' },
      });
    }

    // EMPLOYEE: companies donde esté asignado (membership ACTIVE)
    return this.prisma.company.findMany({
      where: {
        users: {
          some: {
            userId: actor.id,
            status: 'ACTIVE',
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneVisible(companyId: number, actor: CurrentUserJwt) {
    if (actor.role === BaseRole.SUPERADMIN) {
      throw new NotFoundException('Company no visible.');
    }

    if (actor.role === BaseRole.ADMIN) {
      const company = await this.prisma.company.findFirst({
        where: { id: companyId, ownerUserId: actor.id },
      });
      if (!company) throw new NotFoundException('Company no visible.');
      return company;
    }

    // EMPLOYEE
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        users: {
          some: {
            userId: actor.id,
            status: CompanyUserStatus.ACTIVE,
          },
        },
      },
    });

    if (!company) throw new NotFoundException('Company no visible.');
    return company;
  }

  async remove(companyId: number, actor: CurrentUserJwt) {
    await this.assertOwner(actor, companyId);

    await this.prisma.company.delete({ where: { id: companyId } });
    return { ok: true };
  }

  // =========================
  // MEMBERS (assign/unassign)
  // =========================
  async listMembers(companyId: number, actor: CurrentUserJwt) {
    await this.assertOwner(actor, companyId);

    return this.prisma.companyUser.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            nombre: true,
            email: true,
            role: true,
            status: true,
          },
        },
      },
    });
  }

  async assignEmployees(
    companyId: number,
    userIds: number[],
    actor: CurrentUserJwt,
  ) {
    await this.assertOwner(actor, companyId);

    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, role: true, status: true },
    });

    if (users.length !== userIds.length) {
      throw new BadRequestException('Uno o más users no existen.');
    }

    const invalid = users.filter(
      (u) => u.role !== BaseRole.EMPLOYEE || u.status !== 'ACTIVE',
    );
    if (invalid.length) {
      throw new BadRequestException('Solo EMPLOYEE activos pueden asignarse.');
    }

    // crea los que no existan
    await this.prisma.companyUser.createMany({
      data: userIds.map((id) => ({ companyId, userId: id, status: 'ACTIVE' })),
      skipDuplicates: true,
    });

    // reactiva si estaban INACTIVE
    await this.prisma.companyUser.updateMany({
      where: { companyId, userId: { in: userIds }, status: 'INACTIVE' },
      data: { status: 'ACTIVE' },
    });

    return { ok: true };
  }

  async unassignEmployees(
    companyId: number,
    userIds: number[],
    actor: CurrentUserJwt,
  ) {
    await this.assertOwner(actor, companyId);

    await this.prisma.companyUser.updateMany({
      where: { companyId, userId: { in: userIds } },
      data: { status: 'INACTIVE' },
    });

    return { ok: true };
  }

  async update(
    companyId: number,
    dto: UpdateCompanyDto,
    actor: CurrentUserJwt,
  ) {
    await this.assertOwner(actor, companyId);

    // opcional: evitar update vacío
    const hasChanges =
      dto.name !== undefined ||
      dto.phone !== undefined ||
      dto.status !== undefined;

    if (!hasChanges) {
      throw new BadRequestException('No hay campos para actualizar.');
    }

    try {
      return await this.prisma.company.update({
        where: { id: companyId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.status !== undefined
            ? { status: dto.status as CompanyStatus }
            : {}),
        },
      });
    } catch (e: any) {
      throw new BadRequestException('No se pudo actualizar la company.');
    }
  }
}

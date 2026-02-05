/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { BaseRole, CompanyStatus, CompanyUserStatus } from '@prisma/client';

@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    const actor = req.user as { id: number; role: BaseRole };
    if (!actor?.id) throw new ForbiddenException('No autenticado.');

    // SUPERADMIN no trabaja con companies (según tu regla)
    if (actor.role === BaseRole.SUPERADMIN) {
      throw new ForbiddenException('SUPERADMIN no tiene contexto de empresa.');
    }

    // Header puede venir como string
    const raw = req.headers['x-company-id'];
    if (!raw) {
      throw new BadRequestException('Falta header x-company-id.');
    }

    const companyId = Number(raw);
    if (!Number.isInteger(companyId) || companyId <= 0) {
      throw new BadRequestException('x-company-id inválido.');
    }

    // Validar existencia + acceso
    // 1) ADMIN => owner
    if (actor.role === BaseRole.ADMIN) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: companyId,
          ownerUserId: actor.id,
          status: CompanyStatus.ACTIVE, // opcional, recomendado
        },
        select: { id: true },
      });

      if (!company) throw new NotFoundException('Company no accesible.');
      req.companyId = companyId;
      return true;
    }

    // 2) EMPLOYEE => membership ACTIVE
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        status: CompanyStatus.ACTIVE, // opcional, recomendado
        users: {
          some: {
            userId: actor.id,
            status: CompanyUserStatus.ACTIVE,
          },
        },
      },
      select: { id: true },
    });

    if (!company) throw new NotFoundException('Company no accesible.');
    req.companyId = companyId;
    return true;
  }
}

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
import { RequestWithUser } from '../types/request-with-user.type';

@Injectable()
export class CompanyScopeGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<RequestWithUser & { companyId?: number }>();

    const actor = req.user;
    if (!actor?.id) throw new ForbiddenException('No autenticado.');

    if (actor.role === BaseRole.SUPERADMIN) {
      throw new ForbiddenException('SUPERADMIN no tiene contexto de empresa.');
    }

    const raw = req.headers['x-company-id'];
    if (!raw || Array.isArray(raw)) {
      throw new BadRequestException('Falta header x-company-id.');
    }

    const companyId = parseInt(raw, 10);
    if (isNaN(companyId) || companyId <= 0) {
      throw new BadRequestException('x-company-id inválido.');
    }

    if (actor.role === BaseRole.ADMIN) {
      const company = await this.prisma.company.findFirst({
        where: {
          id: companyId,
          ownerUserId: actor.id,
          status: CompanyStatus.ACTIVE,
        },
        select: { id: true },
      });

      if (!company) throw new NotFoundException('Company no accesible.');
      req.companyId = companyId;
      return true;
    }

    // EMPLOYEE
    const company = await this.prisma.company.findFirst({
      where: {
        id: companyId,
        status: CompanyStatus.ACTIVE,
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

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { RequestWithUser } from '../interfaces/request-with-user.interface';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CompanyMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const user = request.user;
    const companyIdParam = request.params.companyId;

    // 1️⃣ Usuario autenticado
    if (!user) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    // 2️⃣ companyId válido en la ruta
    if (!companyIdParam || isNaN(Number(companyIdParam))) {
      throw new ForbiddenException('CompanyId inválido o no proporcionado');
    }

    const companyId = Number(companyIdParam);

    // 3️⃣ Verificar pertenencia a la empresa
    const membership = await this.prisma.companyUser.findFirst({
      where: {
        companyId,
        userId: user.id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        role: { select: { name: true } },
      },
    });

    if (!membership) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }

    /**
     * 4️⃣ (Opcional pero recomendado)
     * Adjuntamos info de empresa al request para no volver a consultar
     */
    (request as any).company = {
      id: companyId,
      roleName: membership.role.name,
    };

    return true;
  }
}

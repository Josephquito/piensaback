/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RequestWithUser } from '../interfaces/request-with-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();

    // 1) Si el endpoint no pide permisos, dejamos pasar
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    // 2) Usuario autenticado (JwtAuthGuard debe correr antes)
    const user = req.user;
    if (!user) throw new UnauthorizedException('Usuario no autenticado');

    // 3) Debe existir companyId en rutas multiempresa
    const companyIdParam = (req as any).params?.companyId;
    if (!companyIdParam || isNaN(Number(companyIdParam))) {
      throw new ForbiddenException('Este endpoint requiere companyId válido');
    }
    const companyId = Number(companyIdParam);

    // 4) Regla fuerte: para entrar a empresa hay que ser miembro (incluso SUPERADMIN)
    const membership = await this.prisma.companyUser.findFirst({
      where: {
        companyId,
        userId: user.id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        roleId: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('No perteneces a esta empresa');
    }

    // 5) Permisos por rol + overrides por usuario (CompanyUser)
    const [roleKeys, userKeys] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { roleId: membership.roleId },
        select: { permission: { select: { key: true } } },
      }),
      this.prisma.companyUserPermission.findMany({
        where: { companyUserId: membership.id },
        select: { permission: { select: { key: true } } },
      }),
    ]);

    const allowed = new Set<string>([
      ...roleKeys.map((x) => x.permission.key),
      ...userKeys.map((x) => x.permission.key),
    ]);

    // 6) Validación AND: todos los requeridos deben existir
    const missing = required.filter((p) => !allowed.has(p));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Permisos insuficientes. Falta: ${missing.join(', ')}`,
      );
    }

    // 7) Contexto útil para controladores/servicios si lo necesitas
    (req as any).company = { id: companyId, companyUserId: membership.id };

    return true;
  }
}

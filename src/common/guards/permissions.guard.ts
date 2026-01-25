import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1) Rutas públicas no requieren permisos
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // 2) Permisos requeridos por endpoint/clase
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRE_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Si no hay permisos requeridos, permitir (endpoint queda "abierto" pero autenticado)
    if (!required || required.length === 0) return true;

    // 3) Usuario viene de JwtStrategy
    const req = context.switchToHttp().getRequest<{ user?: ReqUser }>();
    const user = req.user;

    if (!user) throw new UnauthorizedException('No autenticado');

    // (Opcional) SUPERADMIN bypass total
    if (user.role === 'SUPERADMIN') return true;

    const owned = new Set(user.permissions ?? []);
    const missing = required.filter((p) => !owned.has(p));

    if (missing.length) {
      throw new ForbiddenException(
        `Permisos insuficientes. Faltan: ${missing.join(', ')}`,
      );
    }

    return true;
  }
}

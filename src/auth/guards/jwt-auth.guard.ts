import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // 1️⃣ Verificar si la ruta es pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si es pública, NO pedimos token
    if (isPublic) {
      return true;
    }

    // 2️⃣ Si no es pública, exigir JWT
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    // 3️⃣ Manejo claro de errores
    if (err || !user) {
      throw err || new UnauthorizedException('Token inválido o no enviado');
    }
    return user;
  }
}

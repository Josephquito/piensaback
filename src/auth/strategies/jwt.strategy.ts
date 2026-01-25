import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserStatus } from '@prisma/client';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET as string,
      ignoreExpiration: false,
    });
  }

  async validate(payload: any) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token inválido');
    }

    // ✅ revalidar en DB en cada request (rol + permisos actuales)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        status: true,
        role: true,
        permissions: {
          select: {
            permission: { select: { key: true } },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Usuario no existe');

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Usuario inactivo o bloqueado');
    }

    const permissions = user.permissions.map((up) => up.permission.key);

    // ✅ esto queda en req.user
    return {
      id: user.id,
      email: user.email,
      role: user.role, // SUPERADMIN | ADMIN | EMPLOYEE
      permissions, // string[]
    };
  }
}

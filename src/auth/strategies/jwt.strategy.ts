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
    });
  }

  async validate(payload: any) {
    // payload trae: sub, email, role

    if (!payload?.sub || !payload?.role) {
      throw new UnauthorizedException('Token inválido');
    }

    // ✅ Revalidar usuario en DB (status)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true },
    });

    if (!user) throw new UnauthorizedException('Usuario no existe');
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Usuario inactivo o bloqueado');
    }

    // Lo que retornas aquí queda en req.user
    return {
      id: user.id,
      email: user.email,
      role: payload.role, // rol base
    };
  }
}

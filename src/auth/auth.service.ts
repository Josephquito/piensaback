import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        nombre: true,
        passwordHash: true,
        status: true,
        role: true, // ✅ BaseRole: SUPERADMIN | ADMIN | EMPLOYEE
        permissions: {
          select: {
            permission: { select: { key: true } }, // ✅ permisos globales por usuario
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Usuario inactivo o bloqueado');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    const permissions = user.permissions.map((up) => up.permission.key);

    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      role: user.role, // ✅ ya viene directo de DB
      permissions, // ✅ lista de keys
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    // ✅ payload mínimo: NO metas permisos aquí si quieres poder revocar permisos sin relogueo
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      access_token: this.jwt.sign(payload),
    };
  }
}

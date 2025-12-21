import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        globalRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Credenciales inválidas');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    const isSuperadmin = user.globalRoles.some(
      (r) => r.role.name === 'SUPERADMIN',
    );

    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      isSuperadmin,
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    const payload = {
      sub: user.id,
      email: user.email,
      isSuperadmin: user.isSuperadmin,
    };

    return {
      access_token: this.jwt.sign(payload),
      user,
    };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

type RoleName = 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';

function pickHighestRole(roleNames: string[]): RoleName | null {
  if (roleNames.includes('SUPERADMIN')) return 'SUPERADMIN';
  if (roleNames.includes('ADMIN')) return 'ADMIN';
  if (roleNames.includes('EMPLOYEE')) return 'EMPLOYEE';
  return null;
}

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

    const roleNames = user.globalRoles.map((r) => r.role.name);
    const role = pickHighestRole(roleNames);

    if (!role) {
      throw new UnauthorizedException('Usuario sin rol asignado');
    }

    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      role, // ✅ única fuente de verdad
      roles: roleNames,
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role, // ✅
    };

    return {
      access_token: this.jwt.sign(payload),
    };
  }
}

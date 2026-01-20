import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';

type BaseRoleName = 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';

function pickHighestBaseRoleByKeys(roleKeys: string[]): BaseRoleName | null {
  if (roleKeys.includes('BASE:SUPERADMIN')) return 'SUPERADMIN';
  if (roleKeys.includes('BASE:ADMIN')) return 'ADMIN';
  if (roleKeys.includes('BASE:EMPLOYEE')) return 'EMPLOYEE';
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

    // ✅ status check
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Usuario inactivo o bloqueado');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales inválidas');

    const roleKeys = user.globalRoles.map((r) => r.role.key);
    const baseRole = pickHighestBaseRoleByKeys(roleKeys);

    if (!baseRole) {
      throw new UnauthorizedException('Usuario sin rol base asignado');
    }

    // Si quieres exponer también los roles (keys/names) para frontend:
    const roles = user.globalRoles.map((r) => ({
      id: r.role.id,
      key: r.role.key,
      name: r.role.name,
      ownerUserId: r.role.ownerUserId,
    }));

    return {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      role: baseRole, // ✅ rol base (SUPERADMIN/ADMIN/EMPLOYEE)
      roles, // ✅ todos los roles asignados (incluye custom)
    };
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);

    // ✅ payload mínimo y estable
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role, // SUPERADMIN/ADMIN/EMPLOYEE
    };

    return {
      access_token: this.jwt.sign(payload),
    };
  }
}

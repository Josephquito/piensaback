import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

type RoleName = 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';

function canCreateRole(creator: RoleName, target: RoleName): boolean {
  const allowed: Record<RoleName, RoleName[]> = {
    SUPERADMIN: ['ADMIN'],
    ADMIN: ['EMPLOYEE'],
    EMPLOYEE: [],
  };
  return allowed[creator].includes(target);
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Helpers
  private selectUserPublic() {
    return {
      id: true,
      email: true,
      phone: true,
      nombre: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      createdByUserId: true,
    };
  }

  private async assertAdminOwnsEmployeeOrSelf(
    targetUserId: number,
    currentUser: { id: number; role: RoleName },
  ) {
    // se permite a sí mismo siempre
    if (targetUserId === currentUser.id) return;

    // solo aplica para ADMIN
    if (currentUser.role !== 'ADMIN') return;

    const employee = await this.prisma.user.findFirst({
      where: {
        id: targetUserId,
        createdByUserId: currentUser.id,
        globalRoles: { some: { role: { name: 'EMPLOYEE' } } },
      },
      select: { id: true },
    });

    if (!employee) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este usuario (no te pertenece).',
      );
    }
  }

  // ✅ CREATE (asigna rol + createdByUserId)
  async create(
    dto: CreateUserDto,
    currentUser: { id: number; role: RoleName },
  ) {
    const targetRole = dto.role as RoleName;
    const validRoles: RoleName[] = ['SUPERADMIN', 'ADMIN', 'EMPLOYEE'];

    if (!targetRole || !validRoles.includes(targetRole)) {
      throw new BadRequestException(
        'Rol inválido (SUPERADMIN, ADMIN, EMPLOYEE).',
      );
    }

    const creatorRole = currentUser.role;
    if (!canCreateRole(creatorRole, targetRole)) {
      throw new ForbiddenException(
        `Tu rol (${creatorRole}) no puede crear usuarios con rol (${targetRole}).`,
      );
    }

    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (exists) throw new BadRequestException('Email ya registrado.');

    const role = await this.prisma.role.findUnique({
      where: { name: targetRole },
      select: { id: true },
    });
    if (!role) {
      throw new BadRequestException(
        `El rol ${targetRole} no existe en la tabla roles.`,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const createdUser = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          phone: dto.phone,
          nombre: dto.nombre,
          passwordHash,
          status: 'ACTIVE',

          // ✅ clave para pertenencia
          createdByUserId: currentUser.id,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          nombre: true,
          status: true,
          createdAt: true,
          createdByUserId: true,
        },
      });

      await tx.userRole.create({
        data: {
          userId: newUser.id,
          roleId: role.id,
        },
      });

      return newUser;
    });

    return createdUser;
  }

  // ✅ FIND ALL (según rol)
  async findAll(currentUser: { id: number; role: RoleName }) {
    // EMPLOYEE no lista
    if (currentUser.role === 'EMPLOYEE') {
      throw new ForbiddenException('No tienes permisos para listar usuarios.');
    }

    // SUPERADMIN: SOLO ADMINS (como pediste)
    if (currentUser.role === 'SUPERADMIN') {
      return this.prisma.user.findMany({
        where: {
          globalRoles: { some: { role: { name: 'ADMIN' } } },
        },
        select: {
          id: true,
          email: true,
          phone: true,
          nombre: true,
          status: true,
          createdAt: true,
          createdByUserId: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // ADMIN: solo SUS EMPLOYEES
    return this.prisma.user.findMany({
      where: {
        createdByUserId: currentUser.id,
        globalRoles: { some: { role: { name: 'EMPLOYEE' } } },
      },
      select: {
        id: true,
        email: true,
        phone: true,
        nombre: true,
        status: true,
        createdAt: true,
        createdByUserId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ✅ FIND ONE (según rol)
  async findOne(id: number, currentUser: { id: number; role: RoleName }) {
    // uno mismo siempre permitido
    if (id === currentUser.id) {
      const me = await this.prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          phone: true,
          nombre: true,
          status: true,
          createdAt: true,
          createdByUserId: true,
        },
      });
      if (!me) throw new NotFoundException('Usuario no encontrado.');
      return me;
    }

    // EMPLOYEE no ve otros
    if (currentUser.role === 'EMPLOYEE') {
      throw new ForbiddenException(
        'No tienes permisos para ver otros usuarios.',
      );
    }

    // SUPERADMIN: puede ver solo ADMINS (como regla)
    if (currentUser.role === 'SUPERADMIN') {
      const user = await this.prisma.user.findFirst({
        where: {
          id,
          globalRoles: { some: { role: { name: 'ADMIN' } } },
        },
        select: {
          id: true,
          email: true,
          phone: true,
          nombre: true,
          status: true,
          createdAt: true,
          createdByUserId: true,
        },
      });
      if (!user) throw new NotFoundException('Usuario no encontrado.');
      return user;
    }

    // ADMIN: solo sus employees
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        createdByUserId: currentUser.id,
        globalRoles: { some: { role: { name: 'EMPLOYEE' } } },
      },
      select: {
        id: true,
        email: true,
        phone: true,
        nombre: true,
        status: true,
        createdAt: true,
        createdByUserId: true,
      },
    });

    if (!user)
      throw new NotFoundException('Usuario no encontrado o no te pertenece.');
    return user;
  }

  // ✅ UPDATE (según rol)
  async update(
    id: number,
    dto: UpdateUserDto,
    currentUser: { id: number; role: RoleName },
  ) {
    const exists = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Usuario no encontrado.');

    // EMPLOYEE: solo a sí mismo
    if (currentUser.role === 'EMPLOYEE' && id !== currentUser.id) {
      throw new ForbiddenException(
        'No tienes permisos para actualizar este usuario.',
      );
    }

    // ADMIN: solo su employee o él mismo
    if (currentUser.role === 'ADMIN') {
      await this.assertAdminOwnsEmployeeOrSelf(id, currentUser);
    }

    // SUPERADMIN: permitido (sin restricciones)

    const data: any = {
      nombre: dto.nombre,
      phone: dto.phone,
      status: dto.status,
    };

    if (dto.password) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      data.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        phone: true,
        nombre: true,
        status: true,
        updatedAt: true,
        createdByUserId: true,
      },
    });
  }

  // ✅ REMOVE (soft delete) (según rol)
  async remove(id: number, currentUser: { id: number; role: RoleName }) {
    const exists = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Usuario no encontrado.');

    // EMPLOYEE: no puede desactivar a otros (ni a sí mismo si quieres; aquí permito solo a sí mismo)
    if (currentUser.role === 'EMPLOYEE' && id !== currentUser.id) {
      throw new ForbiddenException(
        'No tienes permisos para desactivar este usuario.',
      );
    }

    // ADMIN: solo su employee o él mismo (si no quieres permitir desactivar a sí mismo, te lo bloqueo)
    if (currentUser.role === 'ADMIN') {
      await this.assertAdminOwnsEmployeeOrSelf(id, currentUser);
    }

    return this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
      select: {
        id: true,
        email: true,
        status: true,
        updatedAt: true,
        createdByUserId: true,
      },
    });
  }
}

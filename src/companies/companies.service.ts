/*  import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { AssignEmployeeDto } from './dto/assign-employee.dto';

type RoleName = 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async create(
    dto: CreateCompanyDto,
    currentUser: { id: number; role: RoleName },
  ) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Solo los ADMIN pueden crear empresas.');
    }

    if (!dto.name?.trim())
      throw new BadRequestException('El nombre es requerido.');
    if (!dto.phone?.trim())
      throw new BadRequestException('El teléfono es requerido.');

    return this.prisma.company.create({
      data: {
        ownerUserId: currentUser.id,
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        ownerUserId: true,
        createdAt: true,
      },
    });
  }

  async findMine(currentUser: { id: number; role: RoleName }) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException('Solo los ADMIN pueden ver sus empresas.');
    }

    return this.prisma.company.findMany({
      where: { ownerUserId: currentUser.id },
      select: {
        id: true,
        name: true,
        phone: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignEmployee(
    companyId: number,
    dto: AssignEmployeeDto,
    currentUser: { id: number; role: RoleName },
  ) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo los ADMIN pueden asignar employees a empresas.',
      );
    }

    // 1) empresa debe pertenecer al admin
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, ownerUserId: currentUser.id },
      select: { id: true },
    });
    if (!company)
      throw new NotFoundException('Empresa no encontrada o no te pertenece.');

    // 2) employee debe ser creado por este admin y tener rol global EMPLOYEE
    const employee = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        createdByUserId: currentUser.id,
        globalRoles: { some: { role: { name: 'EMPLOYEE' } } },
      },
      select: { id: true },
    });
    if (!employee) {
      throw new ForbiddenException('Ese EMPLOYEE no te pertenece o no existe.');
    }

    // 3) roleId EMPLOYEE (para company_users)
    const employeeRole = await this.prisma.role.findUnique({
      where: { name: 'EMPLOYEE' },
      select: { id: true },
    });
    if (!employeeRole)
      throw new BadRequestException(
        'No existe el rol EMPLOYEE en la tabla roles.',
      );

    // 4) crear vínculo
    try {
      return await this.prisma.companyUser.create({
        data: {
          companyId,
          userId: employee.id,
          roleId: employeeRole.id,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          companyId: true,
          userId: true,
          status: true,
          createdAt: true,
        },
      });
    } catch {
      throw new BadRequestException(
        'El usuario ya está asignado a esta empresa.',
      );
    }
  }

  async listCompanyEmployees(
    companyId: number,
    currentUser: { id: number; role: RoleName },
  ) {
    if (currentUser.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Solo los ADMIN pueden ver employees por empresa.',
      );
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, ownerUserId: currentUser.id },
      select: { id: true },
    });
    if (!company)
      throw new NotFoundException('Empresa no encontrada o no te pertenece.');

    return this.prisma.companyUser.findMany({
      where: { companyId },
      select: {
        id: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            email: true,
            nombre: true,
            phone: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
  */

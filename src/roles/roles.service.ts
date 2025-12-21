import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateRoleDto) {
    const exists = await this.prisma.role.findUnique({
      where: { name: dto.name },
    });
    if (exists) throw new BadRequestException('El rol ya existe.');

    return this.prisma.role.create({
      data: {
        name: dto.name,
        scope: dto.scope as any,
        description: dto.description,
      },
    });
  }

  async findAll() {
    return this.prisma.role.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Rol no encontrado.');
    return role;
  }

  async update(id: number, dto: UpdateRoleDto) {
    const exists = await this.prisma.role.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Rol no encontrado.');

    return this.prisma.role.update({
      where: { id },
      data: { description: dto.description },
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists) throw new BadRequestException('Email ya registrado.');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        nombre: dto.nombre,
        passwordHash,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        phone: true,
        nombre: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        phone: true,
        nombre: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        phone: true,
        nombre: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('Usuario no encontrado.');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Usuario no encontrado.');

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
      },
    });
  }

  async remove(id: string) {
    // Mejor que borrar, desactivamos (soft)
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Usuario no encontrado.');

    return this.prisma.user.update({
      where: { id },
      data: { status: 'INACTIVE' },
      select: { id: true, email: true, status: true, updatedAt: true },
    });
  }
}

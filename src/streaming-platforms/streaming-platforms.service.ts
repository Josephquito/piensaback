import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BaseRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CurrentUserJwt } from '../common/types/current-user-jwt.type';
import { CreateStreamingPlatformDto } from './dto/create-streaming-platform.dto';
import { UpdateStreamingPlatformDto } from './dto/update-streaming-platform.dto';

const PLATFORM_SELECT = {
  id: true,
  name: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class StreamingPlatformsService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================
  // Helpers
  // =========================
  private assertNotEmployee(actor: CurrentUserJwt) {
    if (actor.role === BaseRole.EMPLOYEE) {
      throw new ForbiddenException('EMPLOYEE no puede gestionar plataformas.');
    }
  }

  private async findAndAssert(id: number, companyId: number) {
    const platform = await this.prisma.streamingPlatform.findFirst({
      where: { id, companyId },
    });
    if (!platform) throw new NotFoundException('Plataforma no encontrada.');
    return platform;
  }

  // =========================
  // CRUD
  // =========================
  async findAll(companyId: number) {
    return this.prisma.streamingPlatform.findMany({
      where: { companyId },
      select: {
        ...PLATFORM_SELECT,
        _count: { select: { accounts: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const platform = await this.prisma.streamingPlatform.findFirst({
      where: { id, companyId },
      select: {
        ...PLATFORM_SELECT,
        _count: { select: { accounts: true, streamingSales: true } },
      },
    });
    if (!platform) throw new NotFoundException('Plataforma no encontrada.');
    return platform;
  }

  async create(
    dto: CreateStreamingPlatformDto,
    companyId: number,
    actor: CurrentUserJwt,
  ) {
    this.assertNotEmployee(actor);

    try {
      return await this.prisma.streamingPlatform.create({
        data: {
          companyId,
          name: dto.name
            .trim()
            .toLowerCase()
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          active: dto.active ?? true,
        },
        select: PLATFORM_SELECT,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe una plataforma con ese nombre en esta empresa.',
        );
      }
      throw e;
    }
  }

  async update(
    id: number,
    dto: UpdateStreamingPlatformDto,
    companyId: number,
    actor: CurrentUserJwt,
  ) {
    this.assertNotEmployee(actor);
    await this.findAndAssert(id, companyId);

    const hasChanges = dto.name !== undefined || dto.active !== undefined;

    if (!hasChanges) {
      throw new BadRequestException('No hay campos para actualizar.');
    }

    try {
      return await this.prisma.streamingPlatform.update({
        where: { id },
        data: {
          ...(dto.name !== undefined
            ? {
                name: dto.name
                  .trim()
                  .toLowerCase()
                  .replace(/\b\w/g, (c) => c.toUpperCase()),
              }
            : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
        select: PLATFORM_SELECT,
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException(
          'Ya existe una plataforma con ese nombre en esta empresa.',
        );
      }
      throw e;
    }
  }

  async remove(id: number, companyId: number, actor: CurrentUserJwt) {
    this.assertNotEmployee(actor);
    await this.findAndAssert(id, companyId);

    try {
      await this.prisma.streamingPlatform.delete({ where: { id } });
      return { ok: true, deletedId: id };
    } catch (e: any) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2003') {
          throw new BadRequestException(
            'No se puede eliminar: la plataforma tiene cuentas o ventas asociadas.',
          );
        }
      }
      throw e;
    }
  }
}

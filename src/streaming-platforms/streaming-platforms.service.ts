// streaming-platforms.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

import { CreateStreamingPlatformDto } from './dto/create-streaming-platform.dto';
import { UpdateStreamingPlatformDto } from './dto/update-streaming-platform.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Injectable()
export class StreamingPlatformsService {
  constructor(private prisma: PrismaService) {}

  async create(
    dto: CreateStreamingPlatformDto,
    _actor: ReqUser,
    companyId: number,
  ) {
    try {
      return await this.prisma.streamingPlatform.create({
        data: {
          companyId,
          name: dto.name.trim(),
          active: dto.active ?? true,
        },
      });
    } catch (e: any) {
      // unique companyId+name
      throw new BadRequestException(
        'Ya existe una plataforma con ese nombre en esta empresa.',
      );
    }
  }

  async findAll(_actor: ReqUser, companyId: number) {
    return this.prisma.streamingPlatform.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number, _actor: ReqUser, companyId: number) {
    const platform = await this.prisma.streamingPlatform.findFirst({
      where: { id, companyId },
    });
    if (!platform) throw new NotFoundException('Plataforma no existe.');
    return platform;
  }

  async update(
    id: number,
    dto: UpdateStreamingPlatformDto,
    actor: ReqUser,
    companyId: number,
  ) {
    await this.findOne(id, actor, companyId);

    try {
      return await this.prisma.streamingPlatform.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
    } catch (e: any) {
      // conflicto unique o cualquier error
      throw new BadRequestException('No se pudo actualizar la plataforma.');
    }
  }

  async remove(id: number, actor: ReqUser, companyId: number) {
    await this.findOne(id, actor, companyId);

    try {
      await this.prisma.streamingPlatform.delete({ where: { id } });
      return { ok: true };
    } catch (e: any) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new BadRequestException(
          'No se puede eliminar: la plataforma tiene relaciones registradas.',
        );
      }
      throw new BadRequestException('No se pudo eliminar la plataforma.');
    }
  }
}

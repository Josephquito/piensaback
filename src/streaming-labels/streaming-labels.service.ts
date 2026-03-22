import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStreamingLabelDto } from './dto/create-streaming-label.dto';
import { UpdateStreamingLabelDto } from './dto/update-streaming-label.dto';

@Injectable()
export class StreamingLabelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: number, platformId?: number) {
    return this.prisma.profileLabel.findMany({
      where: {
        companyId,
        ...(platformId ? { platformId } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        platformId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { profiles: true } },
      },
    });
  }

  async create(dto: CreateStreamingLabelDto, companyId: number) {
    // Verifica que la plataforma pertenece a la empresa
    const platform = await this.prisma.streamingPlatform.findFirst({
      where: { id: dto.platformId, companyId },
      select: { id: true },
    });
    if (!platform) throw new BadRequestException('Plataforma no accesible.');

    try {
      return await this.prisma.profileLabel.create({
        data: {
          companyId,
          platformId: dto.platformId,
          name: dto.name.trim(),
          color: dto.color,
        },
        select: {
          id: true,
          name: true,
          color: true,
          platformId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new BadRequestException(
          'Ya existe una etiqueta con ese nombre en esta plataforma.',
        );
      throw e;
    }
  }

  async update(id: number, dto: UpdateStreamingLabelDto, companyId: number) {
    await this.findAndAssert(id, companyId);
    try {
      return await this.prisma.profileLabel.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
        },
        select: {
          id: true,
          name: true,
          color: true,
          platformId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new BadRequestException(
          'Ya existe una etiqueta con ese nombre en esta plataforma.',
        );
      throw e;
    }
  }

  async remove(id: number, companyId: number) {
    await this.findAndAssert(id, companyId);
    await this.prisma.profileLabel.delete({ where: { id } });
    return { ok: true, deletedId: id };
  }

  private async findAndAssert(id: number, companyId: number) {
    const label = await this.prisma.profileLabel.findFirst({
      where: { id, companyId },
    });
    if (!label) throw new NotFoundException('Etiqueta no encontrada.');
    return label;
  }
}

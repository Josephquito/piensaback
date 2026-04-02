import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CampaignContactStatus, CampaignStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BotService } from '../bot/bot.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { AddContactsDto } from './dto/add-contacts.dto';
import { SendContactsDto } from './dto/send-contacts.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly botService: BotService,
  ) {}

  // ─── CRUD Campañas ────────────────────────────────────────────────────────

  async findAll(companyId: number) {
    return this.prisma.campaign.findMany({
      where: { companyId },
      select: {
        id: true,
        name: true,
        message: true,
        imageUrl: true,
        status: true,
        segment: true,
        totalContacts: true,
        sentCount: true,
        respondedCount: true,
        purchasedCount: true,
        failedCount: true,
        ignoredCount: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: number, companyId: number) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        name: true,
        message: true,
        imageUrl: true,
        status: true,
        segment: true,
        totalContacts: true,
        sentCount: true,
        respondedCount: true,
        purchasedCount: true,
        failedCount: true,
        ignoredCount: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
      },
    });
    if (!campaign) throw new NotFoundException('Campaña no encontrada.');
    return campaign;
  }

  async create(dto: CreateCampaignDto, companyId: number) {
    return this.prisma.campaign.create({
      data: {
        companyId,
        name: dto.name,
        message: dto.message,
        imageUrl: dto.imageUrl ?? null,
        segment: dto.segment ?? 'ALL',
      },
    });
  }

  async update(id: number, dto: UpdateCampaignDto, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.message !== undefined ? { message: dto.message } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
        ...(dto.segment !== undefined ? { segment: dto.segment } : {}),
      },
    });
  }

  async remove(id: number, companyId: number) {
    const campaign = await this.findOne(id, companyId);

    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException(
        'No se puede eliminar una campaña en curso. Complétala primero.',
      );
    }

    await this.prisma.campaign.delete({ where: { id } });
    return { ok: true, deletedId: id };
  }

  // ─── Contactos de la campaña ──────────────────────────────────────────────

  async getContacts(id: number, companyId: number) {
    await this.findOne(id, companyId);
    return this.prisma.campaignContact.findMany({
      where: { campaignId: id },
      select: {
        id: true,
        status: true,
        sentAt: true,
        respondedAt: true,
        purchasedAt: true,
        platformPurchased: true,
        failReason: true,
        customer: {
          select: {
            id: true,
            name: true,
            contact: true,
            source: true,
            lastPurchaseAt: true,
            _count: { select: { sales: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addContacts(id: number, dto: AddContactsDto, companyId: number) {
    await this.findOne(id, companyId);

    // Verificar que los clientes pertenecen a la empresa
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: dto.customerIds }, companyId },
      select: { id: true },
    });

    if (customers.length === 0) {
      throw new BadRequestException('No se encontraron clientes válidos.');
    }

    const validIds = customers.map((c) => c.id);

    // Ignorar duplicados con createMany skipDuplicates
    await this.prisma.campaignContact.createMany({
      data: validIds.map((customerId) => ({ campaignId: id, customerId })),
      skipDuplicates: true,
    });

    // Actualizar contador
    const total = await this.prisma.campaignContact.count({
      where: { campaignId: id },
    });
    await this.prisma.campaign.update({
      where: { id },
      data: { totalContacts: total },
    });

    return { ok: true, added: validIds.length };
  }

  async removeContact(
    campaignId: number,
    contactId: number,
    companyId: number,
  ) {
    await this.findOne(campaignId, companyId);

    const cc = await this.prisma.campaignContact.findUnique({
      where: { campaignId_customerId: { campaignId, customerId: contactId } },
    });
    if (!cc) throw new NotFoundException('Contacto no encontrado.');
    if (cc.status !== CampaignContactStatus.PENDING) {
      throw new BadRequestException(
        'Solo se pueden quitar contactos en estado PENDING.',
      );
    }

    await this.prisma.campaignContact.delete({ where: { id: cc.id } });

    const total = await this.prisma.campaignContact.count({
      where: { campaignId },
    });
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { totalContacts: total },
    });

    return { ok: true };
  }

  // ─── Envío ────────────────────────────────────────────────────────────────

  async sendContacts(
    campaignId: number,
    dto: SendContactsDto,
    companyId: number,
  ) {
    const campaign = await this.findOne(campaignId, companyId);

    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException(
        'No se puede enviar mensajes en una campaña completada.',
      );
    }

    const contacts = await this.prisma.campaignContact.findMany({
      where: {
        id: { in: dto.campaignContactIds },
        campaignId,
        status: CampaignContactStatus.PENDING,
      },
      select: {
        id: true,
        customer: { select: { contact: true, name: true } },
      },
    });

    if (contacts.length === 0) {
      throw new BadRequestException(
        'No hay contactos pendientes seleccionados.',
      );
    }

    // Marcar como RUNNING si es la primera vez
    if (campaign.status === CampaignStatus.DRAFT) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.RUNNING, startedAt: new Date() },
      });
    }

    await this.botService.sendCampaignBatch({
      campaignId,
      contacts: contacts.map((c) => ({
        campaignContactId: c.id,
        phone: c.customer.contact,
        name: c.customer.name,
      })),
      message: campaign.message,
      imageUrl: campaign.imageUrl ?? undefined,
    });

    return { ok: true, queued: contacts.length };
  }

  // ─── Callbacks desde el bot ───────────────────────────────────────────────

  async markSent(campaignContactId: number) {
    const cc = await this.prisma.campaignContact.update({
      where: { id: campaignContactId },
      data: { status: CampaignContactStatus.SENT, sentAt: new Date() },
      select: { campaignId: true },
    });
    await this.updateCounts(cc.campaignId);
  }

  async markFailed(campaignContactId: number, reason: string) {
    const cc = await this.prisma.campaignContact.update({
      where: { id: campaignContactId },
      data: {
        status: CampaignContactStatus.FAILED,
        failReason: reason,
      },
      select: { campaignId: true },
    });
    await this.updateCounts(cc.campaignId);
  }

  async markResponded(phone: string, companyId: number) {
    const customer = await this.prisma.customer.findFirst({
      where: { companyId, contact: phone },
      select: { id: true },
    });
    if (!customer) return { marked: false };

    const cc = await this.prisma.campaignContact.findFirst({
      where: {
        customerId: customer.id,
        status: CampaignContactStatus.SENT,
        campaign: { companyId, status: CampaignStatus.RUNNING },
      },
      orderBy: { sentAt: 'desc' },
    });
    if (!cc) return { marked: false };

    const updated = await this.prisma.campaignContact.update({
      where: { id: cc.id },
      data: {
        status: CampaignContactStatus.RESPONDED,
        respondedAt: new Date(),
      },
      select: { campaignId: true },
    });

    await this.updateCounts(updated.campaignId);
    return { marked: true };
  }

  // ─── Evento de venta — marca PURCHASED automáticamente ───────────────────

  @OnEvent('sale.created')
  async onSaleCreated(payload: {
    customerId: number;
    platformName: string;
    companyId: number;
  }) {
    const { customerId, platformName } = payload;

    // Buscar campaignContact RESPONDED más reciente
    const cc = await this.prisma.campaignContact.findFirst({
      where: {
        customerId,
        status: CampaignContactStatus.RESPONDED,
      },
      orderBy: { respondedAt: 'desc' },
    });
    if (!cc) return;

    await this.prisma.campaignContact.update({
      where: { id: cc.id },
      data: {
        status: CampaignContactStatus.PURCHASED,
        purchasedAt: new Date(),
        platformPurchased: platformName,
      },
    });
    await this.updateCounts(cc.campaignId);
  }

  // ─── Helper contadores ────────────────────────────────────────────────────

  private async updateCounts(campaignId: number) {
    const [total, sent, responded, purchased, failed] = await Promise.all([
      this.prisma.campaignContact.count({ where: { campaignId } }),
      this.prisma.campaignContact.count({
        where: { campaignId, sentAt: { not: null } },
      }),
      this.prisma.campaignContact.count({
        where: { campaignId, respondedAt: { not: null } },
      }),
      this.prisma.campaignContact.count({
        where: { campaignId, purchasedAt: { not: null } },
      }),
      this.prisma.campaignContact.count({
        where: { campaignId, status: CampaignContactStatus.FAILED },
      }),
    ]);

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        totalContacts: total,
        sentCount: sent,
        respondedCount: responded,
        purchasedCount: purchased,
        failedCount: failed,
      },
    });
  }

  async updateStatus(id: number, status: CampaignStatus, companyId: number) {
    const campaign = await this.findOne(id, companyId);

    // Validar transiciones permitidas
    if (campaign.status === CampaignStatus.COMPLETED) {
      throw new BadRequestException(
        'Una campaña completada no puede cambiar de estado.',
      );
    }

    if (
      campaign.status === CampaignStatus.DRAFT &&
      status === CampaignStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'No puedes completar una campaña que aún no se ha iniciado.',
      );
    }

    if (
      campaign.status === CampaignStatus.RUNNING &&
      status === CampaignStatus.DRAFT
    ) {
      throw new BadRequestException(
        'No puedes regresar una campaña en curso a borrador.',
      );
    }

    // Validar que todos los contactos fueron enviados antes de completar
    if (status === CampaignStatus.COMPLETED) {
      const pendingCount = await this.prisma.campaignContact.count({
        where: { campaignId: id, status: CampaignContactStatus.PENDING },
      });

      if (pendingCount > 0) {
        throw new BadRequestException(
          `Aún hay ${pendingCount} contacto${pendingCount !== 1 ? 's' : ''} sin enviar.`,
        );
      }
    }

    return this.prisma.campaign.update({
      where: { id },
      data: {
        status,
        ...(status === CampaignStatus.RUNNING ? { startedAt: new Date() } : {}),
        ...(status === CampaignStatus.COMPLETED
          ? { completedAt: new Date() }
          : {}),
      },
    });
  }
  async markSentManual(campaignContactId: number, companyId: number) {
    const cc = await this.prisma.campaignContact.findFirst({
      where: {
        id: campaignContactId,
        campaign: { companyId },
        status: {
          in: [CampaignContactStatus.PENDING, CampaignContactStatus.FAILED],
        },
      },
      select: { id: true, campaignId: true },
    });

    if (!cc) throw new NotFoundException('Contacto no encontrado.');

    const updated = await this.prisma.campaignContact.update({
      where: { id: cc.id },
      data: { status: CampaignContactStatus.SENT, sentAt: new Date() },
      select: { campaignId: true },
    });

    await this.updateCounts(updated.campaignId);
    return { ok: true };
  }
  async markPendingManual(campaignContactId: number, companyId: number) {
    const cc = await this.prisma.campaignContact.findFirst({
      where: {
        id: campaignContactId,
        campaign: { companyId },
        status: CampaignContactStatus.SENT,
      },
      select: { id: true, campaignId: true },
    });

    if (!cc)
      throw new NotFoundException(
        'Contacto no encontrado o no está en estado SENT.',
      );

    const updated = await this.prisma.campaignContact.update({
      where: { id: cc.id },
      data: {
        status: CampaignContactStatus.PENDING,
        sentAt: null,
      },
      select: { campaignId: true },
    });

    await this.updateCounts(updated.campaignId);
    return { ok: true };
  }
}

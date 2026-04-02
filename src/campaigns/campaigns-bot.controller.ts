// src/campaigns/campaigns-bot.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { BotApiKeyGuard } from '../common/guards/bot-api-key.guard';
import { Public } from '../common/decorators/public.decorator';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsBotController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post('callback/sent')
  @Public()
  @UseGuards(BotApiKeyGuard)
  markSent(@Body() body: { campaignContactId: number }) {
    return this.campaignsService.markSent(body.campaignContactId);
  }

  @Post('callback/failed')
  @Public()
  @UseGuards(BotApiKeyGuard)
  markFailed(@Body() body: { campaignContactId: number; reason: string }) {
    return this.campaignsService.markFailed(
      body.campaignContactId,
      body.reason,
    );
  }

  @Post('callback/responded')
  @Public()
  @UseGuards(BotApiKeyGuard)
  markResponded(@Body() body: { phone: string; companyId: number }) {
    return this.campaignsService.markResponded(body.phone, body.companyId);
  }
}

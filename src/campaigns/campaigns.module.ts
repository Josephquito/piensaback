import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { BotModule } from '../bot/bot.module';
import { CampaignsBotController } from './campaigns-bot.controller';

@Module({
  imports: [PrismaModule, BotModule],
  controllers: [CampaignsController, CampaignsBotController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}

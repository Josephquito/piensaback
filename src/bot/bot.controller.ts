import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BotService } from './bot.service';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

@Controller('bot')
@UseGuards(CompanyScopeGuard)
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Get('agent/status')
  @RequirePermissions('USERS:READ')
  getAgentStatus() {
    return this.botService.getAgentStatus();
  }

  @Post('agent/toggle')
  @RequirePermissions('USERS:UPDATE')
  toggleAgent() {
    return this.botService.toggleAgent();
  }

  @Post('agent/enable')
  @RequirePermissions('USERS:UPDATE')
  enableAgent() {
    return this.botService.enableAgent();
  }

  @Post('agent/disable')
  @RequirePermissions('USERS:UPDATE')
  disableAgent() {
    return this.botService.disableAgent();
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { BotApiKeyGuard } from '../common/guards/bot-api-key.guard';
import { SuppliersService } from './suppliers.service';

@Controller('suppliers')
export class SuppliersBotController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get('contacts')
  @Public()
  @UseGuards(BotApiKeyGuard)
  getContacts() {
    const companyId = parseInt(process.env.BOT_COMPANY_ID || '1');
    return this.suppliersService.getAllContacts(companyId);
  }
}

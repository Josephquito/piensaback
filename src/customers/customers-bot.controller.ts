import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { BotApiKeyGuard } from '../common/guards/bot-api-key.guard';
import { CustomersService } from './customers.service';
import { FromBotCustomerDto } from './dto/from-bot-customer.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('customers')
export class CustomersBotController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('from-bot')
  @Public()
  @UseGuards(BotApiKeyGuard)
  createFromBot(@Body() dto: FromBotCustomerDto) {
    return this.customersService.createFromBot(dto);
  }
}

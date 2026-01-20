import { Controller } from '@nestjs/common';
import { SlotSalesService } from './slot-sales.service';

@Controller('slot-sales')
export class SlotSalesController {
  constructor(private readonly slotSalesService: SlotSalesService) {}
}

import { Module } from '@nestjs/common';
import { SlotSalesService } from './slot-sales.service';
import { SlotSalesController } from './slot-sales.controller';

@Module({
  controllers: [SlotSalesController],
  providers: [SlotSalesService],
})
export class SlotSalesModule {}

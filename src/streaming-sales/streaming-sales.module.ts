import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KardexModule } from '../kardex/kardex.module';

import { StreamingSalesController } from './streaming-sales.controller';
import { StreamingSalesService } from './streaming-sales.service';
import { StreamingSalePauseService } from './streaming-sale-pause.service';
import { StreamingSaleTransferService } from './streaming-sale-transfer.service';
import { StreamingSaleRefundService } from './streaming-sale-refund.service';
import { StreamingSaleSchedulerService } from './streaming-sale-scheduler.service';

@Module({
  imports: [PrismaModule, KardexModule],
  controllers: [StreamingSalesController],
  providers: [
    StreamingSalesService,
    StreamingSalePauseService,
    StreamingSaleTransferService,
    StreamingSaleRefundService,
    StreamingSaleSchedulerService,
  ],
  exports: [StreamingSalesService, StreamingSaleRefundService],
})
export class StreamingSalesModule {}

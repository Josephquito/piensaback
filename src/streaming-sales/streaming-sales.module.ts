import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { KardexModule } from '../kardex/kardex.module';

import { StreamingSalesController } from './streaming-sales.controller';
import { StreamingSalesService } from './streaming-sales.service';
import { StreamingSalePauseService } from './streaming-sale-pause.service';
import { StreamingSaleRefundService } from './streaming-sale-refund.service';
import { StreamingSaleSchedulerService } from './streaming-sale-scheduler.service';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [PrismaModule, KardexModule, EventEmitterModule],
  controllers: [StreamingSalesController],
  providers: [
    StreamingSalesService,
    StreamingSalePauseService,
    StreamingSaleRefundService,
    StreamingSaleSchedulerService,
  ],
  exports: [StreamingSalesService, StreamingSaleRefundService],
})
export class StreamingSalesModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { StreamingSalesController } from './streaming-sales.controller';
import { StreamingSalesService } from './streaming-sales.service';

import { KardexModule } from '../kardex/kardex.module';

@Module({
  imports: [PrismaModule, KardexModule],
  controllers: [StreamingSalesController],
  providers: [StreamingSalesService],
  exports: [StreamingSalesService],
})
export class StreamingSalesModule {}

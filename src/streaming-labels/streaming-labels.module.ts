import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { StreamingLabelsService } from './streaming-labels.service';
import { StreamingLabelsController } from './streaming-labels.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StreamingLabelsController],
  providers: [StreamingLabelsService],
  exports: [StreamingLabelsService],
})
export class StreamingLabelsModule {}

// streaming-platforms.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { StreamingPlatformsController } from './streaming-platforms.controller';
import { StreamingPlatformsService } from './streaming-platforms.service';

@Module({
  imports: [PrismaModule],
  controllers: [StreamingPlatformsController],
  providers: [StreamingPlatformsService],
  exports: [StreamingPlatformsService],
})
export class StreamingPlatformsModule {}

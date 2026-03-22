import { Module } from '@nestjs/common';
import { StreamingImportController } from './streaming-import.controller';
import { StreamingImportService } from './streaming-import.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { KardexModule } from '../kardex/kardex.module';

@Module({
  imports: [PrismaModule, KardexModule],
  controllers: [StreamingImportController],
  providers: [StreamingImportService],
})
export class StreamingImportModule {}

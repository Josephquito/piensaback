import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { KardexService } from './kardex.service';
import { KardexController } from './kardex.controller';

@Module({
  imports: [PrismaModule],
  controllers: [KardexController],
  providers: [KardexService],
  exports: [KardexService],
})
export class KardexModule {}

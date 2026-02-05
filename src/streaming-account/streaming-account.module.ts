import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { StreamingAccountsController } from './streaming-account.controller';
import { StreamingAccountsService } from './streaming-account.service';

import { KardexModule } from '../kardex/kardex.module';

@Module({
  imports: [PrismaModule, KardexModule],
  controllers: [StreamingAccountsController],
  providers: [StreamingAccountsService],
  exports: [StreamingAccountsService],
})
export class StreamingAccountModule {}

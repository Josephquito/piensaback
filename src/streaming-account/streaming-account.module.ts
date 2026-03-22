import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { StreamingAccountsController } from './streaming-account.controller';
import { StreamingAccountsService } from './streaming-accounts.service';

import { KardexModule } from '../kardex/kardex.module';
import { StreamingAccountRenewalService } from './streaming-account-renewal.service';
import { StreamingAccountReplacementService } from './streaming-account-replacement.service';
import { StreamingAccountCostCorrectionService } from './streaming-account-cost-correction.service';
import { StreamingAccountDeletionService } from './streaming-account-deletion.service';
import { StreamingAccountSchedulerService } from './streaming-account-scheduler.service';
import { StreamingSalesModule } from '../streaming-sales/streaming-sales.module';
import { StreamingAccountUpdateService } from './streaming-account-update.service';
import { StreamingAccountProfilesService } from './streaming-account-profiles.service';

@Module({
  imports: [PrismaModule, KardexModule, StreamingSalesModule],
  controllers: [StreamingAccountsController],
  providers: [
    StreamingAccountsService,
    StreamingAccountRenewalService,
    StreamingAccountReplacementService,
    StreamingAccountCostCorrectionService,
    StreamingAccountDeletionService,
    StreamingAccountSchedulerService,
    StreamingAccountUpdateService,
    StreamingAccountProfilesService,
  ],
  exports: [StreamingAccountsService],
})
export class StreamingAccountModule {}

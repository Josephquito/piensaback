import { Module } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
import { GoogleAuthController } from './google-auth.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleContactsService } from './google-contacts.service';
import { GoogleSyncService } from './google-sync.service';
import { GoogleSyncController } from './google-sync.controller';
import { GoogleSyncSchedulerService } from './google-sync-scheduler.service';

@Module({
  imports: [PrismaModule],
  controllers: [GoogleAuthController, GoogleSyncController],
  providers: [
    GoogleAuthService,
    GoogleContactsService,
    GoogleSyncService,
    GoogleSyncSchedulerService,
  ],
  exports: [GoogleAuthService, GoogleContactsService, GoogleSyncService],
})
export class GoogleModule {}

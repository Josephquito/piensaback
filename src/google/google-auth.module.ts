import { Module } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
import { GoogleAuthController } from './google-auth.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { GoogleContactsService } from './google-contacts.service';
import { GoogleSyncService } from './google-sync.service';
import { GoogleSyncController } from './google-sync.controller';

@Module({
  imports: [PrismaModule],
  controllers: [GoogleAuthController, GoogleSyncController],
  providers: [GoogleAuthService, GoogleContactsService, GoogleSyncService],
  exports: [GoogleAuthService, GoogleContactsService, GoogleSyncService],
})
export class GoogleModule {}

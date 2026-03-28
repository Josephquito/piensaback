import { Controller, Post, Req, UseGuards } from '@nestjs/common';
import { GoogleSyncService } from './google-sync.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('google')
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
export class GoogleSyncController {
  constructor(
    private readonly googleSync: GoogleSyncService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  // POST /google/sync
  @Post('sync')
  sync(@Req() req: RequestWithUser) {
    return this.googleSync.syncAll(req.companyId!);
  }

  // POST /google/disconnect
  @Post('disconnect')
  disconnect(@Req() req: RequestWithUser) {
    return this.googleAuth.disconnect(req.companyId!);
  }
}

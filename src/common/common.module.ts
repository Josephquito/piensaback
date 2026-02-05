import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

import { CompanyScopeGuard } from './guards/company-scope.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  imports: [PrismaModule],
  providers: [CompanyScopeGuard, PermissionsGuard],
  exports: [CompanyScopeGuard, PermissionsGuard],
})
export class CommonModule {}

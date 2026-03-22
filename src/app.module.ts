import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from '../prisma/prisma.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
//import { CompaniesModule } from './companies/companies.module';

import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { PermissionsModule } from './permissions/permissions.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { CompaniesModule } from './companies/companies.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { CustomersModule } from './customers/customers.module';
import { StreamingPlatformsModule } from './streaming-platforms/streaming-platforms.module';
import { KardexModule } from './kardex/kardex.module';
import { StreamingAccountModule } from './streaming-account/streaming-account.module';
import { StreamingSalesModule } from './streaming-sales/streaming-sales.module';
import { ReportsModule } from './reports/reports.module';
import { ScheduleModule } from '@nestjs/schedule';
import { StreamingLabelsModule } from './streaming-labels/streaming-labels.module';
import { StreamingImportModule } from './streaming-import/streaming-import.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    PermissionsModule,

    AuthorizationModule,
    CompaniesModule,
    SuppliersModule,
    CustomersModule,
    StreamingPlatformsModule,
    KardexModule,
    StreamingAccountModule,
    StreamingSalesModule,
    ReportsModule,
    StreamingLabelsModule,

    StreamingImportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}

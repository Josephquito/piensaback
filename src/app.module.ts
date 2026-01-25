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

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    PermissionsModule,

    AuthorizationModule,
    //CompaniesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}

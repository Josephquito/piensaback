import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { AppService } from './app.service';

import { PrismaModule } from '../prisma/prisma.module';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
//import { CompaniesModule } from './companies/companies.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';

import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { CompanyMemberGuard } from './common/guards/company-member.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { EmployeePermissionsModule } from './employee-permissions/employee-permissions.module';
import { AccountsModule } from './accounts/accounts.module';
import { SlotSalesModule } from './slot-sales/slot-sales.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    //CompaniesModule,
    SuppliersModule,
    CustomersModule,
    ProductsModule,
    EmployeePermissionsModule,
    AccountsModule,
    SlotSalesModule,
    InventoryModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CompanyMemberGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { CommonModule } from '../common/common.module';
import { GoogleModule } from '../google/google-auth.module';

@Module({
  imports: [PrismaModule, CommonModule, GoogleModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
})
export class SuppliersModule {}

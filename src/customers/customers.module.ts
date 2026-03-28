import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CustomersImportExportService } from './customers-import-export.service';
import { GoogleModule } from '../google/google-auth.module';

@Module({
  imports: [
    PrismaModule,
    GoogleModule,
    // Multer en memoria — el buffer se procesa en el servicio
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [CustomersController],
  providers: [CustomersService, CustomersImportExportService],
  exports: [CustomersService, CustomersImportExportService],
})
export class CustomersModule {}

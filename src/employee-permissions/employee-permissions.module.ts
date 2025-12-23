import { Module } from '@nestjs/common';
import { EmployeePermissionsController } from './employee-permissions.controller';
import { EmployeePermissionsService } from './employee-permissions.service';

@Module({
  controllers: [EmployeePermissionsController],
  providers: [EmployeePermissionsService],
})
export class EmployeePermissionsModule {}

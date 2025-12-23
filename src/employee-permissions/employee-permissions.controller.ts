import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { EmployeePermissionsService } from './employee-permissions.service';
import { AddEmployeePermissionsDto } from './dto/add-employee-permissions.dto';
import { SetEmployeePermissionsDto } from './dto/set-employee-permissions.dto';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/employees/:memberId/permissions')
export class EmployeePermissionsController {
  constructor(private readonly service: EmployeePermissionsService) {}

  @RequirePermissions('MEMBERS:READ')
  @Get()
  list(
    @CompanyId() companyId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ) {
    return this.service.list(companyId, memberId);
  }

  @RequirePermissions('MEMBERS:UPDATE')
  @Post()
  add(
    @CompanyId() companyId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: AddEmployeePermissionsDto,
  ) {
    return this.service.add(companyId, memberId, dto.keys);
  }

  @RequirePermissions('MEMBERS:UPDATE')
  @Put()
  set(
    @CompanyId() companyId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Body() dto: SetEmployeePermissionsDto,
  ) {
    return this.service.set(companyId, memberId, dto.keys);
  }

  @RequirePermissions('MEMBERS:UPDATE')
  @Delete(':key')
  removeOne(
    @CompanyId() companyId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @Param('key') key: string,
  ) {
    return this.service.removeOne(companyId, memberId, key);
  }
}

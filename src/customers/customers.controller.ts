import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';

import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller('customers')
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermissions('CUSTOMERS:CREATE')
  create(
    @Body() dto: CreateCustomerDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.customersService.create(dto, req.user, req.companyId);
  }

  @Get()
  @RequirePermissions('CUSTOMERS:READ')
  findAll(@Req() req: { user: ReqUser; companyId: number }) {
    return this.customersService.findAll(req.user, req.companyId);
  }

  @Get(':id')
  @RequirePermissions('CUSTOMERS:READ')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.customersService.findOne(id, req.user, req.companyId);
  }

  @Patch(':id')
  @RequirePermissions('CUSTOMERS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.customersService.update(id, dto, req.user, req.companyId);
  }

  @Delete(':id')
  @RequirePermissions('CUSTOMERS:DELETE')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.customersService.remove(id, req.user, req.companyId);
  }
}

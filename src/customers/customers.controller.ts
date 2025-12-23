/* eslint-disable @typescript-eslint/no-unsafe-return */
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
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import * as requestWithUserInterface from '../common/interfaces/request-with-user.interface';

import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  // =========================
  // CREATE
  // =========================
  @RequirePermissions('CUSTOMERS:CREATE')
  @Post()
  create(
    @CompanyId() companyId: number,
    @Req() req: requestWithUserInterface.RequestWithUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customers.create(companyId, req.user.id, dto);
  }

  // =========================
  // READ (ALL)
  // =========================
  @RequirePermissions('CUSTOMERS:READ')
  @Get()
  findAll(@CompanyId() companyId: number) {
    return this.customers.findAll(companyId);
  }

  // =========================
  // READ (ONE)
  // =========================
  @RequirePermissions('CUSTOMERS:READ')
  @Get(':id')
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.customers.findOne(companyId, id);
  }

  // =========================
  // UPDATE
  // =========================
  @RequirePermissions('CUSTOMERS:UPDATE')
  @Patch(':id')
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: requestWithUserInterface.RequestWithUser,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(companyId, id, req.user.id, dto);
  }

  // =========================
  // DELETE
  // =========================
  @RequirePermissions('CUSTOMERS:DELETE')
  @Delete(':id')
  remove(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.customers.remove(companyId, id);
  }
}

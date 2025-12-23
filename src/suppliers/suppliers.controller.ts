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

import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import * as requestWithUserInterface from '../common/interfaces/request-with-user.interface';

@UseGuards(JwtAuthGuard)
@Controller('companies/:companyId/suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  // =========================
  // CREATE
  // =========================
  @RequirePermissions('SUPPLIERS:CREATE')
  @Post()
  create(
    @CompanyId() companyId: number,
    @Req() req: requestWithUserInterface.RequestWithUser,
    @Body() dto: CreateSupplierDto,
  ) {
    return this.suppliers.create(companyId, req.user.id, dto);
  }

  // =========================
  // READ (ALL)
  // =========================
  @RequirePermissions('SUPPLIERS:READ')
  @Get()
  findAll(@CompanyId() companyId: number) {
    return this.suppliers.findAll(companyId);
  }

  // =========================
  // READ (ONE)
  // =========================
  @RequirePermissions('SUPPLIERS:READ')
  @Get(':id')
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.suppliers.findOne(companyId, id);
  }

  // =========================
  // UPDATE
  // =========================
  @RequirePermissions('SUPPLIERS:UPDATE')
  @Patch(':id')
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: requestWithUserInterface.RequestWithUser,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliers.update(companyId, id, req.user.id, dto);
  }

  // =========================
  // DELETE
  // =========================
  @RequirePermissions('SUPPLIERS:DELETE')
  @Delete(':id')
  remove(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.suppliers.remove(companyId, id);
  }
}

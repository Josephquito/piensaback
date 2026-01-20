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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyId } from '../common/decorators/company-id.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import * as requestWithUserInterface from '../common/interfaces/request-with-user.interface';

import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('companies/:companyId/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @RequirePermissions('PRODUCTS:CREATE')
  @Post()
  create(
    @CompanyId() companyId: number,
    @Req() req: requestWithUserInterface.RequestWithUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.products.create(companyId, req.user.id, dto);
  }

  @RequirePermissions('PRODUCTS:READ')
  @Get()
  findAll(
    @CompanyId() companyId: number,
    @Query('type') type?: string, // PLATFORM | RECHARGE | OTHER
  ) {
    return this.products.findAll(companyId, type);
  }

  @RequirePermissions('PRODUCTS:READ')
  @Get(':id')
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.products.findOne(companyId, id);
  }

  @RequirePermissions('PRODUCTS:UPDATE')
  @Patch(':id')
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: requestWithUserInterface.RequestWithUser,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(companyId, id, req.user.id, dto);
  }

  @RequirePermissions('PRODUCTS:DELETE')
  @Delete(':id')
  remove(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.products.remove(companyId, id);
  }
}

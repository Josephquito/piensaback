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
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { AdjustBalanceDto } from './dto/adjust-balance.dto';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  @RequirePermissions('SUPPLIERS:READ')
  findAll(@Req() req: RequestWithUser) {
    return this.suppliersService.findAll(req.companyId!);
  }

  @Get(':id')
  @RequirePermissions('SUPPLIERS:READ')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.suppliersService.findOne(id, req.companyId!);
  }

  @Post()
  @RequirePermissions('SUPPLIERS:CREATE')
  create(@Body() dto: CreateSupplierDto, @Req() req: RequestWithUser) {
    return this.suppliersService.create(dto, req.companyId!, req.user);
  }

  @Patch(':id')
  @RequirePermissions('SUPPLIERS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @Req() req: RequestWithUser,
  ) {
    return this.suppliersService.update(id, dto, req.companyId!, req.user);
  }

  @Delete(':id')
  @RequirePermissions('SUPPLIERS:DELETE')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.suppliersService.remove(id, req.companyId!, req.user);
  }

  @Post(':id/balance')
  @RequirePermissions('SUPPLIERS:UPDATE')
  adjustBalance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustBalanceDto,
    @Req() req: RequestWithUser,
  ) {
    return this.suppliersService.adjustBalance(
      id,
      dto,
      req.companyId!,
      req.user,
    );
  }

  @Get(':id/accounts')
  @RequirePermissions('SUPPLIERS:READ')
  accountsBySupplier(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.suppliersService.accountsBySupplier(id, req.companyId!);
  }
}

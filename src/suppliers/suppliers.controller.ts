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

import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller('suppliers')
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermissions('SUPPLIERS:CREATE')
  create(
    @Body() dto: CreateSupplierDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.suppliersService.create(dto, req.user, req.companyId);
  }

  @Get()
  @RequirePermissions('SUPPLIERS:READ')
  findAll(@Req() req: { user: ReqUser; companyId: number }) {
    return this.suppliersService.findAll(req.user, req.companyId);
  }

  @Get(':id')
  @RequirePermissions('SUPPLIERS:READ')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.suppliersService.findOne(id, req.user, req.companyId);
  }

  @Patch(':id')
  @RequirePermissions('SUPPLIERS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.suppliersService.update(id, dto, req.user, req.companyId);
  }

  @Delete(':id')
  @RequirePermissions('SUPPLIERS:DELETE')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.suppliersService.remove(id, req.user, req.companyId);
  }

  @Get(':id/accounts')
  @RequirePermissions('SUPPLIERS:READ')
  accountsBySupplier(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.suppliersService.accountsBySupplier(
      id,
      req.user,
      req.companyId,
    );
  }
}

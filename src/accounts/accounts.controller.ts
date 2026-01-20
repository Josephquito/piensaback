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

import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('companies/:companyId/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @RequirePermissions('ACCOUNTS:CREATE')
  @Post()
  create(
    @CompanyId() companyId: number,
    @Req() req: requestWithUserInterface.RequestWithUser,
    @Body() dto: CreateAccountDto,
  ) {
    return this.accounts.create(companyId, req.user.id, dto);
  }

  @RequirePermissions('ACCOUNTS:READ')
  @Get()
  findAll(
    @CompanyId() companyId: number,
    @Query('productId') productId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.accounts.findAll(
      companyId,
      productId ? Number(productId) : undefined,
      includeInactive === 'true',
    );
  }

  @RequirePermissions('ACCOUNTS:READ')
  @Get(':id')
  findOne(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.accounts.findOne(companyId, id, includeInactive === 'true');
  }

  @RequirePermissions('ACCOUNTS:READ')
  @Get(':id/slots')
  listSlots(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.accounts.listSlots(companyId, id);
  }

  @RequirePermissions('ACCOUNTS:UPDATE')
  @Patch(':id')
  update(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: requestWithUserInterface.RequestWithUser,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accounts.update(companyId, id, req.user.id, dto);
  }

  @RequirePermissions('ACCOUNTS:DELETE')
  @Delete(':id')
  remove(
    @CompanyId() companyId: number,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: requestWithUserInterface.RequestWithUser,
  ) {
    return this.accounts.softDelete(companyId, id, req.user.id);
  }
}

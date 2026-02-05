import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

import { StreamingSalesService } from './streaming-sales.service';
import { CreateStreamingSaleDto } from './dto/create-streaming-sale.dto';
import { UpdateStreamingSaleDto } from './dto/update-streaming-sale.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller('streaming-sales')
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
export class StreamingSalesController {
  constructor(private readonly service: StreamingSalesService) {}

  @Post()
  @RequirePermissions('STREAMING_SALES:CREATE')
  create(
    @Body() dto: CreateStreamingSaleDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.create(dto, req.user, req.companyId);
  }

  @Get()
  @RequirePermissions('STREAMING_SALES:READ')
  findAll(@Req() req: { user: ReqUser; companyId: number }) {
    return this.service.findAll(req.user, req.companyId);
  }

  @Get(':id')
  @RequirePermissions('STREAMING_SALES:READ')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.findOne(id, req.user, req.companyId);
  }

  @Patch(':id')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStreamingSaleDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.update(id, dto, req.user, req.companyId);
  }
}

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
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { StreamingSalesService } from './streaming-sales.service';
import { CreateStreamingSaleDto } from './dto/create-streaming-sale.dto';
import { UpdateStreamingSaleDto } from './dto/update-streaming-sale.dto';
import { RenewStreamingSaleDto } from './dto/renew-streaming-sale.dto';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('streaming-sales')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class StreamingSalesController {
  constructor(private readonly service: StreamingSalesService) {}

  @Get()
  @RequirePermissions('STREAMING_SALES:READ')
  findAll(@Req() req: RequestWithUser) {
    return this.service.findAll(req.companyId!);
  }

  @Get(':id')
  @RequirePermissions('STREAMING_SALES:READ')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.findOne(id, req.companyId!);
  }

  @Post()
  @RequirePermissions('STREAMING_SALES:CREATE')
  create(@Body() dto: CreateStreamingSaleDto, @Req() req: RequestWithUser) {
    return this.service.create(dto, req.companyId!);
  }

  @Patch(':id')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStreamingSaleDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.update(id, dto, req.companyId!);
  }

  @Post(':id/empty')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  empty(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.empty(id, req.companyId!);
  }

  @Post(':id/renew')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenewStreamingSaleDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.renew(id, dto, req.companyId!);
  }
}

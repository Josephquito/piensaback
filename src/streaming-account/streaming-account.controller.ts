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

import { StreamingAccountsService } from './streaming-account.service';
import { CreateStreamingAccountDto } from './dto/create-streaming-account.dto';
import { UpdateStreamingAccountDto } from './dto/update-streaming-account.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller('streaming-accounts')
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
export class StreamingAccountsController {
  constructor(private readonly service: StreamingAccountsService) {}

  @Post()
  @RequirePermissions('STREAMING_ACCOUNTS:CREATE')
  create(
    @Body() dto: CreateStreamingAccountDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.create(dto, req.user, req.companyId);
  }

  @Get()
  @RequirePermissions('STREAMING_ACCOUNTS:READ')
  findAll(@Req() req: { user: ReqUser; companyId: number }) {
    return this.service.findAll(req.user, req.companyId);
  }

  @Get(':id')
  @RequirePermissions('STREAMING_ACCOUNTS:READ')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.findOne(id, req.user, req.companyId);
  }

  @Patch(':id')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStreamingAccountDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.update(id, dto, req.user, req.companyId);
  }
}

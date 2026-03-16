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
import { StreamingAccountsService } from './streaming-account.service';
import { CreateStreamingAccountDto } from './dto/create-streaming-account.dto';
import { UpdateStreamingAccountDto } from './dto/update-streaming-account.dto';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('streaming-accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class StreamingAccountsController {
  constructor(private readonly service: StreamingAccountsService) {}

  @Get()
  @RequirePermissions('STREAMING_ACCOUNTS:READ')
  findAll(@Req() req: RequestWithUser) {
    return this.service.findAll(req.companyId!);
  }

  @Get(':id')
  @RequirePermissions('STREAMING_ACCOUNTS:READ')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.findOne(id, req.companyId!);
  }

  @Post()
  @RequirePermissions('STREAMING_ACCOUNTS:CREATE')
  create(@Body() dto: CreateStreamingAccountDto, @Req() req: RequestWithUser) {
    return this.service.create(dto, req.companyId!);
  }

  @Patch(':id')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStreamingAccountDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.update(id, dto, req.companyId!);
  }
}

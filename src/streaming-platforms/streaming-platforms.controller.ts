// streaming-platforms.controller.ts
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
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

import { StreamingPlatformsService } from './streaming-platforms.service';
import { CreateStreamingPlatformDto } from './dto/create-streaming-platform.dto';
import { UpdateStreamingPlatformDto } from './dto/update-streaming-platform.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller('streaming-platforms')
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
export class StreamingPlatformsController {
  constructor(private readonly service: StreamingPlatformsService) {}

  @Post()
  @RequirePermissions('STREAMING_PLATFORMS:CREATE')
  create(
    @Body() dto: CreateStreamingPlatformDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.create(dto, req.user, req.companyId);
  }

  @Get()
  @RequirePermissions('STREAMING_PLATFORMS:READ')
  findAll(@Req() req: { user: ReqUser; companyId: number }) {
    return this.service.findAll(req.user, req.companyId);
  }

  @Get(':id')
  @RequirePermissions('STREAMING_PLATFORMS:READ')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.findOne(id, req.user, req.companyId);
  }

  @Patch(':id')
  @RequirePermissions('STREAMING_PLATFORMS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStreamingPlatformDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.update(id, dto, req.user, req.companyId);
  }

  @Delete(':id')
  @RequirePermissions('STREAMING_PLATFORMS:DELETE')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.remove(id, req.user, req.companyId);
  }
}

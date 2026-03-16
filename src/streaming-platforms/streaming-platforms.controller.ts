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
import { StreamingPlatformsService } from './streaming-platforms.service';
import { CreateStreamingPlatformDto } from './dto/create-streaming-platform.dto';
import { UpdateStreamingPlatformDto } from './dto/update-streaming-platform.dto';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('streaming-platforms')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class StreamingPlatformsController {
  constructor(private readonly service: StreamingPlatformsService) {}

  @Get()
  @RequirePermissions('STREAMING_PLATFORMS:READ')
  findAll(@Req() req: RequestWithUser) {
    return this.service.findAll(req.companyId!);
  }

  @Get(':id')
  @RequirePermissions('STREAMING_PLATFORMS:READ')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.findOne(id, req.companyId!);
  }

  @Post()
  @RequirePermissions('STREAMING_PLATFORMS:CREATE')
  create(@Body() dto: CreateStreamingPlatformDto, @Req() req: RequestWithUser) {
    return this.service.create(dto, req.companyId!, req.user);
  }

  @Patch(':id')
  @RequirePermissions('STREAMING_PLATFORMS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStreamingPlatformDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.update(id, dto, req.companyId!, req.user);
  }

  @Delete(':id')
  @RequirePermissions('STREAMING_PLATFORMS:DELETE')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.remove(id, req.companyId!, req.user);
  }
}

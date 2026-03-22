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
import { StreamingLabelsService } from './streaming-labels.service';
import { CreateStreamingLabelDto } from './dto/create-streaming-label.dto';
import { UpdateStreamingLabelDto } from './dto/update-streaming-label.dto';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('streaming-labels')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class StreamingLabelsController {
  constructor(private readonly service: StreamingLabelsService) {}

  @Get()
  @RequirePermissions('STREAMING_ACCOUNTS:READ')
  findAll(@Req() req: RequestWithUser) {
    return this.service.findAll(req.companyId!);
  }

  @Post()
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  create(@Body() dto: CreateStreamingLabelDto, @Req() req: RequestWithUser) {
    return this.service.create(dto, req.companyId!);
  }

  @Patch(':id')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStreamingLabelDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.update(id, dto, req.companyId!);
  }

  @Delete(':id')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.remove(id, req.companyId!);
  }
}

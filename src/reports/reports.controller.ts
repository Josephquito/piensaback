import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

import { ReportsService } from './reports.service';
import { StreamingSalesReportQueryDto } from './dto/streaming-sales-report.query';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller('reports')
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  // 1) Listado paginado + profit + totals
  @Get('streaming-sales')
  @RequirePermissions('STREAMING_SALES:READ')
  streamingSales(
    @Query() query: StreamingSalesReportQueryDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.streamingSalesReport(query, req.companyId);
  }

  // 2) Summary
  @Get('streaming-sales/summary')
  @RequirePermissions('STREAMING_SALES:READ')
  streamingSalesSummary(
    @Query() query: StreamingSalesReportQueryDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.streamingSalesSummary(query, req.companyId);
  }

  // 3) Group by day
  @Get('streaming-sales/by-day')
  @RequirePermissions('STREAMING_SALES:READ')
  streamingSalesByDay(
    @Query() query: StreamingSalesReportQueryDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.streamingSalesByDay(query, req.companyId);
  }

  // 4) Group by platform
  @Get('streaming-sales/by-platform')
  @RequirePermissions('STREAMING_SALES:READ')
  streamingSalesByPlatform(
    @Query() query: StreamingSalesReportQueryDto,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.service.streamingSalesByPlatform(query, req.companyId);
  }
}

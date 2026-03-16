import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { KardexService } from './kardex.service';
import { KardexQueryDto } from './dto/kardex-query.dto';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('kardex')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class KardexController {
  constructor(private readonly kardexService: KardexService) {}

  // Stock actual por plataforma
  @Get('items')
  @RequirePermissions('KARDEX:READ')
  getItems(@Req() req: RequestWithUser) {
    return this.kardexService.getItems(req.companyId!);
  }

  // Historial de movimientos con paginación y filtro opcional por plataforma
  @Get('movements')
  @RequirePermissions('KARDEX:READ')
  getMovements(@Query() query: KardexQueryDto, @Req() req: RequestWithUser) {
    return this.kardexService.getMovements(req.companyId!, query);
  }

  // Movimientos por plataforma específica — shortcut del filtro
  @Get('platform/:platformId')
  @RequirePermissions('KARDEX:READ')
  getMovementsByPlatform(
    @Param('platformId', ParseIntPipe) platformId: number,
    @Query() query: KardexQueryDto,
    @Req() req: RequestWithUser,
  ) {
    return this.kardexService.getMovements(req.companyId!, {
      ...query,
      platformId,
    });
  }
}

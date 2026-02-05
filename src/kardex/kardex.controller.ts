import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

import { PrismaService } from '../../prisma/prisma.service';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller('kardex')
@UseGuards(JwtAuthGuard, CompanyScopeGuard)
export class KardexController {
  constructor(private prisma: PrismaService) {}

  // Lista items (stock + avgCost) por plataforma
  @Get('items')
  @RequirePermissions('KARDEX:READ')
  items(@Req() req: { user: ReqUser; companyId: number }) {
    return this.prisma.costItem.findMany({
      where: { companyId: req.companyId },
      include: { platform: true },
      orderBy: { id: 'desc' },
    });
  }

  // Historial de movimientos (opcional filtrar por platformId)
  @Get('movements')
  @RequirePermissions('KARDEX:READ')
  movements(@Req() req: { user: ReqUser; companyId: number }) {
    return this.prisma.kardexMovement.findMany({
      where: { companyId: req.companyId },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        item: { include: { platform: true } },
        account: true,
        sale: true,
      },
    });
  }

  // Movimientos por plataforma
  @Get('platform/:platformId')
  @RequirePermissions('KARDEX:READ')
  movementsByPlatform(
    @Param('platformId', ParseIntPipe) platformId: number,
    @Req() req: { user: ReqUser; companyId: number },
  ) {
    return this.prisma.kardexMovement.findMany({
      where: {
        companyId: req.companyId,
        item: { platformId },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        item: { include: { platform: true } },
        account: true,
        sale: true,
      },
    });
  }
}

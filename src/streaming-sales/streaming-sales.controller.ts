import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserToday } from '../common/decorators/user-date.decorator';
import { RenewalMessageStatus, SaleStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { StreamingSalesService } from './streaming-sales.service';
import { StreamingSalePauseService } from './streaming-sale-pause.service';
import { StreamingSaleRefundService } from './streaming-sale-refund.service';
import { CreateStreamingSaleDto } from './dto/create-streaming-sale.dto';
import { UpdateStreamingSaleDto } from './dto/update-streaming-sale.dto';
import { RenewStreamingSaleDto } from './dto/renew-streaming-sale.dto';
import { UpdateRenewalStatusDto } from './dto/update-renewal-status.dto';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('streaming-sales')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class StreamingSalesController {
  constructor(
    private readonly service: StreamingSalesService,
    private readonly pauseService: StreamingSalePauseService,
    private readonly refundService: StreamingSaleRefundService,
  ) {}

  // Listar ventas con filtros opcionales de status y renewalStatus
  @Get()
  @RequirePermissions('STREAMING_SALES:READ')
  findAll(
    @Req() req: RequestWithUser,
    @Query('status') status?: SaleStatus,
    @Query('renewalStatus') renewalStatus?: RenewalMessageStatus,
    @Query('accountId') accountId?: string,
  ) {
    return this.service.findAll(req.companyId!, {
      status,
      renewalStatus,
      accountId: accountId ? Number(accountId) : undefined,
    });
  }

  // Obtener detalle de una venta
  @Get(':id')
  @RequirePermissions('STREAMING_SALES:READ')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.findOne(id, req.companyId!);
  }

  // Crear nueva venta en un perfil disponible
  @Post()
  @RequirePermissions('STREAMING_SALES:CREATE')
  create(
    @Body() dto: CreateStreamingSaleDto,
    @Req() req: RequestWithUser,
    @UserToday() today: Date,
  ) {
    return this.service.create(dto, req.companyId!, today);
  }

  // Editar datos de una venta (cliente, precio, fechas, notas)
  @Patch(':id')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStreamingSaleDto,
    @Req() req: RequestWithUser,
    @UserToday() today: Date,
  ) {
    return this.service.update(id, dto, req.companyId!, today);
  }

  // Vaciar perfil — pasa a AVAILABLE y venta a CLOSED
  @Post(':id/empty')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  empty(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
    @UserToday() today: Date,
  ) {
    return this.service.empty(id, req.companyId!, today);
  }

  // Renovar venta — cierra la actual y crea una nueva en el mismo perfil
  @Post(':id/renew')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenewStreamingSaleDto,
    @Req() req: RequestWithUser,
    @UserToday() today: Date,
  ) {
    return this.service.renew(id, dto, req.companyId!, today);
  }

  // Pausar venta — congela días restantes y calcula saldo equivalente
  @Post(':id/pause')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  pause(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
    @UserToday() today: Date,
  ) {
    return this.pauseService.pause(id, req.companyId!, today);
  }

  // Reanudar venta pausada — recalcula cutoffDate desde hoy
  @Post(':id/resume')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  resume(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
    @UserToday() today: Date,
  ) {
    return this.pauseService.resume(id, req.companyId!, today);
  }

  // Reembolsar saldo al cliente y cerrar el perfil
  @Post(':id/refund')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  refund(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.refundService.refund(id, req.companyId!);
  }

  // Actualizar estado de mensaje de renovación manualmente
  @Patch(':id/renewal-status')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  updateRenewalStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateRenewalStatusDto,
    @Req() req: RequestWithUser,
  ) {
    return this.service.updateRenewalStatus(
      id,
      dto.renewalStatus,
      req.companyId!,
    );
  }
}

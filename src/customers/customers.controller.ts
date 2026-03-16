import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

import { CustomersService } from './customers.service';
import { CustomersImportExportService } from './customers-import-export.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';

import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly importExportService: CustomersImportExportService,
  ) {}

  // ── Listado paginado ──────────────────────────────────────────────────────
  @Get()
  @RequirePermissions('CUSTOMERS:READ')
  findAll(@Query() query: CustomerQueryDto, @Req() req: RequestWithUser) {
    return this.customersService.findAll(req.companyId!, query);
  }

  @Get('next-number')
  @RequirePermissions('CUSTOMERS:READ')
  getNextCustomerNumber(@Req() req: RequestWithUser) {
    return this.customersService.getNextCustomerNumber(req.companyId!);
  }

  // ── Orígenes únicos ───────────────────────────────────────────────────────
  @Get('sources')
  @RequirePermissions('CUSTOMERS:READ')
  getSources(@Req() req: RequestWithUser) {
    return this.customersService.getSources(req.companyId!);
  }

  // ── Plantilla CSV ─────────────────────────────────────────────────────────
  @Get('import/template')
  @RequirePermissions('CUSTOMERS:READ')
  getImportTemplate(@Res() res: Response) {
    const buffer = this.importExportService.getImportTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="clientes_plantilla.csv"',
    );
    res.send(buffer);
  }

  // ── Importar CSV ──────────────────────────────────────────────────────────
  @Post('import')
  @RequirePermissions('CUSTOMERS:CREATE')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
        if (
          !allowed.includes(file.mimetype) &&
          !file.originalname.endsWith('.csv')
        ) {
          return cb(new Error('Solo se aceptan archivos .csv'), false);
        }
        cb(null, true);
      },
    }),
  )
  importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ) {
    if (!file) throw new Error('No se recibió ningún archivo.');
    return this.importExportService.importCsv(
      file.buffer,
      req.companyId!,
      req.user,
    );
  }

  // ── Exportar CSV ──────────────────────────────────────────────────────────
  @Get('export')
  @RequirePermissions('CUSTOMERS:READ')
  async exportCsv(
    @Query() query: CustomerQueryDto,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    const buffer = await this.importExportService.exportCsv(
      req.companyId!,
      query,
    );
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="clientes_${date}.csv"`,
    );
    res.send(buffer);
  }

  // ── Detalle ───────────────────────────────────────────────────────────────
  @Get(':id')
  @RequirePermissions('CUSTOMERS:READ')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.customersService.findOne(id, req.companyId!);
  }

  // ── Historial ─────────────────────────────────────────────────────────────
  @Get(':id/history')
  @RequirePermissions('CUSTOMERS:READ')
  getHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: CustomerQueryDto,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.getHistory(id, req.companyId!, query);
  }

  // ── Crear ─────────────────────────────────────────────────────────────────
  @Post()
  @RequirePermissions('CUSTOMERS:CREATE')
  create(@Body() dto: CreateCustomerDto, @Req() req: RequestWithUser) {
    return this.customersService.create(dto, req.companyId!, req.user);
  }

  // ── Actualizar ────────────────────────────────────────────────────────────
  @Patch(':id')
  @RequirePermissions('CUSTOMERS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @Req() req: RequestWithUser,
  ) {
    return this.customersService.update(id, dto, req.companyId!, req.user);
  }

  // ── Eliminar ──────────────────────────────────────────────────────────────
  @Delete(':id')
  @RequirePermissions('CUSTOMERS:DELETE')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.customersService.remove(id, req.companyId!, req.user);
  }
}

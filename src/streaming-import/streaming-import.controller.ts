import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { StreamingImportService } from './streaming-import.service';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('streaming/import')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class StreamingImportController {
  constructor(private readonly importService: StreamingImportService) {}

  @Get('accounts/template')
  @RequirePermissions('STREAMING_ACCOUNTS:CREATE')
  getTemplate(@Res() res: Response) {
    const buffer = this.importService.getTemplate();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="plantilla_cuentas.csv"',
    );
    res.send(buffer);
  }

  @Post('accounts')
  @RequirePermissions('STREAMING_ACCOUNTS:CREATE')
  @UseInterceptors(FileInterceptor('file'))
  importAccounts(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');

    if (
      file.mimetype !== 'text/csv' &&
      !file.originalname.toLowerCase().endsWith('.csv')
    )
      throw new BadRequestException('El archivo debe ser .csv');

    return this.importService.importFromBuffer(file.buffer, req.companyId!);
  }
}

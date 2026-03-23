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

  // ← endpoint SSE — reemplaza al POST original
  @Post('accounts/stream')
  @RequirePermissions('STREAMING_ACCOUNTS:CREATE')
  @UseInterceptors(FileInterceptor('file'))
  async importAccountsStream(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo.');
    if (
      file.mimetype !== 'text/csv' &&
      !file.originalname.toLowerCase().endsWith('.csv')
    )
      throw new BadRequestException('El archivo debe ser .csv');

    // Headers SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // importante para nginx
    res.flushHeaders();

    const stream$ = this.importService.importFromBufferStream(
      file.buffer,
      req.companyId!,
    );

    stream$.subscribe({
      next: (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        // ← forzar envío inmediato al cliente
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      },
      error: (err) => {
        res.write(
          `data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`,
        );
        res.end();
      },
      complete: () => {
        res.end();
      },
    });
  }
}

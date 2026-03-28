import { Controller, Get, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { GoogleAuthService } from './google-auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { Public } from '../common/decorators/public.decorator';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('google')
export class GoogleAuthController {
  constructor(private readonly googleAuthService: GoogleAuthService) {}

  @UseGuards(JwtAuthGuard, CompanyScopeGuard)
  @Get('auth-url')
  getAuthUrl(@Req() req: RequestWithUser) {
    const url = this.googleAuthService.getAuthUrl(req.companyId!);
    return { url };
  }

  @Public() // ← sin JWT, Google redirige aquí
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.googleAuthService.handleCallback(code, Number(state));
    res.redirect(`${process.env.FRONTEND_URL}/settings?google=connected`);
  }

  @UseGuards(JwtAuthGuard, CompanyScopeGuard)
  @Get('status')
  async getStatus(@Req() req: RequestWithUser) {
    return this.googleAuthService.getStatus(req.companyId!);
  }
}

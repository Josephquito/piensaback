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
import { StreamingAccountsService } from './streaming-accounts.service';
import { StreamingAccountUpdateService } from './streaming-account-update.service';
import { StreamingAccountProfilesService } from './streaming-account-profiles.service';
import { StreamingAccountRenewalService } from './streaming-account-renewal.service';
import { StreamingAccountReplacementService } from './streaming-account-replacement.service';
import { StreamingAccountCostCorrectionService } from './streaming-account-cost-correction.service';
import { StreamingAccountDeletionService } from './streaming-account-deletion.service';
import { StreamingSaleRefundService } from '../streaming-sales/streaming-sale-refund.service';
import { CreateStreamingAccountDto } from './dto/create-streaming-account.dto';
import { UpdateStreamingAccountDto } from './dto/update-streaming-account.dto';
import { RenewAccountDto } from './dto/renew-account.dto';
import { ReplaceCredentialsDto } from './dto/replace-credentials.dto';
import { ReplacePaidDto } from './dto/replace-paid.dto';
import { ReplaceFromInventoryDto } from './dto/replace-from-inventory.dto';
import { CorrectCostDto } from './dto/correct-cost.dto';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('streaming-accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard, CompanyScopeGuard)
export class StreamingAccountsController {
  constructor(
    private readonly service: StreamingAccountsService,
    private readonly updateService: StreamingAccountUpdateService,
    private readonly profilesService: StreamingAccountProfilesService,
    private readonly renewalService: StreamingAccountRenewalService,
    private readonly replacementService: StreamingAccountReplacementService,
    private readonly costCorrectionService: StreamingAccountCostCorrectionService,
    private readonly deletionService: StreamingAccountDeletionService,
    private readonly refundService: StreamingSaleRefundService,
  ) {}

  @Get()
  @RequirePermissions('STREAMING_ACCOUNTS:READ')
  findAll(@Req() req: RequestWithUser) {
    return this.service.findAll(req.companyId!);
  }

  @Get(':id')
  @RequirePermissions('STREAMING_ACCOUNTS:READ')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.service.findOne(id, req.companyId!);
  }

  @Post()
  @RequirePermissions('STREAMING_ACCOUNTS:CREATE')
  create(@Body() dto: CreateStreamingAccountDto, @Req() req: RequestWithUser) {
    return this.service.create(dto, req.companyId!);
  }

  @Patch(':id')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStreamingAccountDto,
    @Req() req: RequestWithUser,
  ) {
    return this.updateService.update(id, dto, req.companyId!);
  }

  @Delete(':id')
  @RequirePermissions('STREAMING_ACCOUNTS:DELETE')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.deletionService.remove(id, req.companyId!);
  }

  @Post(':id/renew')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  renew(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RenewAccountDto,
    @Req() req: RequestWithUser,
  ) {
    return this.renewalService.renew(id, dto, req.companyId!);
  }

  @Post(':id/correct-cost')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  correctCost(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectCostDto,
    @Req() req: RequestWithUser,
  ) {
    return this.costCorrectionService.correctCost(id, dto, req.companyId!);
  }

  @Post(':id/replace/credentials')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  replaceCredentials(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceCredentialsDto,
    @Req() req: RequestWithUser,
  ) {
    return this.replacementService.replaceCredentials(id, dto, req.companyId!);
  }

  @Post(':id/replace/paid')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  replacePaid(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplacePaidDto,
    @Req() req: RequestWithUser,
  ) {
    return this.replacementService.replacePaid(id, dto, req.companyId!);
  }

  @Post(':id/replace/inventory')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  replaceFromInventory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplaceFromInventoryDto,
    @Req() req: RequestWithUser,
  ) {
    return this.replacementService.replaceFromInventory(
      id,
      dto,
      req.companyId!,
    );
  }

  @Post(':id/add-profile')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  addProfile(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.profilesService.addProfile(id, req.companyId!);
  }

  @Post(':id/remove-profile')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  removeProfile(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.profilesService.removeProfile(id, req.companyId!);
  }

  @Post(':id/inactivate')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  inactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.profilesService.inactivate(id, req.companyId!);
  }

  @Post(':id/reactivate')
  @RequirePermissions('STREAMING_ACCOUNTS:UPDATE')
  reactivate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.profilesService.reactivate(id, req.companyId!);
  }

  @Post(':id/empty-all')
  @RequirePermissions('STREAMING_SALES:UPDATE')
  emptyAll(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.refundService.emptyAll(id, req.companyId!);
  }
}

// src/campaigns/campaigns.controller.ts
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
import { CompanyScopeGuard } from '../common/guards/company-scope.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignStatusDto } from './dto/update-campaign-status.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { AddContactsDto } from './dto/add-contacts.dto';
import { SendContactsDto } from './dto/send-contacts.dto';
import type { RequestWithUser } from '../common/types/request-with-user.type';

@Controller('campaigns')
@UseGuards(CompanyScopeGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  @RequirePermissions('CUSTOMERS:READ')
  findAll(@Req() req: RequestWithUser) {
    return this.campaignsService.findAll(req.companyId!);
  }

  @Get(':id')
  @RequirePermissions('CUSTOMERS:READ')
  findOne(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.campaignsService.findOne(id, req.companyId!);
  }

  @Post()
  @RequirePermissions('CUSTOMERS:CREATE')
  create(@Body() dto: CreateCampaignDto, @Req() req: RequestWithUser) {
    return this.campaignsService.create(dto, req.companyId!);
  }

  @Patch(':id')
  @RequirePermissions('CUSTOMERS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCampaignDto,
    @Req() req: RequestWithUser,
  ) {
    return this.campaignsService.update(id, dto, req.companyId!);
  }

  @Delete(':id')
  @RequirePermissions('CUSTOMERS:DELETE')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithUser) {
    return this.campaignsService.remove(id, req.companyId!);
  }

  @Get(':id/contacts')
  @RequirePermissions('CUSTOMERS:READ')
  getContacts(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.campaignsService.getContacts(id, req.companyId!);
  }

  @Post(':id/contacts')
  @RequirePermissions('CUSTOMERS:UPDATE')
  addContacts(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddContactsDto,
    @Req() req: RequestWithUser,
  ) {
    return this.campaignsService.addContacts(id, dto, req.companyId!);
  }

  @Patch(':id/status')
  @RequirePermissions('CUSTOMERS:UPDATE')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCampaignStatusDto,
    @Req() req: RequestWithUser,
  ) {
    return this.campaignsService.updateStatus(id, dto.status, req.companyId!);
  }

  @Delete(':id/contacts/:customerId')
  @RequirePermissions('CUSTOMERS:UPDATE')
  removeContact(
    @Param('id', ParseIntPipe) id: number,
    @Param('customerId', ParseIntPipe) customerId: number,
    @Req() req: RequestWithUser,
  ) {
    return this.campaignsService.removeContact(id, customerId, req.companyId!);
  }

  @Post(':id/send')
  @RequirePermissions('CUSTOMERS:UPDATE')
  sendContacts(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendContactsDto,
    @Req() req: RequestWithUser,
  ) {
    return this.campaignsService.sendContacts(id, dto, req.companyId!);
  }
}

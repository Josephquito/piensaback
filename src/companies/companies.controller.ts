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
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { AssignCompanyEmployeesDto } from './dto/assign-employee.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller('companies')
@UseGuards(JwtAuthGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // =========================
  // CRUD
  // =========================

  @Post()
  @RequirePermissions('COMPANIES:CREATE')
  create(@Body() dto: CreateCompanyDto, @Req() req: { user: ReqUser }) {
    return this.companiesService.create(dto, req.user);
  }

  @Get()
  @RequirePermissions('COMPANIES:READ')
  findAll(@Req() req: { user: ReqUser }) {
    return this.companiesService.findAllVisible(req.user);
  }

  @Get(':id')
  @RequirePermissions('COMPANIES:READ')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser },
  ) {
    return this.companiesService.findOneVisible(id, req.user);
  }

  @Patch(':id')
  @RequirePermissions('COMPANIES:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
    @Req() req: { user: ReqUser },
  ) {
    return this.companiesService.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('COMPANIES:DELETE')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: ReqUser }) {
    return this.companiesService.remove(id, req.user);
  }

  // =========================
  // MEMBERS
  // =========================

  @Get(':id/users')
  @RequirePermissions('COMPANIES-USERS:READ')
  listMembers(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser },
  ) {
    return this.companiesService.listMembers(id, req.user);
  }

  @Post(':id/users')
  @RequirePermissions('COMPANIES-USERS:UPDATE')
  assignEmployees(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignCompanyEmployeesDto,
    @Req() req: { user: ReqUser },
  ) {
    return this.companiesService.assignEmployees(id, dto.userIds, req.user);
  }

  @Delete(':id/users')
  @RequirePermissions('COMPANIES-USERS:UPDATE')
  unassignEmployees(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignCompanyEmployeesDto,
    @Req() req: { user: ReqUser },
  ) {
    return this.companiesService.unassignEmployees(id, dto.userIds, req.user);
  }
}

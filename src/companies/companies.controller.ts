import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { AssignEmployeeDto } from './dto/assign-employee.dto';
import express from 'express';

@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private companies: CompaniesService) {}

  @Post()
  create(@Body() dto: CreateCompanyDto, @Req() req: express.Request) {
    return this.companies.create(dto, req.user as any);
  }

  @Get()
  findMine(@Req() req: express.Request) {
    return this.companies.findMine(req.user as any);
  }

  @Post(':companyId/employees')
  assignEmployee(
    @Param('companyId') companyId: number,
    @Body() dto: AssignEmployeeDto,
    @Req() req: express.Request,
  ) {
    return this.companies.assignEmployee(companyId, dto, req.user as any);
  }

  @Get(':companyId/employees')
  listEmployees(
    @Param('companyId') companyId: number,
    @Req() req: express.Request,
  ) {
    return this.companies.listCompanyEmployees(companyId, req.user as any);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import express from 'express';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto, @Req() req: express.Request) {
    return this.users.create(dto, req.user as any);
  }

  @Get()
  findAll(@Req() req: express.Request) {
    return this.users.findAll(req.user as any);
  }

  @Get(':id')
  findOne(@Param('id') id: number, @Req() req: express.Request) {
    return this.users.findOne(id, req.user as any);
  }

  @Patch(':id')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: express.Request,
  ) {
    return this.users.update(id, dto, req.user as any);
  }

  @Delete(':id')
  remove(@Param('id') id: number, @Req() req: express.Request) {
    return this.users.remove(id, req.user as any);
  }
}

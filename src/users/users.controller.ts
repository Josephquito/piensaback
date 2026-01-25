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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('USERS:CREATE')
  create(@Body() dto: CreateUserDto, @Req() req: { user: ReqUser }) {
    return this.usersService.create(dto, req.user);
  }

  @Get()
  @RequirePermissions('USERS:READ')
  findAll(@Req() req: { user: ReqUser }) {
    return this.usersService.findAll(req.user);
  }

  // ✅ tu endpoint de siempre
  @Get('me')
  me(@Req() req: { user: ReqUser }) {
    return this.usersService.findOne(req.user.id, req.user);
  }

  @Get(':id')
  @RequirePermissions('USERS:READ')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: ReqUser },
  ) {
    return this.usersService.findOne(id, req.user);
  }

  @Patch(':id')
  @RequirePermissions('USERS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Req() req: { user: ReqUser },
  ) {
    return this.usersService.update(id, dto, req.user);
  }

  @Delete(':id')
  @RequirePermissions('USERS:DELETE')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: { user: ReqUser }) {
    return this.usersService.remove(id, req.user);
  }
}

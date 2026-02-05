import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';
import { MutateUserPermissionsDto } from './dto/mutate-user-permissions.dto';

type ReqUser = {
  id: number;
  email: string;
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
  permissions: string[];
};

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  // -------- Permissions catalog --------
  @Get('permissions')
  @RequirePermissions('PERMISSIONS:READ')
  findAll() {
    return this.permissions.findAll();
  }

  @Post('permissions')
  @RequirePermissions('PERMISSIONS:CREATE')
  create(@Body() dto: CreatePermissionDto, @Req() req: { user: ReqUser }) {
    return this.permissions.create(dto, req.user);
  }

  // -------- User permissions --------
  @Get('users/:userId/permissions')
  @RequirePermissions('PERMISSIONS-USERS:READ')
  listUserPermissions(@Param('userId', ParseIntPipe) userId: number) {
    return this.permissions.listUserPermissions(userId);
  }

  @Post('users/:userId/permissions/set')
  @RequirePermissions('PERMISSIONS-USERS:UPDATE')
  setUserPermissions(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: SetUserPermissionsDto,
    @Req() req: { user: ReqUser },
  ) {
    return this.permissions.setUserPermissions(userId, dto, req.user);
  }

  @Post('users/:userId/permissions/add')
  @RequirePermissions('PERMISSIONS-USERS:UPDATE')
  addUserPermissions(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: MutateUserPermissionsDto,
    @Req() req: { user: ReqUser },
  ) {
    return this.permissions.addUserPermissions(userId, dto, req.user);
  }

  @Post('users/:userId/permissions/remove')
  @RequirePermissions('PERMISSIONS-USERS:UPDATE')
  removeUserPermissions(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: MutateUserPermissionsDto,
    @Req() req: { user: ReqUser },
  ) {
    return this.permissions.removeUserPermissions(userId, dto, req.user);
  }
}

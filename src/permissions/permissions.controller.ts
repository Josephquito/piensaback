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
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUserJwt } from '../common/types/current-user-jwt.type';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionIdsDto } from './dto/permission-ids.dto';
import { SetUserPermissionsDto } from './dto/set-user-permissions.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  // -------- Catálogo --------

  @Get('permissions')
  @RequirePermissions('PERMISSIONS:READ')
  findAll() {
    return this.permissions.findAll();
  }

  @Get('permissions/:id')
  @RequirePermissions('PERMISSIONS:READ')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.permissions.findOne(id);
  }

  @Post('permissions')
  @RequirePermissions('PERMISSIONS:CREATE')
  create(
    @Body() dto: CreatePermissionDto,
    @Req() req: { user: CurrentUserJwt },
  ) {
    return this.permissions.create(dto, req.user);
  }

  @Patch('permissions/:id')
  @RequirePermissions('PERMISSIONS:UPDATE')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePermissionDto,
    @Req() req: { user: CurrentUserJwt },
  ) {
    return this.permissions.update(id, dto, req.user);
  }

  @Delete('permissions/:id')
  @RequirePermissions('PERMISSIONS:DELETE')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user: CurrentUserJwt },
  ) {
    return this.permissions.remove(id, req.user);
  }

  // -------- Permisos por usuario --------

  @Get('users/:userId/permissions')
  @RequirePermissions('PERMISSIONS-USERS:READ')
  listUserPermissions(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: { user: CurrentUserJwt },
  ) {
    return this.permissions.listUserPermissions(userId, req.user);
  }

  @Post('users/:userId/permissions/set')
  @RequirePermissions('PERMISSIONS-USERS:UPDATE')
  setUserPermissions(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: SetUserPermissionsDto,
    @Req() req: { user: CurrentUserJwt },
  ) {
    return this.permissions.setUserPermissions(userId, dto, req.user);
  }

  @Post('users/:userId/permissions/add')
  @RequirePermissions('PERMISSIONS-USERS:UPDATE')
  addUserPermissions(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: PermissionIdsDto,
    @Req() req: { user: CurrentUserJwt },
  ) {
    return this.permissions.addUserPermissions(userId, dto, req.user);
  }

  @Delete('users/:userId/permissions/remove')
  @RequirePermissions('PERMISSIONS-USERS:UPDATE')
  removeUserPermissions(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: PermissionIdsDto,
    @Req() req: { user: CurrentUserJwt },
  ) {
    return this.permissions.removeUserPermissions(userId, dto, req.user);
  }
}

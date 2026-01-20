import { IsOptional, IsString, MinLength, IsEnum } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  // Solo lo permitiremos si es el creador o SUPERADMIN/ADMIN (ver service)
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

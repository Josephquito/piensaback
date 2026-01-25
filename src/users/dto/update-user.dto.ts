import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  nombre?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @MinLength(6)
  password?: string;

  // Solo creator puede cambiar status (según tu service)
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

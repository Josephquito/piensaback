import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';
import { PermissionAction, PermissionResource } from '@prisma/client';

export class UpdatePermissionDto {
  @IsOptional()
  @IsEnum(PermissionResource)
  resource?: PermissionResource;

  @IsOptional()
  @IsEnum(PermissionAction)
  action?: PermissionAction;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  group?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

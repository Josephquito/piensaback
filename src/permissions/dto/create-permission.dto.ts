import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsInt,
  Min,
} from 'class-validator';
import { PermissionAction, PermissionResource } from '@prisma/client';

export class CreatePermissionDto {
  @IsEnum(PermissionResource)
  resource: PermissionResource;

  @IsEnum(PermissionAction)
  action: PermissionAction;

  @IsString()
  @MaxLength(120)
  key: string; // ej: "SUPPLIERS:READ"

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

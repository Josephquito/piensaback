import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { StreamingAccountStatus } from '@prisma/client';

export class UpdateStreamingAccountDto {
  @IsOptional()
  @IsInt()
  platformId?: number;

  @IsOptional()
  @IsInt()
  supplierId?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  profilesTotal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number; // ← nuevo

  @IsOptional()
  @IsString()
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  cutoffDate?: string;

  @IsOptional()
  @IsString()
  totalCost?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(StreamingAccountStatus) // ← usar enum de Prisma
  status?: StreamingAccountStatus;
}

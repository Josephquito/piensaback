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
  durationDays?: number;

  @IsOptional()
  @IsString()
  purchaseDate?: string;

  // cutoffDate eliminado — se deriva desde purchaseDate + durationDays
  // totalCost eliminado — solo por CostCorrectionService
  // profilesTotal eliminado — solo por ProfilesService

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(StreamingAccountStatus)
  status?: StreamingAccountStatus;
}

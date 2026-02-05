import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

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
  @IsString()
  status?: 'ACTIVE' | 'INACTIVE';
}

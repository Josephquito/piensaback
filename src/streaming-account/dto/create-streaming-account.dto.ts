import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateStreamingAccountDto {
  @IsInt()
  platformId: number;

  @IsInt()
  supplierId: number;

  @IsString()
  @MinLength(3)
  email: string;

  @IsString()
  @MinLength(1)
  password: string; // plano

  @IsInt()
  @Min(1)
  profilesTotal: number;

  @IsString()
  purchaseDate: string; // ISO string

  @IsString()
  cutoffDate: string; // ISO string

  @IsString()
  totalCost: string; // decimal como string

  @IsOptional()
  @IsString()
  notes?: string;
}

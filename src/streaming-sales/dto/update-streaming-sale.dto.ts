import { IsInt, IsOptional, IsString, Min, IsISO8601 } from 'class-validator';

export class UpdateStreamingSaleDto {
  @IsOptional()
  @IsInt()
  customerId?: number;

  @IsOptional()
  @IsString()
  salePrice?: string;

  @IsOptional()
  @IsISO8601()
  saleDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  daysAssigned?: number;

  @IsOptional()
  @IsString()
  notes?: string | null; // ← agrega | null y quita MinLength
}

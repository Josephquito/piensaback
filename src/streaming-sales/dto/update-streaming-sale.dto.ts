import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  IsISO8601,
} from 'class-validator';

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
  @MinLength(1)
  notes?: string;
}

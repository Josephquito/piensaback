import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RenewStreamingSaleDto {
  @IsString()
  saleDate: string;

  @IsInt()
  @Min(1)
  daysAssigned: number;

  @IsString()
  salePrice: string;

  @IsOptional()
  @IsInt()
  customerId?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

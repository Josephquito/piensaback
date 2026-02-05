import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateStreamingSaleDto {
  @IsInt()
  accountId: number;

  @IsInt()
  profileId: number;

  @IsInt()
  customerId: number;

  @IsString()
  salePrice: string; // decimal string

  @IsString()
  saleDate: string; // ISO string

  @IsInt()
  @Min(1)
  daysAssigned: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  notes?: string;
}

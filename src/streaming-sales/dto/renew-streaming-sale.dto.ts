import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RenewStreamingSaleDto {
  @IsString()
  saleDate: string; // nueva fecha de inicio

  @IsInt()
  @Min(1)
  daysAssigned: number; // días de la renovación

  @IsString()
  salePrice: string; // precio de la renovación

  @IsOptional()
  @IsInt()
  customerId?: number; // permite cambiar cliente al renovar

  @IsOptional()
  @IsString()
  notes?: string;
}

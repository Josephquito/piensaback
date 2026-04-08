import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class SupplierTransferDto {
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;
}

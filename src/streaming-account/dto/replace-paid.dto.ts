import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentMode } from '@prisma/client';

export class ReplacePaidDto {
  @IsString()
  @MinLength(3)
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsString()
  purchaseDate: string;

  @IsInt()
  @Min(1)
  durationDays: number;

  @IsString()
  @MinLength(1)
  totalCost: string;

  @IsInt()
  supplierId: number;

  @IsEnum(PaymentMode)
  paymentMode: PaymentMode;

  @IsOptional()
  @IsString()
  cashAmount?: string;

  @IsOptional()
  @IsString()
  creditAmount?: string;

  @IsOptional()
  @IsString()
  balanceAmount?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

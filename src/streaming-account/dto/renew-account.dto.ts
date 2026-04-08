import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentMode } from '@prisma/client';

export class RenewAccountDto {
  @IsString()
  purchaseDate: string;

  @IsInt()
  @Min(1)
  durationDays: number;

  @IsString()
  @MinLength(1)
  totalCost: string;

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
}

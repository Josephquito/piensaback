import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaymentMode } from '@prisma/client';

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
  password: string;

  @IsInt()
  @Min(1)
  profilesTotal: number;

  @IsInt()
  @Min(1)
  durationDays: number;

  @IsString()
  purchaseDate: string;

  @IsString()
  cutoffDate: string;

  @IsString()
  totalCost: string;

  @IsOptional()
  @IsString()
  notes?: string;

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

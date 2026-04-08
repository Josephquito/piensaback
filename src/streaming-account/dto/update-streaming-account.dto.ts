import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentMode, StreamingAccountStatus } from '@prisma/client';

export class UpdateStreamingAccountDto {
  @IsOptional()
  @IsInt()
  platformId?: number;

  @IsOptional()
  @IsInt()
  supplierId?: number;

  @IsOptional()
  @IsString()
  @MinLength(3)
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;

  @IsOptional()
  @IsString()
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(StreamingAccountStatus)
  status?: StreamingAccountStatus;

  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

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

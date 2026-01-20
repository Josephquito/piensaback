import {
  IsEnum,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
} from 'class-validator';
import { ProductType } from '@prisma/client';

export class CreateProductDto {
  @IsEnum(ProductType)
  type: ProductType; // PLATFORM | RECHARGE | OTHER

  @IsNotEmpty()
  name: string;

  @IsOptional()
  description?: string;

  // Decimal(12,2) -> enviar como string "9.99"
  @IsOptional()
  @IsNumberString()
  basePdv?: string;
}

import {
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class CreateSupplierInlineDto {
  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  contact: string;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  productId?: number;

  // permitir null para quitar supplier
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  supplierId?: number | null;

  // opcional: también permitir crear supplier nuevo en update
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateSupplierInlineDto)
  supplier?: CreateSupplierInlineDto;

  @IsOptional()
  @IsEmail()
  emailLogin?: string;

  @IsOptional()
  @IsNotEmpty()
  passwordLogin?: string;

  @IsOptional()
  @IsDateString()
  purchasedAt?: string;

  @IsOptional()
  @IsDateString()
  cutOffAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  profilesCount?: number;

  @IsOptional()
  @IsNumberString()
  purchaseTotalCost?: string;
}

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
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

export class CreateAccountDto {
  @IsInt()
  @Min(1)
  productId: number;

  // O envías supplierId...
  @IsOptional()
  @ValidateIf((o) => o.supplier === undefined)
  @IsInt()
  @Min(1)
  supplierId?: number;

  // ...o envías supplier nuevo para crear
  @IsOptional()
  @ValidateIf((o) => o.supplierId === undefined)
  @ValidateNested()
  @Type(() => CreateSupplierInlineDto)
  supplier?: CreateSupplierInlineDto;

  @IsEmail()
  emailLogin: string;

  @IsNotEmpty()
  passwordLogin: string;

  @IsDateString()
  purchasedAt: string;

  @IsDateString()
  cutOffAt: string;

  @IsInt()
  @Min(1)
  profilesCount: number;

  @IsNumberString()
  purchaseTotalCost: string;
}

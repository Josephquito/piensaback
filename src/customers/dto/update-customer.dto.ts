import {
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CustomerSource } from './create-customer.dto';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(7)
  contact?: string;

  @IsOptional()
  @IsEnum(CustomerSource)
  source?: CustomerSource;

  @ValidateIf((o) => o.source === CustomerSource.OTHER)
  @IsOptional() // ← agrega este
  @IsString()
  @MinLength(2)
  sourceNote?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  balance?: string;
}

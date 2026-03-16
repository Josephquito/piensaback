import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { CustomerSource } from './create-customer.dto';

export class ImportCustomerRowDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  name: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(7)
  contact: string;

  @IsOptional()
  @IsEnum(CustomerSource)
  source?: CustomerSource;

  @ValidateIf((o) => o.source === CustomerSource.OTHER)
  @IsNotEmpty()
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

import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  contact?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  source?: string; // proviene
}

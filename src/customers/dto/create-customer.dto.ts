import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(2)
  contact: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  source?: string; // proviene
}

import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(7)
  contact: string; // número WhatsApp

  @IsOptional()
  @IsString()
  notes?: string;
}

import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  contact?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

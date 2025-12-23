import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  contact!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

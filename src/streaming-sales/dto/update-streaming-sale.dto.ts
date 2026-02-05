import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateStreamingSaleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  notes?: string;

  // si quieres permitir cancelación:
  @IsOptional()
  @IsString()
  status?: 'ACTIVE' | 'CANCELED';
}

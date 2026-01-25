import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CompanyStatus } from '@prisma/client';

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus; // si quieres permitir INACTIVE/ACTIVE, NO PENDING_DELETE (lo controlamos en service)
}

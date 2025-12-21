import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  name: string; // SUPERADMIN, ADMIN, EMPLOYEE

  @IsEnum(['GLOBAL', 'COMPANY'] as const)
  scope: 'GLOBAL' | 'COMPANY';

  @IsOptional()
  @IsString()
  description?: string;
}

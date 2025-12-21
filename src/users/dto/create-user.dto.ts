import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  nombre: string;

  @IsString()
  phone: string;

  @IsString()
  role: 'SUPERADMIN' | 'ADMIN' | 'EMPLOYEE';
}

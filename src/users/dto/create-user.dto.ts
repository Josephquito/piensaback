import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  phone: string;

  @IsString()
  nombre: string;

  @MinLength(6)
  password: string;

  @IsEnum(['ADMIN', 'EMPLOYEE'] as const)
  baseRole: 'ADMIN' | 'EMPLOYEE';
}

import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @MinLength(6)
  password: string;

  /**
   * Puede ser:
   * - "ADMIN" / "EMPLOYEE" (roles base)
   * - "AYUDANTESUPERADMIN", "VENDEDOR", etc (roles custom)
   */
  @IsString()
  @IsNotEmpty()
  role: string;
}

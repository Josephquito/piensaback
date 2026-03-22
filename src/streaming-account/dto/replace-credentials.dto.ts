// dto/replace-credentials.dto.ts
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ReplaceCredentialsDto {
  @IsString()
  @MinLength(3)
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsString()
  note?: string;
}

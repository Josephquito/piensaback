// dto/replace-paid.dto.ts
import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ReplacePaidDto {
  @IsString()
  @MinLength(3)
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsString()
  purchaseDate: string;

  @IsInt()
  @Min(1)
  durationDays: number;

  @IsString()
  @MinLength(1)
  totalCost: string;

  @IsOptional()
  @IsString()
  note?: string;
}

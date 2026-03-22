// dto/renew-account.dto.ts
import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class RenewAccountDto {
  @IsString()
  purchaseDate: string;

  @IsString()
  cutoffDate: string;

  @IsInt()
  @Min(1)
  durationDays: number;

  @IsString()
  @MinLength(1)
  totalCost: string;
}

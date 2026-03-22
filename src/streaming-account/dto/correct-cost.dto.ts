// dto/correct-cost.dto.ts
import { IsString, MinLength } from 'class-validator';

export class CorrectCostDto {
  @IsString()
  @MinLength(1)
  totalCost: string;
}

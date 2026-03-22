// dto/replace-from-inventory.dto.ts
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ReplaceFromInventoryDto {
  @IsInt()
  @Min(1)
  replacementAccountId: number;

  @IsOptional()
  @IsString()
  note?: string;
}

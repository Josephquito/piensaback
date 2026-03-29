// dto/transfer-profile.dto.ts
import { IsInt, Min } from 'class-validator';

export class TransferProfileDto {
  @IsInt()
  @Min(1)
  targetAccountId: number; // cuenta destino
}

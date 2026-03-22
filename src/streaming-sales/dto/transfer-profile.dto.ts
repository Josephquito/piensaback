import { IsInt, Min } from 'class-validator';

export class TransferProfileDto {
  @IsInt()
  @Min(1)
  targetAccountId: number;

  @IsInt()
  @Min(1)
  targetProfileId: number;
}

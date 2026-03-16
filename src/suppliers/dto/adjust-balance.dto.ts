import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum BalanceMovementType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
}

export class AdjustBalanceDto {
  @IsEnum(BalanceMovementType)
  type: BalanceMovementType;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

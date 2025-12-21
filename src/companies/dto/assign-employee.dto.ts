import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class AssignEmployeeDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  userId: number;
}

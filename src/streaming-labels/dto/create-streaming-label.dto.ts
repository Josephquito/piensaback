import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsInt,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStreamingLabelDto {
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  platformId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsString()
  @IsNotEmpty()
  color: string;
}

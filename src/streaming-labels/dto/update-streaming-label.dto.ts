import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class UpdateStreamingLabelDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  color?: string;
}

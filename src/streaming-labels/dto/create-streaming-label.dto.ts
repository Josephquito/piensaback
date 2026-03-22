import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateStreamingLabelDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @IsString()
  @IsNotEmpty()
  color: string;
}

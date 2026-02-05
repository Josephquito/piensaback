// dto/create-streaming-platform.dto.ts
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStreamingPlatformDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

// create-campaign.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { CampaignSegment } from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(CampaignSegment)
  @IsOptional()
  segment?: CampaignSegment;
}

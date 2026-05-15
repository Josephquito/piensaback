// update-campaign.dto.ts
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { CampaignSegment } from '@prisma/client';

export class UpdateCampaignDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(CampaignSegment)
  @IsOptional()
  segment?: CampaignSegment;
}

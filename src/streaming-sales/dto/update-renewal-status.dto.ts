import { IsEnum } from 'class-validator';
import { RenewalMessageStatus } from '@prisma/client';

export class UpdateRenewalStatusDto {
  @IsEnum(RenewalMessageStatus)
  renewalStatus: RenewalMessageStatus;
}

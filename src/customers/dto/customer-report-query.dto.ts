import { IsOptional, IsEnum } from 'class-validator';
import { SaleStatus } from '@prisma/client';

export class CustomerReportQueryDto {
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;
}

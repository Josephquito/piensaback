import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export enum ReportSaleStatus {
  ACTIVE = 'ACTIVE',
  CANCELED = 'CANCELED',
  ALL = 'ALL',
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class StreamingSalesReportQueryDto {
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'day debe ser YYYY-MM-DD' })
  day?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'from debe ser YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_REGEX, { message: 'to debe ser YYYY-MM-DD' })
  to?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  platformId?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  customerId?: number;

  @IsOptional()
  @IsString()
  customerSearch?: string;

  @IsOptional()
  @IsEnum(ReportSaleStatus)
  status?: ReportSaleStatus;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 1 : Number(value)))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? 50 : Number(value)))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}

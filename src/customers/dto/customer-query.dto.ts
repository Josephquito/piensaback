import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { SaleStatus } from '@prisma/client';
import { CustomerSource } from '@prisma/client';

// ── Status derivado (calculado en runtime, no en DB) ──────────────────────────
export enum CustomerStatusFilter {
  PROSPECT = 'PROSPECT', // sin ventas
  ACTIVE = 'ACTIVE', // tiene al menos 1 venta ACTIVE
  INACTIVE = 'INACTIVE', // tuvo ventas pero ninguna activa
}

// ── Campos por los que se puede ordenar ──────────────────────────────────────
export enum CustomerSortBy {
  NAME = 'name',
  LAST_PURCHASE_AT = 'lastPurchaseAt',
  CREATED_AT = 'createdAt',
  BALANCE = 'balance',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

// ── DTO principal ─────────────────────────────────────────────────────────────
export class CustomerQueryDto {
  /** Búsqueda full-text por nombre o contact (teléfono/email) */
  @IsOptional()
  @IsString()
  search?: string;

  /** Filtro por status derivado */
  @IsOptional()
  @IsEnum(CustomerStatusFilter)
  status?: CustomerStatusFilter;

  /** Filtro por origen (valor exacto del campo source) */
  @IsOptional()
  @IsEnum(CustomerSource)
  source?: CustomerSource;

  /** Filtro por saleStatus para el historial */
  @IsOptional()
  @IsEnum(SaleStatus)
  saleStatus?: SaleStatus;

  /** Ordenar por campo */
  @IsOptional()
  @IsEnum(CustomerSortBy)
  sortBy?: CustomerSortBy = CustomerSortBy.NAME;

  /** Dirección del orden */
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.ASC;

  /** Paginación – página actual (1-based) */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  /** Paginación – registros por página */
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}

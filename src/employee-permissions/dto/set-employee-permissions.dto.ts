import { IsArray, IsString, Matches } from 'class-validator';

export class SetEmployeePermissionsDto {
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[A-Z_]+:(CREATE|READ|UPDATE|DELETE)$/, {
    each: true,
    message:
      'Cada permiso debe tener formato RESOURCE:ACTION (ej: SUPPLIERS:READ)',
  })
  keys!: string[];
}

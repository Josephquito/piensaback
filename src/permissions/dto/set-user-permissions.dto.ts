import { IsArray, IsInt, Min } from 'class-validator';

export class SetUserPermissionsDto {
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  permissionIds: number[];
}

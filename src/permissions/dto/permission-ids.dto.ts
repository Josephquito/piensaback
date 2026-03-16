import { ArrayNotEmpty, IsArray, IsInt, Min } from 'class-validator';

export class PermissionIdsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  permissionIds: number[];
}

import { ArrayNotEmpty, IsArray, IsInt, Min } from 'class-validator';

export class MutateUserPermissionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  permissionIds: number[];
}

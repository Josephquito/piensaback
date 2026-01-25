import { IsInt, Min } from 'class-validator';

export class AssignCompanyUserDto {
  @IsInt()
  @Min(1)
  userId: number;

  @IsInt()
  @Min(1)
  roleId: number; // Role (scope COMPANY normalmente)
}

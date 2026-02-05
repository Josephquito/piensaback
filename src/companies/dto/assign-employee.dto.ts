// dto/assign-employee.dto.ts
import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class AssignCompanyEmployeesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  userIds: number[];
}

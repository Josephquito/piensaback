import { IsArray, IsInt, ArrayMinSize } from 'class-validator';

export class AddContactsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  customerIds: number[];
}

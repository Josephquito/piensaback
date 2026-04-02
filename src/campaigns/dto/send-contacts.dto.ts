import { IsArray, IsInt, ArrayMinSize } from 'class-validator';

export class SendContactsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  campaignContactIds: number[];
}

// src/customers/dto/from-bot-customer.dto.ts
import { IsString, IsNotEmpty } from 'class-validator';

export class FromBotCustomerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  contact: string;
}

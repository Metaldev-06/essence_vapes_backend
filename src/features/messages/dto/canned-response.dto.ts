import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { InboxAddress } from '../enums/inbox-address.enum';

export class CreateCannedResponseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;

  @IsOptional()
  @IsEnum(InboxAddress)
  inbox?: InboxAddress | null;
}

export class UpdateCannedResponseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body?: string;

  @IsOptional()
  @IsEnum(InboxAddress)
  inbox?: InboxAddress | null;
}

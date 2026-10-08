import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/, {
    message:
      'password debe tener al menos una mayúscula, una minúscula y un número',
  })
  password!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(80)
  fullName!: string;
}

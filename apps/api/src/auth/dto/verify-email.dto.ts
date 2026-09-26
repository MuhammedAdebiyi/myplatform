import { IsString, Length, Matches } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be a 6-digit number' })
  code!: string;
}

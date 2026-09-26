import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  // base64url of 32 random bytes = 43 chars; validate shape so junk input
  // 400s at the DTO layer instead of touching the DB.
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{40,100}$/, {
    message: 'token must be a valid reset token',
  })
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}

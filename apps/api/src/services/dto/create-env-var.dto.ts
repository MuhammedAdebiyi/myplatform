import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateEnvVarDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'key must match /^[A-Za-z_][A-Za-z0-9_]*$/',
  })
  key!: string;

  @IsString()
  @MinLength(0)
  @MaxLength(8192)
  value!: string;

  @IsOptional()
  @IsBoolean()
  isSecret?: boolean;
}

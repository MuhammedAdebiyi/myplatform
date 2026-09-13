import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase alphanumeric with dashes' })
  slug!: string;
}

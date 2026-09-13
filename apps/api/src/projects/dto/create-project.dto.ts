import { IsString, Matches, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase alphanumeric with dashes' })
  slug!: string;
}

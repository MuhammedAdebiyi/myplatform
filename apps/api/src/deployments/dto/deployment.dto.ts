import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateDeploymentDto {
  /** Optional commit SHA; defaults to the connected repo's default branch HEAD. */
  @IsString()
  @IsOptional()
  @Matches(/^[0-9a-f]{7,40}$/i, { message: 'commitSha must be a git SHA (7-40 hex chars)' })
  commitSha?: string;

  /** Optional branch override; defaults to the service's configured branch. */
  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9._\-/]+$/, { message: 'invalid branch name' })
  branch?: string;
}

export class CreateDomainDto {
  @IsString()
  @MinLength(4)
  @MaxLength(253)
  @Matches(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, {
    message: 'hostname must be a valid lowercase domain name',
  })
  hostname!: string;
}

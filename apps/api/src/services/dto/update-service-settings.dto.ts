import { IsBoolean, IsOptional } from 'class-validator';

/** Partial service-settings update — only deploy-behavior toggles for now. */
export class UpdateServiceSettingsDto {
  @IsOptional()
  @IsBoolean()
  autoDeployOnConnect?: boolean;

  @IsOptional()
  @IsBoolean()
  deployPullRequests?: boolean;
}

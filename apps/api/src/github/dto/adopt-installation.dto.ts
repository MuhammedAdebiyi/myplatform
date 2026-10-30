import { IsInt } from 'class-validator';

export class AdoptInstallationDto {
  @IsInt()
  installationId!: number;
}

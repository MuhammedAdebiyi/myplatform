import { IsString, IsNotEmpty, IsInt } from 'class-validator';

export class CompleteInstallationDto {
  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsInt()
  installationId!: number;
}

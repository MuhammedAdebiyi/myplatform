import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ServiceType, DeploymentStrategy, RestartPolicy } from '@myplatform/shared';

export class CreateServiceDto {
  @IsString()
  name!: string;

  @IsEnum(ServiceType)
  type!: ServiceType;

  @IsString()
  @IsOptional()
  repoUrl?: string;

  @IsString()
  @IsOptional()
  branch?: string;

  @IsEnum(DeploymentStrategy)
  @IsOptional()
  deploymentStrategy?: DeploymentStrategy;

  @IsEnum(RestartPolicy)
  @IsOptional()
  restartPolicy?: RestartPolicy;
}

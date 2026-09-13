import { IsString, IsArray, IsOptional, MinLength, MaxLength, IsIn } from 'class-validator';
import { Permission } from '../../rbac/permissions.js';

const VALID_PERMISSIONS: string[] = Object.values(Permission);

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  permissions?: string[];

  @IsString()
  @IsOptional()
  expiresIn?: string;
}

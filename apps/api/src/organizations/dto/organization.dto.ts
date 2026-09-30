import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { OrgRole } from '@myplatform/database';

export class UpdateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @IsOptional()
  name?: string;
}

export class UpdateMemberRoleDto {
  @IsIn(Object.values(OrgRole), { message: 'role must be a valid OrgRole' })
  role!: OrgRole;
}

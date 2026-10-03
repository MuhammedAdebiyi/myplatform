import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class BranchMappingDto {
  @IsString()
  @IsNotEmpty()
  branch!: string;

  @IsIn(['PRODUCTION', 'PREVIEW'])
  target!: 'PRODUCTION' | 'PREVIEW';
}

export class SetBranchMappingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BranchMappingDto)
  mappings!: BranchMappingDto[];
}

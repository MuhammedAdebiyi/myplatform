import { IsString, IsNotEmpty } from 'class-validator';

export class ConnectServiceDto {
  @IsString()
  @IsNotEmpty()
  githubRepositoryId!: string;

  @IsString()
  @IsNotEmpty()
  branch!: string;
}

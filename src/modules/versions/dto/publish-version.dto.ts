import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class PublishVersionDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  dependencies?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  entryFile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  changelog?: string;
}

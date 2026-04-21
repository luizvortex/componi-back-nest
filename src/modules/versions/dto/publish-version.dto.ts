import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength, Validate } from 'class-validator';
import {
  COMPONENT_CODE_MAX_BYTES,
  DependenciesConstraint,
} from '../../components/dto/shared.validators';

export class PublishVersionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(COMPONENT_CODE_MAX_BYTES)
  code!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @Validate(DependenciesConstraint)
  dependencies?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entryFile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  changelog?: string;
}

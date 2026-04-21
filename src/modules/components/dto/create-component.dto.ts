import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
} from 'class-validator';
import type { ComponentFramework } from '../../../database/entities/component.entity';
import {
  COMPONENT_CODE_MAX_BYTES,
  DependenciesConstraint,
  MAX_TAG_SLUGS,
} from './shared.validators';

const FRAMEWORKS: ComponentFramework[] = ['react', 'vue', 'svelte', 'solid', 'angular', 'other'];

export class CreateComponentDto {
  @ApiProperty({ example: 'Floating Action Carousel' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: FRAMEWORKS, default: 'react' })
  @IsIn(FRAMEWORKS)
  framework: ComponentFramework = 'react';

  @ApiPropertyOptional({ example: 'carousel' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiProperty({
    description: `Source code for the initial version (v1). Capped at ${COMPONENT_CODE_MAX_BYTES} bytes.`,
  })
  @IsString()
  @MaxLength(COMPONENT_CODE_MAX_BYTES)
  code!: string;

  @ApiPropertyOptional({
    description: 'Map of npm package → semver range. Up to 50 entries, 8KB total.',
    example: { 'framer-motion': '^11.0.0' },
  })
  @IsOptional()
  @IsObject()
  @Validate(DependenciesConstraint)
  dependencies?: Record<string, string>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ type: [String], maxItems: MAX_TAG_SLUGS })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tagSlugs?: string[];
}

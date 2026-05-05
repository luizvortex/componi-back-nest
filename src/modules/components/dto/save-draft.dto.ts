import { ApiPropertyOptional } from '@nestjs/swagger';
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

/**
 * All fields are optional — designed for auto-save from the inline editor.
 * Code is updated in-place on the current version (no new version is created).
 * Only works on components where isDraft = true; use the versions endpoint for
 * post-publish code iterations.
 */
export class SaveDraftDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ enum: FRAMEWORKS })
  @IsOptional()
  @IsIn(FRAMEWORKS)
  framework?: ComponentFramework;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @ApiPropertyOptional({
    description: `Updated source code. Overwrites the draft version in-place. Capped at ${COMPONENT_CODE_MAX_BYTES} bytes.`,
  })
  @IsOptional()
  @IsString()
  @MaxLength(COMPONENT_CODE_MAX_BYTES)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @Validate(DependenciesConstraint)
  dependencies?: Record<string, string>;

  @ApiPropertyOptional()
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

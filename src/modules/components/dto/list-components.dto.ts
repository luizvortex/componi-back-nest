import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import type { ComponentFramework } from '../../../database/entities/component.entity';

const FRAMEWORKS: ComponentFramework[] = ['react', 'vue', 'svelte', 'solid', 'angular', 'other'];
const SORTS = ['recent', 'popular', 'trending'] as const;
export type ComponentSort = (typeof SORTS)[number];

export class ListComponentsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: FRAMEWORKS })
  @IsOptional()
  @IsIn(FRAMEWORKS)
  framework?: ComponentFramework;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  authorUsername?: string;

  @ApiPropertyOptional({ enum: SORTS, default: 'recent' })
  @IsOptional()
  @IsIn(SORTS)
  sort: ComponentSort = 'recent';
}

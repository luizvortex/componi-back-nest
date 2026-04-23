import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import type {
  ReportAction,
  ReportStatus,
} from '../../../database/entities/report.entity';

const RESOLUTION_STATUSES: Exclude<ReportStatus, 'open' | 'reviewing'>[] = [
  'actioned',
  'dismissed',
];

const ACTIONS: ReportAction[] = [
  'none',
  'warned',
  'content_removed',
  'user_suspended',
  'user_banned',
];

export class ResolveReportDto {
  @ApiProperty({ enum: RESOLUTION_STATUSES })
  @IsEnum(RESOLUTION_STATUSES)
  status!: 'actioned' | 'dismissed';

  @ApiProperty({
    enum: ACTIONS,
    description:
      'What concrete action was taken. Must match a separate suspend/delete call if needed; this field is for the audit record.',
  })
  @IsEnum(ACTIONS)
  actionTaken!: ReportAction;

  @ApiProperty({
    description: 'Internal note explaining the decision. Required for audit.',
    minLength: 10,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  resolutionNote!: string;

  @ApiProperty({
    required: false,
    description: 'Optional public reason shown to the reporter (sanitized).',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  publicReason?: string;
}

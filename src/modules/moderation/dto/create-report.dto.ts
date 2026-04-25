import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import type {
  ReportReason,
  ReportTargetType,
} from '../../../database/entities/report.entity';

const TARGET_TYPES: ReportTargetType[] = ['component', 'comment', 'user'];
const REASONS: ReportReason[] = [
  'spam',
  'harassment',
  'malicious_code',
  'copyright',
  'nsfw',
  'impersonation',
  'other',
];

export class CreateReportDto {
  @ApiProperty({ enum: TARGET_TYPES })
  @IsEnum(TARGET_TYPES)
  targetType!: ReportTargetType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ enum: REASONS })
  @IsEnum(REASONS)
  reason!: ReportReason;

  @ApiProperty({
    required: false,
    description: 'Optional context for the moderator. Capped at 2000 chars.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
}

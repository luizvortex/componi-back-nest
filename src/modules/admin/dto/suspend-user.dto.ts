import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import type { UserRole } from '../../../common/types/auth-user.type';

export class SuspendUserDto {
  @ApiProperty({
    description:
      'Suspension duration in hours. Pass 0 for an indefinite (permanent) ban — admin only. Moderators are capped at 30 days = 720h server-side.',
    minimum: 0,
    maximum: 720 * 12, // 12 months absolute ceiling — anything longer should be a permanent ban
  })
  @IsInt()
  @Min(0)
  @Max(720 * 12)
  hours!: number;

  @ApiProperty({
    description:
      'Mandatory justification stored in audit_logs and surfaced to the suspended user.',
    minLength: 10,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;
}

export class PromoteRoleDto {
  @ApiProperty({
    enum: ['user', 'moderator', 'admin'] satisfies UserRole[],
    description: 'New role. Admin-only endpoint — guarded by @Roles("admin").',
  })
  @IsString()
  role!: UserRole;

  @ApiProperty({
    description: 'Why the role change was made. Required for audit.',
    minLength: 10,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;
}

export class DeleteContentDto {
  @ApiProperty({
    description: 'Reason for content removal. Stored in audit_logs.',
    minLength: 10,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  reason!: string;

  @ApiProperty({
    required: false,
    description: 'Optional reportId this action resolves (cross-link in audit metadata).',
  })
  @IsOptional()
  @IsString()
  reportId?: string;
}

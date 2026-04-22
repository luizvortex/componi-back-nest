import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBlockDto {
  @ApiProperty({
    required: false,
    description:
      'Private note visible only to the blocker ("why did I block this person?"). Never shown to the blocked user.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

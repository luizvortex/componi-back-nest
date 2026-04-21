import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';

export class SetThumbnailDto {
  /**
   * Public URL returned by Supabase Storage after the frontend uploaded
   * the screenshot. Strict origin validation happens server-side against
   * the configured Supabase project URL.
   */
  @ApiProperty()
  @IsString()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  thumbnailUrl!: string;
}

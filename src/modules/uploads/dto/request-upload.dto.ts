import { IsIn } from 'class-validator';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'] as const;
export type AllowedContentType = (typeof ALLOWED)[number];

export class RequestUploadDto {
  @IsIn([...ALLOWED])
  contentType!: AllowedContentType;
}

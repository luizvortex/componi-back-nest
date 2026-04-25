import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export interface SignedUpload {
  /** Pre-signed URL the client PUTs the file to. Expires in 2 minutes. */
  uploadUrl: string;
  /** Storage path (bucket-relative) — echo this back to setThumbnail. */
  path: string;
  /** Ready-to-use public URL once the upload lands. */
  publicUrl: string;
  /** Opaque token the upload URL requires; Supabase calls it the `token`. */
  token: string;
}

/**
 * Issues pre-signed upload URLs for Supabase Storage. The flow:
 *   1. Client POSTs /uploads/component-thumbnail with the content-type.
 *   2. We generate a one-time upload URL scoped to `{userId}/{uuid}.ext`.
 *   3. Client PUTs the image directly to Supabase — our API never touches
 *      the bytes, so a 10 MB upload doesn't hog the Node event loop.
 *   4. Client sends the returned `publicUrl` to PATCH /components/:id/thumbnail,
 *      which HEAD-checks it via the thumbnails queue.
 *
 * Path scoping by userId prevents one user from overwriting another's
 * uploads even if they guess the storage path.
 */
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly bucket: string;
  private readonly client: SupabaseClient;

  constructor(config: ConfigService) {
    const url = config.get<string>('supabase.url');
    const serviceKey = config.get<string>('supabase.serviceRoleKey');
    if (!url || !serviceKey) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for signed uploads',
      );
    }
    this.bucket = config.get<string>('supabase.storageBucket', 'component-thumbnails');
    this.client = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async createComponentThumbnailUpload(
    userId: string,
    contentType: string,
  ): Promise<SignedUpload> {
    const ext = this.extensionFor(contentType);
    const path = `${userId}/${randomUUID()}${ext}`;

    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(path);

    if (error || !data) {
      this.logger.error(`signed upload failed: ${error?.message ?? 'unknown'}`);
      throw new InternalServerErrorException('Could not create upload URL');
    }

    const publicUrl = this.client.storage.from(this.bucket).getPublicUrl(path)
      .data.publicUrl;

    return {
      uploadUrl: data.signedUrl,
      token: data.token,
      path: data.path,
      publicUrl,
    };
  }

  /**
   * We accept a narrow allowlist — the DTO layer already enforces the
   * content type, but we translate to an extension here so the stored
   * object has a recognisable suffix.
   */
  private extensionFor(contentType: string): string {
    switch (contentType) {
      case 'image/png':
        return '.png';
      case 'image/jpeg':
        return '.jpg';
      case 'image/webp':
        return '.webp';
      case 'image/avif':
        return '.avif';
      default:
        return '';
    }
  }
}

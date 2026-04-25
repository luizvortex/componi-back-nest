import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { RequestUploadDto } from './dto/request-upload.dto';
import { UploadsService } from './uploads.service';

@ApiTags('uploads')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * Returns a pre-signed URL the client uploads a component thumbnail
   * directly to. The API never sees the bytes. After the upload finishes
   * the client passes `publicUrl` to `PATCH /components/:id/thumbnail`.
   */
  @Post('component-thumbnail')
  request(@CurrentUser() user: AuthUser, @Body() dto: RequestUploadDto) {
    return this.uploads.createComponentThumbnailUpload(user.id, dto.contentType);
  }
}

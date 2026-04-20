import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { SocialService } from './social.service';

@ApiTags('social')
@ApiBearerAuth()
@Controller()
export class SocialController {
  constructor(private readonly service: SocialService) {}

  @Post('components/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  like(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.like(user.id, id);
  }

  @Delete('components/:id/like')
  @HttpCode(HttpStatus.NO_CONTENT)
  unlike(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.unlike(user.id, id);
  }

  @Post('components/:id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  favorite(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.favorite(user.id, id);
  }

  @Delete('components/:id/favorite')
  @HttpCode(HttpStatus.NO_CONTENT)
  unfavorite(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.unfavorite(user.id, id);
  }

  @Post('users/:id/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  follow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.follow(user.id, id);
  }

  @Delete('users/:id/follow')
  @HttpCode(HttpStatus.NO_CONTENT)
  unfollow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.service.unfollow(user.id, id);
  }
}

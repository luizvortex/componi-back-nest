import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { FeedService } from './feed.service';

@ApiTags('feed')
@ApiBearerAuth()
@Controller('feed')
export class FeedController {
  constructor(private readonly service: FeedService) {}

  @Get('following')
  forUser(@CurrentUser() user: AuthUser, @Query() query: PaginationDto) {
    return this.service.forUser(user.id, query);
  }

  @Public()
  @Get('trending')
  trending(@Query() query: PaginationDto) {
    return this.service.trending(query);
  }
}

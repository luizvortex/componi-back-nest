import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../../common/decorators/public.decorator';
import { TagsService } from './tags.service';

@ApiTags('tags')
@Controller('tags')
export class TagsController {
  constructor(private readonly service: TagsService) {}

  @Public()
  @Get()
  list(@Query('q') q?: string) {
    return q ? this.service.search(q) : this.service.listPopular();
  }
}

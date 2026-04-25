import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuth } from '../../common/decorators/optional-auth.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { AuthUser } from '../../common/types/auth-user.type';
import { SearchService } from './search.service';
import { SemanticSearchService } from './semantic-search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(
    private readonly service: SearchService,
    private readonly semantic: SemanticSearchService,
  ) {}

  @Public()
  @Get()
  search(@Query('q') q: string) {
    return this.service.searchAll(q ?? '');
  }

  /**
   * Vector-similarity search over component embeddings. @OptionalAuth
   * so the response can filter blocked authors when the caller is
   * logged in. Returns hits ordered by cosine distance ascending
   * (closer = more similar).
   */
  @OptionalAuth()
  @Get('semantic')
  semanticSearch(
    @CurrentUser() user: AuthUser | undefined,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : undefined;
    return this.semantic.search(q, Number.isFinite(parsed) ? parsed : undefined, user);
  }
}

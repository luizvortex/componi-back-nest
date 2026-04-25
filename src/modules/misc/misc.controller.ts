import { Controller, Get, Header } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';

/**
 * Serves well-known static strings that crawlers and security researchers
 * look for at fixed canonical paths. Kept as hand-crafted controllers so
 * we don't pull in the static-files module just for 2 plaintext blobs.
 *
 * These routes bypass the global /api/v1 prefix — see main.ts's
 * setGlobalPrefix exclude list. Also @Public() so the auth guard lets
 * them through.
 */
@Controller()
export class MiscController {
  @Public()
  @Get('robots.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  robotsTxt(): string {
    return [
      '# componi-api robots.txt',
      'User-agent: *',
      'Disallow: /api/',
      'Disallow: /.well-known/',
      '',
    ].join('\n');
  }

  @Public()
  @Get('.well-known/security.txt')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  securityTxt(): string {
    // RFC 9116. Consult docs/SECURITY.md for the disclosure policy.
    // Expires must be a future ISO-8601 UTC timestamp or crawlers treat
    // the file as stale. We bump it with each policy refresh.
    return [
      'Contact: mailto:security@componi.dev',
      'Contact: https://github.com/luizvortex/componi-back-nest/security/advisories',
      'Policy: https://github.com/luizvortex/componi-back-nest/blob/main/docs/SECURITY.md',
      'Preferred-Languages: en, pt-BR',
      'Expires: 2027-04-23T00:00:00Z',
      '',
    ].join('\n');
  }
}

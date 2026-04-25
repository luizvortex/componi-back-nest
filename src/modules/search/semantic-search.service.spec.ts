import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { CacheService } from '../../common/cache/cache.service';
import { EmbeddingsService } from '../../common/embeddings/embeddings.service';
import { SemanticSearchService } from './semantic-search.service';

function setup(opts: { enabled?: boolean; queryEmbed?: jest.Mock } = {}) {
  const dataSource = { query: jest.fn().mockResolvedValue([]) } as any;
  const embeddings = {
    embedQuery:
      opts.queryEmbed ?? jest.fn().mockResolvedValue(new Float32Array(384).fill(0.1)),
  } as unknown as EmbeddingsService;
  // Cache wrap: just delegate to the loader so we exercise the real path.
  const cache = {
    wrap: jest.fn(async (_key: string, loader: () => Promise<unknown>) => loader()),
  } as unknown as CacheService;
  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'embeddings.enabled') return opts.enabled ?? true;
      if (key === 'embeddings.maxQueryChars') return 200;
      if (key === 'embeddings.dimensions') return 384;
      if (key === 'embeddings.searchCacheTtlSeconds') return 300;
      return fallback;
    },
  } as unknown as ConfigService;
  const service = new SemanticSearchService(dataSource, embeddings, cache, config);
  return { service, dataSource, embeddings, cache };
}

describe('SemanticSearchService.search', () => {
  it('returns 503 when embeddings are disabled', async () => {
    const { service } = setup({ enabled: false });
    await expect(service.search('react form', 20)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects queries shorter than 2 chars', async () => {
    const { service } = setup();
    await expect(service.search('a', 20)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects queries longer than the configured cap', async () => {
    const { service } = setup();
    await expect(service.search('x'.repeat(300), 20)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uses parameterised SQL — vector goes as $1, viewerId as $2, limit as $3', async () => {
    const { service, dataSource, embeddings } = setup();
    await service.search('react form validation', 10);
    expect(embeddings.embedQuery).toHaveBeenCalledWith('react form validation');
    const [sql, params] = (dataSource.query as jest.Mock).mock.calls[0];
    expect(sql).toContain('$1::vector');
    expect(sql).toContain('ORDER BY c.embedding <=> $1::vector');
    expect(params[0]).toMatch(/^\[/); // pgvector text literal
    expect(params[1]).toBeNull(); // anonymous caller
    expect(params[2]).toBe(10);
    expect(sql).not.toMatch(/\bembedding\s+AS\b/i); // never SELECT the vector
  });

  it('threads viewer.id as the block-filter parameter', async () => {
    const { service, dataSource } = setup();
    await service.search('test', 5, {
      id: 'u1',
      email: null,
      githubUsername: null,
      provider: null,
      role: 'user',
      suspendedUntil: null,
      privacyAcceptedVersion: '2026-04-23',
      termsAcceptedVersion: '2026-04-23',
      claims: {},
    });
    const [, params] = (dataSource.query as jest.Mock).mock.calls[0];
    expect(params[1]).toBe('u1');
  });

  it('caps the limit at 50', async () => {
    const { service, dataSource } = setup();
    await service.search('test', 9999);
    const [, params] = (dataSource.query as jest.Mock).mock.calls[0];
    expect(params[2]).toBe(50);
  });
});

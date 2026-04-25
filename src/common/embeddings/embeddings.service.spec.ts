import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';

import { EmbeddingsService } from './embeddings.service';
import type { EmbeddingProvider } from './embedding-provider.interface';

// Helper: build a service with stub deps, exposing the queue + datasource
// + provider so individual tests can override behaviour.
function setup(opts: {
  enabled?: boolean;
  workersEnabled?: boolean;
  providerEmbed?: jest.Mock;
} = {}) {
  const queue = { add: jest.fn().mockResolvedValue(undefined) } as unknown as Queue;
  const dataSource = { query: jest.fn() } as any;
  const provider: EmbeddingProvider = {
    warmup: jest.fn().mockResolvedValue(undefined),
    embedPassage: opts.providerEmbed ?? jest.fn(),
    embedQuery: jest.fn(),
    dimensions: 384,
  };
  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'embeddings.enabled') return opts.enabled ?? true;
      if (key === 'redis.queue.workersEnabled')
        return opts.workersEnabled ?? true;
      if (key === 'embeddings.dimensions') return 384;
      return fallback;
    },
  } as unknown as ConfigService;

  const service = new EmbeddingsService(queue, dataSource, provider, config);
  return { service, queue, dataSource, provider };
}

describe('EmbeddingsService.enqueue', () => {
  it('is a no-op when disabled', async () => {
    const { service, queue } = setup({ enabled: false });
    await service.enqueue('c1');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('pushes to BullMQ when workers are on (with stable jobId)', async () => {
    const { service, queue } = setup({ workersEnabled: true });
    await service.enqueue('c1');
    expect(queue.add).toHaveBeenCalledWith(
      'embed',
      { componentId: 'c1' },
      expect.objectContaining({ jobId: 'embed:c1' }),
    );
  });

  it('runs deliver inline when workers are off', async () => {
    const { service, queue, dataSource, provider } = setup({
      workersEnabled: false,
    });
    // First query loads the row, second query updates it.
    (dataSource.query as jest.Mock)
      .mockResolvedValueOnce([
        {
          id: 'c1',
          name: 'Btn',
          description: null,
          framework: 'react',
          tags: null,
          codeSnippet: null,
        },
      ])
      .mockResolvedValueOnce(undefined);
    (provider.embedPassage as jest.Mock).mockResolvedValue(
      new Float32Array(384).fill(0.1),
    );

    await service.enqueue('c1');

    expect(queue.add).not.toHaveBeenCalled();
    expect(provider.embedPassage).toHaveBeenCalledTimes(1);
    expect(dataSource.query).toHaveBeenCalledTimes(2); // SELECT + UPDATE
  });

  it('swallows inline-delivery errors so the request path is not affected', async () => {
    const { service, dataSource } = setup({ workersEnabled: false });
    (dataSource.query as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(service.enqueue('c1')).resolves.toBeUndefined();
  });
});

describe('EmbeddingsService.deliver', () => {
  it('skips silently when the row is gone (race with delete)', async () => {
    const { service, dataSource, provider } = setup({ workersEnabled: false });
    (dataSource.query as jest.Mock).mockResolvedValueOnce([]); // SELECT returns nothing
    await service.deliver('missing');
    expect(provider.embedPassage).not.toHaveBeenCalled();
  });

  it('refuses to write a vector with the wrong dimension', async () => {
    const { service, dataSource, provider } = setup({ workersEnabled: false });
    (dataSource.query as jest.Mock).mockResolvedValueOnce([
      {
        id: 'c1',
        name: 'X',
        description: null,
        framework: 'react',
        tags: null,
        codeSnippet: null,
      },
    ]);
    (provider.embedPassage as jest.Mock).mockResolvedValue(
      new Float32Array(128).fill(0.1), // wrong dim
    );
    await expect(service.deliver('c1')).rejects.toThrow(/dim 128/);
  });
});

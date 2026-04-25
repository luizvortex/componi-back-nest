import { BadRequestException } from '@nestjs/common';

import { BlocksService } from './blocks.service';

// We only test the pure helpers that don't touch the DB — the full
// transactional path is integration-test territory. The goal here is to
// catch regressions in the symmetry / self-block invariants.

describe('BlocksService.isBlockedEitherWay', () => {
  it('returns false when viewer === author', async () => {
    const blocks = {
      createQueryBuilder: jest.fn(), // should never be called
    } as any;
    const service = new BlocksService(blocks, {} as any, {} as any);
    await expect(service.isBlockedEitherWay('u1', 'u1')).resolves.toBe(false);
    expect(blocks.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('queries both directions of the block relationship', async () => {
    const getOne = jest.fn().mockResolvedValue({ id: 'b1' });
    const qb = {
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getOne,
    };
    const blocks = { createQueryBuilder: jest.fn().mockReturnValue(qb) } as any;
    const service = new BlocksService(blocks, {} as any, {} as any);

    const hit = await service.isBlockedEitherWay('viewer', 'author');
    expect(hit).toBe(true);
    const [sql, params] = qb.where.mock.calls[0];
    expect(sql).toMatch(/"blockerId"\s*=\s*:a\s+AND\s+b\."blockedId"\s*=\s*:b/);
    expect(sql).toMatch(/"blockerId"\s*=\s*:b\s+AND\s+b\."blockedId"\s*=\s*:a/);
    expect(params).toEqual({ a: 'viewer', b: 'author' });
  });
});

describe('BlocksService.block', () => {
  it('rejects self-block synchronously', async () => {
    const service = new BlocksService({} as any, {} as any, {} as any);
    await expect(service.block('u1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

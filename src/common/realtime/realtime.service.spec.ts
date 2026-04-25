import { ConfigService } from '@nestjs/config';

import { RealtimeService } from './realtime.service';

function setup(opts: { enabled?: boolean } = {}) {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  const gateway = {
    server: { to },
    userRoom: (id: string) => `user:${id}`,
    componentRoom: (id: string) => `component:${id}`,
  } as any;
  const config = {
    get: (key: string, fallback?: unknown) =>
      key === 'realtime.enabled' ? opts.enabled ?? true : fallback,
  } as unknown as ConfigService;
  return {
    service: new RealtimeService(gateway, config),
    to,
    emit,
  };
}

describe('RealtimeService', () => {
  it('is a no-op when disabled', () => {
    const { service, to } = setup({ enabled: false });
    service.componentLiked('c1', 'u1', 5);
    service.notifyUser('u2', 'like', 'u1', {});
    expect(to).not.toHaveBeenCalled();
  });

  it('routes notifications to the recipient user room', () => {
    const { service, to, emit } = setup();
    service.notifyUser('u2', 'like', 'u1', { componentId: 'c1' });
    expect(to).toHaveBeenCalledWith('user:u2');
    expect(emit).toHaveBeenCalledWith(
      'notification',
      expect.objectContaining({
        type: 'like',
        actorId: 'u1',
        payload: { componentId: 'c1' },
      }),
    );
  });

  it('routes component:like to the component room with fresh count', () => {
    const { service, to, emit } = setup();
    service.componentLiked('c1', 'u1', 7);
    expect(to).toHaveBeenCalledWith('component:c1');
    expect(emit).toHaveBeenCalledWith('component:like', {
      componentId: 'c1',
      actorId: 'u1',
      likesCount: 7,
    });
  });

  it('routes user:follow to the followee room', () => {
    const { service, to, emit } = setup();
    service.userFollowed('u2', 'u1', 42);
    expect(to).toHaveBeenCalledWith('user:u2');
    expect(emit).toHaveBeenCalledWith('user:follow', {
      followerId: 'u1',
      followersCount: 42,
    });
  });
});

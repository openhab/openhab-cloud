/*
 * Copyright (c) 2010-2026 Contributors to the openHAB project
 *
 * See the NOTICE file(s) distributed with this work for additional
 * information.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import http from 'http';
import net from 'net';
import type { AddressInfo } from 'net';
import { expect } from 'chai';
import sinon from 'sinon';
import type { Request, Response, NextFunction } from 'express';
import {
  createMiddleware,
  invalidateConnectionCache,
} from '../../../../src/routes/middleware';
import type { MiddlewareDependencies } from '../../../../src/routes/middleware';
import { openhabCache, invalidateOpenhabCache } from '../../../../src/lib/lookup-caches';

describe('Route Middleware', () => {
  let deps: MiddlewareDependencies;
  let mockRedis: {
    get: sinon.SinonStub;
  };
  let mockLogger: {
    debug: sinon.SinonStub;
    info: sinon.SinonStub;
    warn: sinon.SinonStub;
    error: sinon.SinonStub;
  };
  let mockSystemConfig: MiddlewareDependencies['systemConfig'];

  beforeEach(() => {
    mockRedis = {
      get: sinon.stub(),
    };

    mockLogger = {
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
    };

    mockSystemConfig = {
      getInternalAddress: () => 'server1.internal:3000',
      getBaseURL: () => 'https://localhost',
      getHost: () => 'localhost',
      getPort: () => 3000,
      getProxyHost: () => 'proxy.local',
      getProxyPort: () => 8080,
      getProxyURL: () => 'https://proxy.local',
      getBrowserProxyHost: () => undefined,
      getBrowserProxyURL: () => undefined,
    };

    deps = {
      redis: mockRedis as unknown as MiddlewareDependencies['redis'],
      logger: mockLogger as unknown as MiddlewareDependencies['logger'],
      systemConfig: mockSystemConfig,
    };

    // Clear connection cache before each test
    // We'll invalidate a known key to ensure clean state
    invalidateConnectionCache('test-openhab-id');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('Connection Cache', () => {
    it('should cache connection info on first lookup', async () => {
      const middleware = createMiddleware(deps);
      const openhabId = 'cache-test-' + Date.now();

      // Mock Redis returning connection info
      const connectionInfo = {
        serverAddress: 'server1.internal',
        connectionId: 'conn-123',
        openhabVersion: '4.1.0',
      };
      mockRedis.get.resolves(JSON.stringify(connectionInfo));

      const mockOpenhab = {
        _id: { toString: () => openhabId },
        uuid: 'test-uuid',
        last_online: new Date(),
      };

      const mockUser = {
        getOpenhab: sinon.stub().resolves(mockOpenhab),
      };

      const mockReq = {
        isAuthenticated: () => true,
        user: mockUser,
      } as unknown as Request;

      const mockRes = {
        locals: {},
        status: sinon.stub().returnsThis(),
        json: sinon.stub(),
      } as unknown as Response;

      const nextSpy = sinon.spy();

      // First call - should hit Redis
      await new Promise<void>((resolve) => {
        middleware.setOpenhab(mockReq, mockRes, (() => {
          nextSpy();
          resolve();
        }) as NextFunction);
      });

      expect(mockRedis.get.calledOnce).to.be.true;
      expect(nextSpy.calledOnce).to.be.true;

      // Second call - should hit cache
      const mockReq2 = {
        isAuthenticated: () => true,
        user: mockUser,
      } as unknown as Request;

      const mockRes2 = {
        locals: {},
        status: sinon.stub().returnsThis(),
        json: sinon.stub(),
      } as unknown as Response;

      const nextSpy2 = sinon.spy();

      await new Promise<void>((resolve) => {
        middleware.setOpenhab(mockReq2, mockRes2, (() => {
          nextSpy2();
          resolve();
        }) as NextFunction);
      });

      // Redis should still only have been called once (cached)
      expect(mockRedis.get.calledOnce).to.be.true;
      expect(nextSpy2.calledOnce).to.be.true;
    });

    it('should invalidate cache when invalidateConnectionCache is called', async () => {
      const middleware = createMiddleware(deps);
      const openhabId = 'invalidate-test-' + Date.now();

      const connectionInfo = {
        serverAddress: 'server1.internal',
        connectionId: 'conn-123',
        openhabVersion: '4.1.0',
      };
      mockRedis.get.resolves(JSON.stringify(connectionInfo));

      const mockOpenhab = {
        _id: { toString: () => openhabId },
        uuid: 'test-uuid',
        last_online: new Date(),
      };

      const mockUser = {
        getOpenhab: sinon.stub().resolves(mockOpenhab),
      };

      const createMockReq = () =>
        ({
          isAuthenticated: () => true,
          user: mockUser,
        }) as unknown as Request;

      const createMockRes = () =>
        ({
          locals: {},
          status: sinon.stub().returnsThis(),
          json: sinon.stub(),
        }) as unknown as Response;

      // First call - populates cache
      await new Promise<void>((resolve) => {
        middleware.setOpenhab(createMockReq(), createMockRes(), resolve as NextFunction);
      });

      expect(mockRedis.get.calledOnce).to.be.true;

      // Invalidate the cache
      invalidateConnectionCache(openhabId);

      // Third call - should hit Redis again (cache was invalidated)
      await new Promise<void>((resolve) => {
        middleware.setOpenhab(createMockReq(), createMockRes(), resolve as NextFunction);
      });

      // Redis should have been called twice now
      expect(mockRedis.get.calledTwice).to.be.true;
    });

    it('should cache offline status (null connection info)', async () => {
      const middleware = createMiddleware(deps);
      const openhabId = 'offline-cache-test-' + Date.now();

      // Mock Redis returning null (offline)
      mockRedis.get.resolves(null);

      const mockOpenhab = {
        _id: { toString: () => openhabId },
        uuid: 'test-uuid',
        last_online: new Date(),
      };

      const mockUser = {
        getOpenhab: sinon.stub().resolves(mockOpenhab),
      };

      const createMockReq = () =>
        ({
          isAuthenticated: () => true,
          user: mockUser,
        }) as unknown as Request;

      const createMockRes = () =>
        ({
          locals: {},
          status: sinon.stub().returnsThis(),
          json: sinon.stub(),
        }) as unknown as Response;

      // First call
      let res1 = createMockRes();
      await new Promise<void>((resolve) => {
        middleware.setOpenhab(createMockReq(), res1, resolve as NextFunction);
      });

      expect(mockRedis.get.calledOnce).to.be.true;
      expect(res1.locals['openhabstatus']).to.equal('offline');

      // Second call - should hit cache
      let res2 = createMockRes();
      await new Promise<void>((resolve) => {
        middleware.setOpenhab(createMockReq(), res2, resolve as NextFunction);
      });

      // Redis should still only have been called once
      expect(mockRedis.get.calledOnce).to.be.true;
      expect(res2.locals['openhabstatus']).to.equal('offline');
    });

    it('should not cache Redis errors', async () => {
      const middleware = createMiddleware(deps);
      const openhabId = 'error-cache-test-' + Date.now();

      // First call - Redis error
      mockRedis.get.rejects(new Error('Redis connection failed'));

      const mockOpenhab = {
        _id: { toString: () => openhabId },
        uuid: 'test-uuid',
        last_online: new Date(),
      };

      const mockUser = {
        getOpenhab: sinon.stub().resolves(mockOpenhab),
      };

      const createMockReq = () =>
        ({
          isAuthenticated: () => true,
          user: mockUser,
        }) as unknown as Request;

      const createMockRes = () =>
        ({
          locals: {},
          status: sinon.stub().returnsThis(),
          json: sinon.stub(),
        }) as unknown as Response;

      // First call - error
      await new Promise<void>((resolve) => {
        middleware.setOpenhab(createMockReq(), createMockRes(), resolve as NextFunction);
      });

      expect(mockRedis.get.calledOnce).to.be.true;

      // Second call - should try Redis again (error not cached)
      mockRedis.get.resolves(null);
      await new Promise<void>((resolve) => {
        middleware.setOpenhab(createMockReq(), createMockRes(), resolve as NextFunction);
      });

      // Redis should have been called twice
      expect(mockRedis.get.calledTwice).to.be.true;
    });

  });

  describe('openHAB Lookup Cache', () => {
    const connectionInfo = {
      serverAddress: 'server1.internal',
      connectionId: 'conn-123',
      openhabVersion: '4.1.0',
    };

    const createMockRes = () =>
      ({
        locals: {},
        status: sinon.stub().returnsThis(),
        json: sinon.stub(),
      }) as unknown as Response;

    const runSetOpenhab = (
      middleware: ReturnType<typeof createMiddleware>,
      user: unknown
    ): Promise<Response> => {
      const res = createMockRes();
      const req = {
        isAuthenticated: () => true,
        user,
      } as unknown as Request;

      return new Promise<Response>((resolve) => {
        middleware.setOpenhab(req, res, (() => resolve(res)) as NextFunction);
      });
    };

    beforeEach(() => {
      openhabCache.clear();
      mockRedis.get.resolves(JSON.stringify(connectionInfo));
    });

    it('looks up the openHAB only once for repeated requests', async () => {
      const middleware = createMiddleware(deps);
      const accountId = 'account-' + Date.now();
      const getOpenhab = sinon.stub().resolves({
        _id: { toString: () => 'openhab-1' },
        uuid: 'test-uuid',
        last_online: new Date(),
      });
      const user = { account: accountId, getOpenhab };

      await runSetOpenhab(middleware, user);
      await runSetOpenhab(middleware, user);
      await runSetOpenhab(middleware, user);

      expect(getOpenhab.calledOnce).to.be.true;
    });

    it('still populates req.openhab and locals from the cache', async () => {
      const middleware = createMiddleware(deps);
      const accountId = 'account-locals-' + Date.now();
      const openhab = {
        _id: { toString: () => 'openhab-2' },
        uuid: 'cached-uuid',
        last_online: new Date(),
      };
      const user = { account: accountId, getOpenhab: sinon.stub().resolves(openhab) };

      await runSetOpenhab(middleware, user);
      const res = await runSetOpenhab(middleware, user);

      expect(res.locals['openhab']).to.equal(openhab);
      expect(res.locals['openhabstatus']).to.equal('online');
    });

    it('shares one entry between users on the same account', async () => {
      const middleware = createMiddleware(deps);
      const accountId = 'account-shared-' + Date.now();
      const openhab = {
        _id: { toString: () => 'openhab-3' },
        uuid: 'test-uuid',
        last_online: new Date(),
      };
      const firstUser = { account: accountId, getOpenhab: sinon.stub().resolves(openhab) };
      const secondUser = { account: accountId, getOpenhab: sinon.stub().resolves(openhab) };

      await runSetOpenhab(middleware, firstUser);
      await runSetOpenhab(middleware, secondUser);

      expect(secondUser.getOpenhab.called).to.be.false;
    });

    it('looks up again after the account is invalidated', async () => {
      const middleware = createMiddleware(deps);
      const accountId = 'account-invalidate-' + Date.now();
      const getOpenhab = sinon.stub().resolves({
        _id: { toString: () => 'openhab-4' },
        uuid: 'test-uuid',
        last_online: new Date(),
      });
      const user = { account: accountId, getOpenhab };

      await runSetOpenhab(middleware, user);
      invalidateOpenhabCache(accountId);
      await runSetOpenhab(middleware, user);

      expect(getOpenhab.calledTwice).to.be.true;
    });

    it('does not cache across different accounts', async () => {
      const middleware = createMiddleware(deps);
      const stamp = Date.now();
      const openhab = {
        _id: { toString: () => 'openhab-5' },
        uuid: 'test-uuid',
        last_online: new Date(),
      };
      const firstUser = { account: 'account-a-' + stamp, getOpenhab: sinon.stub().resolves(openhab) };
      const secondUser = { account: 'account-b-' + stamp, getOpenhab: sinon.stub().resolves(openhab) };

      await runSetOpenhab(middleware, firstUser);
      await runSetOpenhab(middleware, secondUser);

      expect(secondUser.getOpenhab.calledOnce).to.be.true;
    });

    it('does not cache a missing openHAB', async () => {
      const middleware = createMiddleware(deps);
      const accountId = 'account-missing-' + Date.now();
      const getOpenhab = sinon.stub().resolves(null);
      const user = { account: accountId, getOpenhab };

      const res = createMockRes();
      const req = { isAuthenticated: () => true, user } as unknown as Request;
      middleware.setOpenhab(req, res, sinon.spy() as NextFunction);
      await new Promise((resolve) => setImmediate(resolve));

      expect(openhabCache.get(accountId)).to.be.undefined;
    });

    it('issues one lookup for a burst of concurrent requests', async () => {
      const middleware = createMiddleware(deps);
      const accountId = 'account-burst-' + Date.now();
      let resolveLookup: (value: unknown) => void = () => {};
      const getOpenhab = sinon.stub().callsFake(
        () => new Promise((resolve) => { resolveLookup = resolve; })
      );
      const user = { account: accountId, getOpenhab };

      // 90 assets arriving together on a cold cache, as HTTP/2 delivers them
      const burst = Promise.all(
        Array.from({ length: 90 }, () => runSetOpenhab(middleware, user))
      );
      resolveLookup({
        _id: { toString: () => 'openhab-burst' },
        uuid: 'test-uuid',
        last_online: new Date(),
      });
      await burst;

      expect(getOpenhab.calledOnce).to.be.true;
    });

    it('falls back to a lookup when the user has no account', async () => {
      const middleware = createMiddleware(deps);
      const getOpenhab = sinon.stub().resolves({
        _id: { toString: () => 'openhab-6' },
        uuid: 'test-uuid',
        last_online: new Date(),
      });
      const user = { getOpenhab };

      await runSetOpenhab(middleware, user);
      await runSetOpenhab(middleware, user);

      expect(getOpenhab.calledTwice).to.be.true;
    });
  });

  describe('ensureServer', () => {
    it('should return offline error when no server address', () => {
      const middleware = createMiddleware(deps);

      const mockReq = {
        connectionInfo: {},
      } as unknown as Request;

      const writeHeadStub = sinon.stub();
      const endStub = sinon.stub();
      const mockRes = {
        writeHead: writeHeadStub,
        end: endStub,
      } as unknown as Response;

      const nextSpy = sinon.spy();

      middleware.ensureServer(mockReq, mockRes, nextSpy);

      expect(writeHeadStub.calledWith(500, 'openHAB is offline')).to.be.true;
      expect(endStub.calledWith('openHAB is offline')).to.be.true;
      expect(nextSpy.called).to.be.false;
    });

    it('should internal-proxy to correct server when on wrong server', () => {
      const middleware = createMiddleware(deps);

      const mockReq = {
        connectionInfo: {
          serverAddress: 'server2.internal:3001',
        },
        originalUrl: '/rest/items?type=Switch',
        path: '/rest/items',
        method: 'GET',
        headers: { host: 'myopenhab.org' },
        rawBody: undefined,
      } as unknown as Request;

      const mockRes = { on: sinon.stub() } as unknown as Response;
      const nextSpy = sinon.spy();

      const mockProxyReq = {
        on: sinon.stub().returnsThis(),
        end: sinon.stub(),
      };
      const requestStub = sinon.stub(http, 'request').returns(
        mockProxyReq as unknown as http.ClientRequest
      );

      middleware.ensureServer(mockReq, mockRes, nextSpy);

      expect(requestStub.calledOnce).to.be.true;
      const opts = requestStub.firstCall.args[0] as http.RequestOptions;
      expect(opts.hostname).to.equal('server2.internal');
      expect(opts.port).to.equal(3001);
      expect(opts.path).to.equal('/rest/items?type=Switch');
      expect(opts.method).to.equal('GET');
      expect(mockProxyReq.end.calledOnce).to.be.true;
      expect(nextSpy.called).to.be.false;
    });

    it('should send body when rawBody is present', () => {
      const middleware = createMiddleware(deps);

      const mockReq = {
        connectionInfo: {
          serverAddress: 'server2.internal:3001',
        },
        originalUrl: '/rest/items/Switch1',
        path: '/rest/items/Switch1',
        method: 'POST',
        headers: { host: 'myopenhab.org', 'content-type': 'text/plain' },
        rawBody: 'ON',
      } as unknown as Request;

      const mockRes = { on: sinon.stub() } as unknown as Response;
      const nextSpy = sinon.spy();

      const mockProxyReq = {
        on: sinon.stub().returnsThis(),
        end: sinon.stub(),
      };
      sinon.stub(http, 'request').returns(
        mockProxyReq as unknown as http.ClientRequest
      );

      middleware.ensureServer(mockReq, mockRes, nextSpy);

      expect(mockProxyReq.end.calledWith('ON')).to.be.true;
    });

    it('should set CloudServer cookie and call next when on correct server', () => {
      const middleware = createMiddleware(deps);

      const mockReq = {
        connectionInfo: {
          serverAddress: 'server1.internal:3000',
        },
        path: '/rest/items',
      } as unknown as Request;

      const cookieStub = sinon.stub();
      const mockRes = {
        cookie: cookieStub,
      } as unknown as Response;

      const nextSpy = sinon.spy();

      middleware.ensureServer(mockReq, mockRes, nextSpy);

      expect(cookieStub.calledWith('CloudServer', 'server1.internal:3000')).to.be.true;
      expect(nextSpy.calledOnce).to.be.true;
    });
  });

  describe('ensureServer WebSocket upgrades', () => {
    const UPGRADE_RESPONSE =
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + 'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n';

    let servers: http.Server[] = [];

    const listen = (server: http.Server): Promise<number> => {
      servers.push(server);
      return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          resolve((server.address() as AddressInfo).port);
        });
      });
    };

    // Echoes back whatever the tunnel carries, so the test can prove both
    // directions are wired up.
    const echoFrames = (socket: net.Socket) => {
      socket.on('data', (chunk: Buffer) => {
        socket.write(Buffer.concat([Buffer.from('echo:'), chunk]));
      });
    };

    // Front node: no openHAB connection, so ensureServer proxies onwards.
    const frontHandler = (
      middleware: ReturnType<typeof createMiddleware>,
      targetPort: number
    ) => (req: http.IncomingMessage, res: http.ServerResponse) => {
      (req as unknown as Request).connectionInfo = {
        serverAddress: `127.0.0.1:${targetPort}`,
      };
      middleware.ensureServer(
        req as unknown as Request,
        res as unknown as Response,
        (() => {}) as NextFunction
      );
    };

    // Sends a raw request, waits for the 101, then round-trips a frame.
    const openTunnel = (port: number, request: string): Promise<string> =>
      new Promise((resolve, reject) => {
        const client = net.connect(port, '127.0.0.1');
        let received = '';
        let sentFrame = false;

        client.on('data', (chunk: Buffer) => {
          received += chunk.toString();
          if (!sentFrame && received.includes('\r\n\r\n')) {
            sentFrame = true;
            client.write('hello');
          } else if (sentFrame && received.includes('echo:hello')) {
            client.destroy();
            resolve(received);
          }
        });
        client.on('error', reject);
        client.on('close', () => reject(new Error(`socket closed early: ${received}`)));
        client.write(request);
      });

    afterEach(() => {
      for (const server of servers) {
        server.close();
      }
      servers = [];
    });

    it('tunnels an upgrade that arrives on the HTTP upgrade event', async () => {
      const targetServer = http.createServer();
      targetServer.on('upgrade', (_req, socket) => {
        socket.write(UPGRADE_RESPONSE);
        echoFrames(socket);
      });
      const targetPort = await listen(targetServer);

      const middleware = createMiddleware(deps);
      const frontServer = http.createServer();
      // Mirrors app.ts: hand the upgrade to the middleware chain with a
      // synthetic ServerResponse bound to the client socket.
      frontServer.on('upgrade', (req, socket, head) => {
        const res = new http.ServerResponse(req);
        res.assignSocket(socket);
        if (head && head.length > 0) {
          socket.unshift(head);
        }
        frontHandler(middleware, targetPort)(req, res);
      });
      const frontPort = await listen(frontServer);

      const received = await openTunnel(
        frontPort,
        'GET /ws/foo HTTP/1.1\r\n'
        + 'Host: myopenhab.org\r\n'
        + 'Upgrade: websocket\r\n'
        + 'Connection: Upgrade\r\n'
        + 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n'
        + 'Sec-WebSocket-Version: 13\r\n\r\n'
      );

      expect(received).to.contain('101 Switching Protocols');
      expect(received).to.contain('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
      expect(received).to.contain('echo:hello');
    });

    it('tunnels an upgrade whose hop-by-hop headers were stripped', async () => {
      // No Upgrade/Connection headers, so both nodes see a plain request and
      // detect the upgrade from the sec-websocket-* headers instead.
      const targetServer = http.createServer((_req, res) => {
        const socket = res.socket as net.Socket;
        socket.removeAllListeners('data');
        res.detachSocket(socket);
        socket.write(UPGRADE_RESPONSE);
        echoFrames(socket);
      });
      const targetPort = await listen(targetServer);

      const middleware = createMiddleware(deps);
      const frontServer = http.createServer(frontHandler(middleware, targetPort));
      const frontPort = await listen(frontServer);

      const received = await openTunnel(
        frontPort,
        'GET /ws/foo HTTP/1.1\r\n'
        + 'Host: myopenhab.org\r\n'
        + 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n'
        + 'Sec-WebSocket-Version: 13\r\n\r\n'
      );

      expect(received).to.contain('101 Switching Protocols');
      expect(received).to.contain('echo:hello');
    });

    it('closes the client socket when the target node goes away', async () => {
      const targetServer = http.createServer();
      targetServer.on('upgrade', (_req, socket) => {
        socket.write(UPGRADE_RESPONSE);
        socket.destroy();
      });
      const targetPort = await listen(targetServer);

      const middleware = createMiddleware(deps);
      const frontServer = http.createServer();
      frontServer.on('upgrade', (req, socket) => {
        const res = new http.ServerResponse(req);
        res.assignSocket(socket);
        frontHandler(middleware, targetPort)(req, res);
      });
      const frontPort = await listen(frontServer);

      const closed = await new Promise<string>((resolve, reject) => {
        const client = net.connect(frontPort, '127.0.0.1');
        let received = '';
        client.on('data', (chunk: Buffer) => {
          received += chunk.toString();
        });
        client.on('close', () => resolve(received));
        client.on('error', reject);
        client.write(
          'GET /ws/foo HTTP/1.1\r\n'
          + 'Host: myopenhab.org\r\n'
          + 'Upgrade: websocket\r\n'
          + 'Connection: Upgrade\r\n'
          + 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n'
          + 'Sec-WebSocket-Version: 13\r\n\r\n'
        );
      });

      expect(closed).to.contain('101 Switching Protocols');
    });
  });
});

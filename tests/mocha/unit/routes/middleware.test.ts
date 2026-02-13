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

import { expect } from 'chai';
import sinon from 'sinon';
import type { Request, Response, NextFunction } from 'express';
import {
  createMiddleware,
  invalidateConnectionCache,
  getConnectionCacheStats,
} from '../../../../src/routes/middleware';
import type { MiddlewareDependencies } from '../../../../src/routes/middleware';

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
      getInternalAddress: () => 'server1.internal',
      getHost: () => 'localhost',
      getPort: () => 3000,
      getProxyHost: () => 'proxy.local',
      getProxyPort: () => 8080,
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

    it('should report cache stats', () => {
      const stats = getConnectionCacheStats();

      expect(stats).to.have.property('size');
      expect(stats).to.have.property('ttlMs');
      expect(stats.ttlMs).to.equal(30000); // 30 seconds
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

    it('should redirect to correct server using http://', () => {
      const middleware = createMiddleware(deps);

      const mockReq = {
        connectionInfo: {
          serverAddress: 'server2.internal',
        },
        path: '/rest/items',
      } as unknown as Request;

      const redirectStub = sinon.stub();
      const mockRes = {
        redirect: redirectStub,
      } as unknown as Response;

      const nextSpy = sinon.spy();

      middleware.ensureServer(mockReq, mockRes, nextSpy);

      expect(redirectStub.calledWith(307, 'http://server2.internal/rest/items')).to.be.true;
      expect(nextSpy.called).to.be.false;
    });

    it('should set CloudServer cookie and call next when on correct server', () => {
      const middleware = createMiddleware(deps);

      const mockReq = {
        connectionInfo: {
          serverAddress: 'server1.internal',
        },
        path: '/rest/items',
      } as unknown as Request;

      const cookieStub = sinon.stub();
      const mockRes = {
        cookie: cookieStub,
      } as unknown as Response;

      const nextSpy = sinon.spy();

      middleware.ensureServer(mockReq, mockRes, nextSpy);

      expect(cookieStub.calledWith('CloudServer', 'server1.internal')).to.be.true;
      expect(nextSpy.calledOnce).to.be.true;
    });
  });
});

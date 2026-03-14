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
import { createVhostDetection } from '../../../../src/middleware/vhost';
import type { SystemConfigManager } from '../../../../src/config';

describe('Vhost Detection Middleware', () => {
  let mockConfigManager: Pick<SystemConfigManager, 'getProxyHost' | 'getHost'>;
  let mockRes: Response;
  let nextSpy: sinon.SinonSpy;

  beforeEach(() => {
    mockRes = {} as Response;
    nextSpy = sinon.spy();
  });

  afterEach(() => {
    sinon.restore();
  });

  function createReq(hostname: string | undefined): Request {
    return { hostname, isVhostProxy: undefined } as unknown as Request;
  }

  describe('when proxyHost differs from mainHost', () => {
    beforeEach(() => {
      mockConfigManager = {
        getProxyHost: () => 'proxy.example.com',
        getHost: () => 'mycloud.example.com',
      };
    });

    it('should set isVhostProxy when hostname matches proxyHost', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);
      const req = createReq('proxy.example.com');

      middleware(req, mockRes, nextSpy);

      expect(req.isVhostProxy).to.equal(true);
      expect(nextSpy.calledOnce).to.be.true;
    });

    it('should set isVhostProxy when hostname matches remote.<mainHost>', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);
      const req = createReq('remote.mycloud.example.com');

      middleware(req, mockRes, nextSpy);

      expect(req.isVhostProxy).to.equal(true);
      expect(nextSpy.calledOnce).to.be.true;
    });

    it('should not set isVhostProxy for the main host', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);
      const req = createReq('mycloud.example.com');

      middleware(req, mockRes, nextSpy);

      expect(req.isVhostProxy).to.be.undefined;
      expect(nextSpy.calledOnce).to.be.true;
    });

    it('should not set isVhostProxy for unrelated hosts', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);
      const req = createReq('evil.example.com');

      middleware(req, mockRes, nextSpy);

      expect(req.isVhostProxy).to.be.undefined;
      expect(nextSpy.calledOnce).to.be.true;
    });
  });

  describe('when proxyHost falls back to mainHost (issue #578)', () => {
    beforeEach(() => {
      mockConfigManager = {
        getProxyHost: () => 'mycloud.example.com',
        getHost: () => 'mycloud.example.com',
      };
    });

    it('should NOT set isVhostProxy for normal requests', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);
      const req = createReq('mycloud.example.com');

      middleware(req, mockRes, nextSpy);

      expect(req.isVhostProxy).to.be.undefined;
      expect(nextSpy.calledOnce).to.be.true;
    });

    it('should still set isVhostProxy for remote.<mainHost>', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);
      const req = createReq('remote.mycloud.example.com');

      middleware(req, mockRes, nextSpy);

      expect(req.isVhostProxy).to.equal(true);
      expect(nextSpy.calledOnce).to.be.true;
    });
  });

  describe('case insensitivity', () => {
    beforeEach(() => {
      mockConfigManager = {
        getProxyHost: () => 'proxy.example.com',
        getHost: () => 'mycloud.example.com',
      };
    });

    it('should match proxyHost case-insensitively', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);
      const req = createReq('PROXY.EXAMPLE.COM');

      middleware(req, mockRes, nextSpy);

      expect(req.isVhostProxy).to.equal(true);
    });

    it('should match remote.<mainHost> case-insensitively', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);
      const req = createReq('Remote.MyCloud.Example.Com');

      middleware(req, mockRes, nextSpy);

      expect(req.isVhostProxy).to.equal(true);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      mockConfigManager = {
        getProxyHost: () => 'proxy.example.com',
        getHost: () => 'mycloud.example.com',
      };
    });

    it('should handle undefined hostname', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);
      const req = createReq(undefined);

      middleware(req, mockRes, nextSpy);

      expect(req.isVhostProxy).to.be.undefined;
      expect(nextSpy.calledOnce).to.be.true;
    });

    it('should always call next()', () => {
      const middleware = createVhostDetection(mockConfigManager as SystemConfigManager);

      // With matching host
      const req1 = createReq('proxy.example.com');
      middleware(req1, mockRes, nextSpy);

      // With non-matching host
      const req2 = createReq('other.example.com');
      middleware(req2, mockRes, nextSpy);

      // With no host
      const req3 = createReq(undefined);
      middleware(req3, mockRes, nextSpy);

      expect(nextSpy.callCount).to.equal(3);
    });
  });
});

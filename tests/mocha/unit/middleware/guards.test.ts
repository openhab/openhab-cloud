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
import type { Request, Response } from 'express';
import {
  createLoginRedirectAuthenticated,
  createApplyReturnTo,
} from '../../../../src/middleware/guards';

interface MockReqInput {
  method?: string;
  hostname?: string;
  originalUrl?: string;
  protocol?: string;
  authenticated?: boolean;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  session?: Record<string, unknown>;
}

function buildReq(input: MockReqInput = {}): Request {
  return {
    method: input.method ?? 'GET',
    hostname: input.hostname ?? 'connect.example.com',
    originalUrl: input.originalUrl ?? '/',
    protocol: input.protocol ?? 'https',
    isAuthenticated: () => Boolean(input.authenticated),
    query: input.query ?? {},
    body: input.body ?? {},
    session: input.session ?? {},
  } as unknown as Request;
}

function buildRes(): { res: Response; redirectSpy: sinon.SinonSpy; sendStatusSpy: sinon.SinonSpy } {
  const redirectSpy = sinon.spy();
  const sendStatusSpy = sinon.spy();
  const res = {
    redirect: redirectSpy,
    sendStatus: sendStatusSpy,
  } as unknown as Response;
  return { res, redirectSpy, sendStatusSpy };
}

describe('createLoginRedirectAuthenticated', () => {
  const config = { getHost: () => 'mycloud.example.com' };

  afterEach(() => {
    sinon.restore();
  });

  it('calls next when the user is authenticated', () => {
    const guard = createLoginRedirectAuthenticated(config);
    const req = buildReq({ authenticated: true });
    const { res, redirectSpy, sendStatusSpy } = buildRes();
    const next = sinon.spy();

    guard(req, res, next);

    expect(next.calledOnce).to.be.true;
    expect(redirectSpy.called).to.be.false;
    expect(sendStatusSpy.called).to.be.false;
  });

  it('redirects an unauthenticated GET to the main-site login with encoded returnTo', () => {
    const guard = createLoginRedirectAuthenticated(config);
    const req = buildReq({
      method: 'GET',
      hostname: 'connect.example.com',
      originalUrl: '/basicui/app?sitemap=default',
    });
    const { res, redirectSpy } = buildRes();
    const next = sinon.spy();

    guard(req, res, next);

    expect(next.called).to.be.false;
    expect(redirectSpy.calledOnce).to.be.true;
    const target = redirectSpy.firstCall.args[0] as string;
    expect(target.startsWith('https://mycloud.example.com/login?returnTo=')).to.be.true;
    const returnTo = decodeURIComponent(target.split('returnTo=')[1]!);
    expect(returnTo).to.equal('https://connect.example.com/basicui/app?sitemap=default');
  });

  it('returns 401 for an unauthenticated non-GET request', () => {
    const guard = createLoginRedirectAuthenticated(config);
    const req = buildReq({ method: 'POST' });
    const { res, redirectSpy, sendStatusSpy } = buildRes();
    const next = sinon.spy();

    guard(req, res, next);

    expect(next.called).to.be.false;
    expect(redirectSpy.called).to.be.false;
    expect(sendStatusSpy.calledOnceWith(401)).to.be.true;
  });

  it('preserves the request path and query string in returnTo', () => {
    const guard = createLoginRedirectAuthenticated(config);
    const req = buildReq({
      hostname: 'mycloud.example.com',
      originalUrl: '/paperui/index.html#/inbox',
    });
    const { res, redirectSpy } = buildRes();

    guard(req, res, sinon.spy());

    const target = redirectSpy.firstCall.args[0] as string;
    const returnTo = decodeURIComponent(target.split('returnTo=')[1]!);
    expect(returnTo).to.equal('https://mycloud.example.com/paperui/index.html#/inbox');
  });
});

describe('createApplyReturnTo', () => {
  const config = {
    getHost: () => 'mycloud.example.com',
    getProxyHost: () => 'home.example.com',
    getBrowserProxyHost: () => 'connect.example.com' as string | undefined,
  };

  it('accepts an absolute URL to the main host', () => {
    const handler = createApplyReturnTo(config);
    const session: Record<string, unknown> = {};
    const req = buildReq({
      query: { returnTo: 'https://mycloud.example.com/account' },
      session,
    });
    const { res } = buildRes();
    const next = sinon.spy();

    handler(req, res, next);

    expect(session['returnTo']).to.equal('https://mycloud.example.com/account');
    expect(next.calledOnce).to.be.true;
  });

  it('accepts an absolute URL to the proxy host', () => {
    const handler = createApplyReturnTo(config);
    const session: Record<string, unknown> = {};
    const req = buildReq({
      query: { returnTo: 'https://home.example.com/rest/items' },
      session,
    });

    handler(req, buildRes().res, sinon.spy());

    expect(session['returnTo']).to.equal('https://home.example.com/rest/items');
  });

  it('accepts an absolute URL to the browser proxy host', () => {
    const handler = createApplyReturnTo(config);
    const session: Record<string, unknown> = {};
    const req = buildReq({
      query: { returnTo: 'https://connect.example.com/basicui/app' },
      session,
    });

    handler(req, buildRes().res, sinon.spy());

    expect(session['returnTo']).to.equal('https://connect.example.com/basicui/app');
  });

  it('rejects absolute URLs to unrelated hosts', () => {
    const handler = createApplyReturnTo(config);
    const session: Record<string, unknown> = {};
    const req = buildReq({
      query: { returnTo: 'https://evil.example.com/phish' },
      session,
    });

    handler(req, buildRes().res, sinon.spy());

    expect(session['returnTo']).to.be.undefined;
  });

  it('ignores malformed URLs silently', () => {
    const handler = createApplyReturnTo(config);
    const session: Record<string, unknown> = {};
    const req = buildReq({
      query: { returnTo: 'not-a-url' },
      session,
    });

    handler(req, buildRes().res, sinon.spy());

    expect(session['returnTo']).to.be.undefined;
  });

  it('reads returnTo from the request body when not in query', () => {
    const handler = createApplyReturnTo(config);
    const session: Record<string, unknown> = {};
    const req = buildReq({
      body: { returnTo: 'https://connect.example.com/path' },
      session,
    });

    handler(req, buildRes().res, sinon.spy());

    expect(session['returnTo']).to.equal('https://connect.example.com/path');
  });

  it('treats hostname comparison as case-insensitive', () => {
    const handler = createApplyReturnTo(config);
    const session: Record<string, unknown> = {};
    const req = buildReq({
      query: { returnTo: 'https://Connect.Example.Com/foo' },
      session,
    });

    handler(req, buildRes().res, sinon.spy());

    expect(session['returnTo']).to.equal('https://connect.example.com/foo');
  });

  it('does not trust a browser proxy host match when none is configured', () => {
    const handler = createApplyReturnTo({
      getHost: () => 'mycloud.example.com',
      getProxyHost: () => 'home.example.com',
      getBrowserProxyHost: () => undefined,
    });
    const session: Record<string, unknown> = {};
    const req = buildReq({
      query: { returnTo: 'https://connect.example.com/x' },
      session,
    });

    handler(req, buildRes().res, sinon.spy());

    expect(session['returnTo']).to.be.undefined;
  });
});

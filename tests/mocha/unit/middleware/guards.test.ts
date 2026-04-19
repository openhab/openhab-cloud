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
import passport from 'passport';
import {
  createBrowserAwareAuthenticated,
  createApplyReturnTo,
} from '../../../../src/middleware/guards';

interface MockReqInput {
  method?: string;
  headers?: Record<string, string>;
  hostname?: string;
  originalUrl?: string;
  protocol?: string;
  authenticated?: boolean;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  session?: Record<string, unknown>;
}

function buildReq(input: MockReqInput = {}): Request {
  const headers = input.headers ?? {};
  const lowered: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    lowered[k.toLowerCase()] = v;
  }
  // Minimal shim matching Express's req.accepts for the headers we actually
  // exercise here. When Accept is */*  or missing, both types match equally
  // and the first entry of the preference list wins — mirroring Express's
  // quality-based ordering.
  const accepts = (types: string | string[]) => {
    const arr = Array.isArray(types) ? types : [types];
    const accept = lowered['accept'];
    if (!accept || accept.includes('*/*')) return arr[0] ?? false;
    const wantsHtml = accept.includes('text/html');
    const wantsJson = accept.includes('application/json');
    for (const t of arr) {
      if (t === 'html' && wantsHtml) return 'html';
      if (t === 'json' && wantsJson) return 'json';
    }
    return false;
  };

  return {
    method: input.method ?? 'GET',
    hostname: input.hostname ?? 'connect.example.com',
    originalUrl: input.originalUrl ?? '/',
    protocol: input.protocol ?? 'https',
    isAuthenticated: () => Boolean(input.authenticated),
    query: input.query ?? {},
    body: input.body ?? {},
    session: input.session ?? {},
    get: (name: string) => lowered[name.toLowerCase()],
    accepts,
  } as unknown as Request;
}

function buildRes(): { res: Response; redirectSpy: sinon.SinonSpy; statusSpy: sinon.SinonSpy } {
  const redirectSpy = sinon.spy();
  const statusSpy = sinon.spy(() => ({ end: sinon.spy(), send: sinon.spy() }));
  const res = {
    redirect: redirectSpy,
    status: statusSpy,
  } as unknown as Response;
  return { res, redirectSpy, statusSpy };
}

describe('createBrowserAwareAuthenticated', () => {
  const config = { getHost: () => 'mycloud.example.com' };
  let passportStub: sinon.SinonStub;

  beforeEach(() => {
    // Stub passport.authenticate to track delegation to Basic/Bearer
    passportStub = sinon.stub(passport, 'authenticate').returns(((
      _req: Request,
      _res: Response,
      next: NextFunction
    ) => {
      next();
    }) as unknown as ReturnType<typeof passport.authenticate>);
  });

  afterEach(() => {
    sinon.restore();
  });

  it('calls next when already authenticated, without touching Passport', () => {
    const guard = createBrowserAwareAuthenticated(config);
    const req = buildReq({ authenticated: true });
    const { res } = buildRes();
    const next = sinon.spy();

    guard(req, res, next);

    expect(next.calledOnce).to.be.true;
    expect(passportStub.called).to.be.false;
  });

  it('redirects GET with Sec-Fetch-Dest: document to main-site login', () => {
    const guard = createBrowserAwareAuthenticated(config);
    const req = buildReq({
      method: 'GET',
      hostname: 'connect.example.com',
      originalUrl: '/basicui/app',
      headers: { 'sec-fetch-dest': 'document' },
    });
    const { res, redirectSpy } = buildRes();
    const next = sinon.spy();

    guard(req, res, next);

    expect(next.called).to.be.false;
    expect(passportStub.called).to.be.false;
    expect(redirectSpy.calledOnce).to.be.true;
    const target = redirectSpy.firstCall.args[0] as string;
    expect(target).to.include('https://mycloud.example.com/login?returnTo=');
    const returnTo = decodeURIComponent(target.split('returnTo=')[1]!);
    expect(returnTo).to.equal('https://connect.example.com/basicui/app');
  });

  it('redirects GET with Sec-Fetch-Mode: navigate', () => {
    const guard = createBrowserAwareAuthenticated(config);
    const req = buildReq({
      method: 'GET',
      headers: { 'sec-fetch-mode': 'navigate' },
    });
    const { res, redirectSpy } = buildRes();

    guard(req, res, sinon.spy());

    expect(redirectSpy.calledOnce).to.be.true;
  });

  it('redirects GET with Accept: text/html when Sec-Fetch-* absent', () => {
    const guard = createBrowserAwareAuthenticated(config);
    const req = buildReq({
      method: 'GET',
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    const { res, redirectSpy } = buildRes();

    guard(req, res, sinon.spy());

    expect(redirectSpy.calledOnce).to.be.true;
  });

  it('delegates to Passport when Accept is application/json', () => {
    const guard = createBrowserAwareAuthenticated(config);
    const req = buildReq({
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    const { res, redirectSpy } = buildRes();
    const next = sinon.spy();

    guard(req, res, next);

    expect(redirectSpy.called).to.be.false;
    expect(passportStub.calledOnceWith(['basic', 'bearer'], { session: false })).to.be.true;
  });

  it('delegates to Passport for POST regardless of Accept', () => {
    const guard = createBrowserAwareAuthenticated(config);
    const req = buildReq({
      method: 'POST',
      headers: { accept: 'text/html', 'sec-fetch-dest': 'document' },
    });
    const { res, redirectSpy } = buildRes();

    guard(req, res, sinon.spy());

    expect(redirectSpy.called).to.be.false;
    expect(passportStub.calledOnce).to.be.true;
  });

  it('delegates to Passport for GET with no browser navigation signals', () => {
    const guard = createBrowserAwareAuthenticated(config);
    const req = buildReq({ method: 'GET', headers: {} });
    const { res, redirectSpy } = buildRes();

    guard(req, res, sinon.spy());

    expect(redirectSpy.called).to.be.false;
    expect(passportStub.calledOnce).to.be.true;
  });

  it("delegates to Passport for curl-style Accept: */*", () => {
    const guard = createBrowserAwareAuthenticated(config);
    const req = buildReq({ method: 'GET', headers: { accept: '*/*' } });
    const { res, redirectSpy } = buildRes();

    guard(req, res, sinon.spy());

    expect(redirectSpy.called).to.be.false;
    expect(passportStub.calledOnce).to.be.true;
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

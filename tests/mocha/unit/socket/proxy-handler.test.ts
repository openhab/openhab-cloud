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
import { Types } from 'mongoose';
import { ProxyHandler } from '../../../../src/socket/proxy-handler';
import type { RequestTracker } from '../../../../src/socket/request-tracker';
import type { WebSocketTracker } from '../../../../src/socket/websocket-tracker';
import type { OpenhabSocket, ResponseHeaderData } from '../../../../src/socket/types';
import type { IOpenhab } from '../../../../src/types/models';
import type { Server as SocketIOServer } from 'socket.io';

describe('ProxyHandler WebSocket upgrade', () => {
  const uuid = 'test-uuid-1';
  const requestId = 42;

  let handler: ProxyHandler;
  let clientSocket: { write: sinon.SinonStub; [key: string]: unknown };
  let response: { socket: unknown; headersSent: boolean; getHeader: sinon.SinonStub };
  let openhabSocket: OpenhabSocket;
  let webSocketTracker: { add: sinon.SinonStub };

  const upgradeData: ResponseHeaderData = {
    id: requestId,
    responseStatusCode: 101,
    responseStatusText: 'Switching Protocols',
    headers: {
      'Upgrade': 'websocket',
      'Connection': 'Upgrade',
      'Sec-WebSocket-Accept': 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
    },
  } as ResponseHeaderData;

  // The written 101 is a raw byte string, so assertions read it back as text.
  const writtenResponse = (): string => clientSocket.write.firstCall.args[0] as string;

  beforeEach(() => {
    clientSocket = {
      destroyed: false,
      write: sinon.stub(),
      removeAllListeners: sinon.stub(),
      setTimeout: sinon.stub(),
      setNoDelay: sinon.stub(),
      resume: sinon.stub(),
      on: sinon.stub(),
    };

    response = {
      socket: clientSocket,
      headersSent: false,
      getHeader: sinon.stub().returns(undefined),
    };

    const openhab = {
      _id: new Types.ObjectId(),
      uuid,
    } as IOpenhab;

    const requestTracker = {
      has: sinon.stub().returns(true),
      get: sinon.stub().returns({ openhab, response, headersSent: false }),
      safeRemove: sinon.stub(),
      markHeadersSent: sinon.stub(),
    };

    webSocketTracker = { add: sinon.stub() };

    openhabSocket = {
      handshake: { uuid },
      emit: sinon.stub(),
    } as unknown as OpenhabSocket;

    handler = new ProxyHandler(
      requestTracker as unknown as RequestTracker,
      webSocketTracker as unknown as WebSocketTracker,
      {} as SocketIOServer,
      { info: sinon.stub(), warn: sinon.stub(), error: sinon.stub(), debug: sinon.stub() }
    );
  });

  afterEach(() => {
    sinon.restore();
  });

  it('carries staged cookies into the 101 response', () => {
    response.getHeader.withArgs('set-cookie').returns([
      'CloudServer=node2.internal%3A3001; Max-Age=900; Path=/; HttpOnly',
      'X-OPENHAB-AUTH-HEADER=true; Path=/',
    ]);

    handler.handleResponseHeader(openhabSocket, upgradeData);

    const raw = writtenResponse();
    expect(raw).to.contain('HTTP/1.1 101 Switching Protocols');
    expect(raw).to.contain('Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
    expect(raw).to.contain('Set-Cookie: CloudServer=node2.internal%3A3001; Max-Age=900; Path=/; HttpOnly');
    expect(raw).to.contain('Set-Cookie: X-OPENHAB-AUTH-HEADER=true; Path=/');
    expect(raw.endsWith('\r\n\r\n')).to.be.true;
    expect(webSocketTracker.add.calledOnce).to.be.true;
  });

  it('accepts a single staged cookie value', () => {
    response.getHeader.withArgs('set-cookie').returns('CloudServer=node2.internal%3A3001; Path=/');

    handler.handleResponseHeader(openhabSocket, upgradeData);

    expect(writtenResponse()).to.contain('Set-Cookie: CloudServer=node2.internal%3A3001; Path=/');
  });

  it('writes no Set-Cookie when nothing was staged', () => {
    handler.handleResponseHeader(openhabSocket, upgradeData);

    expect(writtenResponse()).to.not.contain('Set-Cookie');
  });

  it('strips CRLF from staged cookies to prevent response splitting', () => {
    response.getHeader.withArgs('set-cookie').returns([
      'CloudServer=evil\r\nX-Injected: yes',
    ]);

    handler.handleResponseHeader(openhabSocket, upgradeData);

    const raw = writtenResponse();
    expect(raw).to.contain('Set-Cookie: CloudServer=evilX-Injected: yes');
    expect(raw.split('\r\n').filter((line) => line.startsWith('X-Injected'))).to.be.empty;
  });
});

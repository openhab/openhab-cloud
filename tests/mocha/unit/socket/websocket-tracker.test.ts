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
import { WebSocketTracker } from '../../../../src/socket/websocket-tracker';
import type { IOpenhab } from '../../../../src/types/models';
import type { Socket as NetSocket } from 'net';

describe('WebSocketTracker', () => {
  let tracker: WebSocketTracker;
  let mockOpenhab: IOpenhab;
  let mockOpenhab2: IOpenhab;
  let mockSocket: Partial<NetSocket>;
  let mockSocket2: Partial<NetSocket>;

  beforeEach(() => {
    tracker = new WebSocketTracker();

    mockOpenhab = {
      _id: new Types.ObjectId(),
      uuid: 'test-uuid-1',
      secret: 'test-secret',
      account: new Types.ObjectId(),
    } as IOpenhab;

    mockOpenhab2 = {
      _id: new Types.ObjectId(),
      uuid: 'test-uuid-2',
      secret: 'test-secret-2',
      account: new Types.ObjectId(),
    } as IOpenhab;

    mockSocket = {
      destroyed: false,
      destroy: sinon.stub(),
    };

    mockSocket2 = {
      destroyed: false,
      destroy: sinon.stub(),
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('size', () => {
    it('should return 0 for empty tracker', () => {
      expect(tracker.size()).to.equal(0);
    });

    it('should return correct count after adding connections', () => {
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      tracker.add(2, mockOpenhab, mockSocket as NetSocket);
      expect(tracker.size()).to.equal(2);
    });
  });

  describe('has', () => {
    it('should return false for non-existent request ID', () => {
      expect(tracker.has(999)).to.be.false;
    });

    it('should return true for tracked request ID', () => {
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      expect(tracker.has(1)).to.be.true;
    });
  });

  describe('get', () => {
    it('should return tracked connection', () => {
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      const conn = tracker.get(1);
      expect(conn.openhab).to.equal(mockOpenhab);
      expect(conn.socket).to.equal(mockSocket);
      expect(conn.requestId).to.equal(1);
      expect(conn.createdAt).to.be.instanceOf(Date);
    });

    it('should throw RangeError for non-existent request ID', () => {
      expect(() => tracker.get(999)).to.throw(RangeError);
    });
  });

  describe('add', () => {
    it('should add a connection', () => {
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      expect(tracker.size()).to.equal(1);
      expect(tracker.has(1)).to.be.true;
    });

    it('should overwrite existing connection with same request ID', () => {
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      tracker.add(1, mockOpenhab2, mockSocket2 as NetSocket);
      expect(tracker.size()).to.equal(1);
      expect(tracker.get(1).openhab).to.equal(mockOpenhab2);
    });
  });

  describe('remove', () => {
    it('should remove a tracked connection', () => {
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      const result = tracker.remove(1);
      expect(result).to.be.true;
      expect(tracker.size()).to.equal(0);
    });

    it('should return false for non-existent request ID', () => {
      const result = tracker.remove(999);
      expect(result).to.be.false;
    });
  });

  describe('removeAllForUuid', () => {
    it('should remove all connections for a given UUID', () => {
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      tracker.add(2, mockOpenhab, mockSocket2 as NetSocket);
      tracker.add(3, mockOpenhab2, mockSocket as NetSocket);

      const count = tracker.removeAllForUuid('test-uuid-1');
      expect(count).to.equal(2);
      expect(tracker.size()).to.equal(1);
      expect(tracker.has(3)).to.be.true;
    });

    it('should destroy sockets when removing', () => {
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      tracker.removeAllForUuid('test-uuid-1');
      expect((mockSocket.destroy as sinon.SinonStub).calledOnce).to.be.true;
    });

    it('should not destroy already-destroyed sockets', () => {
      mockSocket.destroyed = true;
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      tracker.removeAllForUuid('test-uuid-1');
      expect((mockSocket.destroy as sinon.SinonStub).called).to.be.false;
    });

    it('should return 0 when no connections match', () => {
      tracker.add(1, mockOpenhab, mockSocket as NetSocket);
      const count = tracker.removeAllForUuid('non-existent-uuid');
      expect(count).to.equal(0);
      expect(tracker.size()).to.equal(1);
    });

    it('should return 0 for empty tracker', () => {
      const count = tracker.removeAllForUuid('test-uuid-1');
      expect(count).to.equal(0);
    });
  });
});

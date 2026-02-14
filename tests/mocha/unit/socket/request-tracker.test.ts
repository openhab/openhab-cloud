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
import { RequestTracker } from '../../../../src/socket/request-tracker';
import type { IOpenhab } from '../../../../src/types/models';
import type { Response } from 'express';

describe('RequestTracker', () => {
  let requestTracker: RequestTracker;
  let mockOpenhab: IOpenhab;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    requestTracker = new RequestTracker();

    mockOpenhab = {
      _id: new Types.ObjectId(),
      uuid: 'test-uuid',
      secret: 'test-secret',
      account: new Types.ObjectId(),
    } as IOpenhab;

    mockResponse = {
      writeHead: sinon.stub(),
      write: sinon.stub(),
      end: sinon.stub(),
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('size', () => {
    it('should return 0 for empty tracker', () => {
      expect(requestTracker.size()).to.equal(0);
    });

    it('should return correct count after adding requests', () => {
      requestTracker.add(mockOpenhab, mockResponse as Response);
      requestTracker.add(mockOpenhab, mockResponse as Response);
      expect(requestTracker.size()).to.equal(2);
    });
  });

  describe('acquireRequestId', () => {
    it('should return incrementing IDs', () => {
      const id1 = requestTracker.acquireRequestId();
      const id2 = requestTracker.acquireRequestId();
      const id3 = requestTracker.acquireRequestId();

      expect(id1).to.be.a('number');
      expect(id2).to.equal(id1 + 1);
      expect(id3).to.equal(id2 + 1);
    });
  });

  describe('add', () => {
    it('should add request and return ID', () => {
      const id = requestTracker.add(mockOpenhab, mockResponse as Response);

      expect(id).to.be.a('number');
      expect(requestTracker.has(id)).to.be.true;
    });

    it('should use provided ID when given', () => {
      const customId = 999;
      const id = requestTracker.add(mockOpenhab, mockResponse as Response, customId);

      expect(id).to.equal(customId);
      expect(requestTracker.has(customId)).to.be.true;
    });

    it('should store correct request data', () => {
      const id = requestTracker.add(mockOpenhab, mockResponse as Response);

      const request = requestTracker.get(id);
      expect(request.openhab).to.equal(mockOpenhab);
      expect(request.response).to.equal(mockResponse);
      expect(request.headersSent).to.be.false;
      expect(request.finished).to.be.false;
      expect(request.createdAt).to.be.instanceOf(Date);
    });
  });

  describe('has', () => {
    it('should return true for existing request', () => {
      const id = requestTracker.add(mockOpenhab, mockResponse as Response);
      expect(requestTracker.has(id)).to.be.true;
    });

    it('should return false for non-existing request', () => {
      expect(requestTracker.has(999)).to.be.false;
    });
  });

  describe('get', () => {
    it('should return request for existing ID', () => {
      const id = requestTracker.add(mockOpenhab, mockResponse as Response);
      const request = requestTracker.get(id);

      expect(request).to.exist;
      expect(request.openhab).to.equal(mockOpenhab);
    });

    it('should throw RangeError for non-existing ID', () => {
      expect(() => requestTracker.get(999)).to.throw(RangeError);
    });
  });

  describe('getAll', () => {
    it('should return all tracked requests', () => {
      const id1 = requestTracker.add(mockOpenhab, mockResponse as Response);
      const id2 = requestTracker.add(mockOpenhab, mockResponse as Response);

      const all = requestTracker.getAll();
      expect(all).to.be.instanceOf(Map);
      expect(all.size).to.equal(2);
      expect(all.has(id1)).to.be.true;
      expect(all.has(id2)).to.be.true;
    });
  });

  describe('remove', () => {
    it('should remove existing request', () => {
      const id = requestTracker.add(mockOpenhab, mockResponse as Response);
      requestTracker.remove(id);

      expect(requestTracker.has(id)).to.be.false;
    });

    it('should throw RangeError for non-existing ID', () => {
      expect(() => requestTracker.remove(999)).to.throw(RangeError);
    });
  });

  describe('safeRemove', () => {
    it('should remove existing request and return true', () => {
      const id = requestTracker.add(mockOpenhab, mockResponse as Response);
      const result = requestTracker.safeRemove(id);

      expect(result).to.be.true;
      expect(requestTracker.has(id)).to.be.false;
    });

    it('should return false for non-existing ID without throwing', () => {
      const result = requestTracker.safeRemove(999);
      expect(result).to.be.false;
    });
  });

  describe('markHeadersSent', () => {
    it('should mark headers as sent', () => {
      const id = requestTracker.add(mockOpenhab, mockResponse as Response);
      requestTracker.markHeadersSent(id);

      const request = requestTracker.get(id);
      expect(request.headersSent).to.be.true;
    });

    it('should not throw for non-existing ID', () => {
      expect(() => requestTracker.markHeadersSent(999)).to.not.throw();
    });
  });

  describe('markFinished', () => {
    it('should mark request as finished', () => {
      const id = requestTracker.add(mockOpenhab, mockResponse as Response);
      requestTracker.markFinished(id);

      const request = requestTracker.get(id);
      expect(request.finished).to.be.true;
    });

    it('should not throw for non-existing ID', () => {
      expect(() => requestTracker.markFinished(999)).to.not.throw();
    });
  });

  describe('cleanupOrphaned', () => {
    it('should remove finished requests and return their IDs and UUIDs', () => {
      const id1 = requestTracker.add(mockOpenhab, mockResponse as Response);
      const id2 = requestTracker.add(mockOpenhab, mockResponse as Response);
      const id3 = requestTracker.add(mockOpenhab, mockResponse as Response);

      requestTracker.markFinished(id1);
      requestTracker.markFinished(id3);

      const removed = requestTracker.cleanupOrphaned();

      const removedIds = removed.map(r => r.requestId);
      expect(removedIds).to.include(id1);
      expect(removedIds).to.include(id3);
      expect(removedIds).to.not.include(id2);
      expect(requestTracker.has(id1)).to.be.false;
      expect(requestTracker.has(id2)).to.be.true;
      expect(requestTracker.has(id3)).to.be.false;

      // Verify UUID is included
      expect(removed[0]!.openhabUuid).to.equal('test-uuid');
    });

    it('should return empty array when no orphaned requests', () => {
      requestTracker.add(mockOpenhab, mockResponse as Response);

      const removed = requestTracker.cleanupOrphaned();
      expect(removed).to.be.empty;
    });
  });

  describe('cleanupStale', () => {
    it('should remove requests older than max age', () => {
      const id1 = requestTracker.add(mockOpenhab, mockResponse as Response);

      // Manually set old creation time
      const request = requestTracker.get(id1);
      request.createdAt = new Date(Date.now() - 120000); // 2 minutes ago

      const id2 = requestTracker.add(mockOpenhab, mockResponse as Response);

      const removed = requestTracker.cleanupStale(60000); // 1 minute max age

      expect(removed).to.include(id1);
      expect(removed).to.not.include(id2);
      expect(requestTracker.has(id1)).to.be.false;
      expect(requestTracker.has(id2)).to.be.true;
    });
  });
});

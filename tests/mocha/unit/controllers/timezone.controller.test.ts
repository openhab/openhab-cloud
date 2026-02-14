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
import { TimezoneController } from '../../../../src/controllers/timezone.controller';
import type { Request, Response } from 'express';

describe('TimezoneController', () => {
  let controller: TimezoneController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let statusStub: sinon.SinonStub;
  let sendStub: sinon.SinonStub;
  let mockSession: { timezone?: string };

  beforeEach(() => {
    controller = new TimezoneController();

    mockSession = {};
    mockReq = {
      query: {},
      session: mockSession as Request['session'],
    };

    sendStub = sinon.stub();
    statusStub = sinon.stub().returns({ send: sendStub });
    mockRes = {
      status: statusStub,
      send: sendStub,
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('setTimezone', () => {
    it('should set timezone in session from query parameter', () => {
      mockReq.query = { tz: 'America/New_York' };

      controller.setTimezone(mockReq as Request, mockRes as Response, () => {});

      expect(mockSession.timezone).to.equal('America/New_York');
    });

    it('should respond with 200 and success message', () => {
      mockReq.query = { tz: 'Europe/London' };

      controller.setTimezone(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(sendStub.calledWith('Timezone set')).to.be.true;
    });

    it('should not set timezone when tz parameter is missing', () => {
      mockReq.query = {};

      controller.setTimezone(mockReq as Request, mockRes as Response, () => {});

      expect(mockSession.timezone).to.be.undefined;
      expect(statusStub.calledWith(200)).to.be.true;
    });

    it('should not set timezone when tz parameter is not a string', () => {
      mockReq.query = { tz: ['array', 'value'] };

      controller.setTimezone(mockReq as Request, mockRes as Response, () => {});

      expect(mockSession.timezone).to.be.undefined;
    });

    it('should handle various timezone formats', () => {
      const timezones = [
        'UTC',
        'America/Los_Angeles',
        'Asia/Tokyo',
        'Europe/Paris',
        'Australia/Sydney',
      ];

      for (const tz of timezones) {
        mockSession = {};
        mockReq.session = mockSession as Request['session'];
        mockReq.query = { tz };

        controller.setTimezone(mockReq as Request, mockRes as Response, () => {});

        expect(mockSession.timezone).to.equal(tz);
      }
    });
  });
});

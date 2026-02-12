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
import mongoose from 'mongoose';
import { HealthController } from '../../../../src/controllers/health.controller';
import type { HealthControllerConfig } from '../../../../src/controllers/health.controller';
import type { Request, Response } from 'express';

describe('HealthController', () => {
  let controller: HealthController;
  let config: HealthControllerConfig;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let connectionStub: sinon.SinonStub;
  let statusStub: sinon.SinonStub;
  let jsonStub: sinon.SinonStub;
  let sendStub: sinon.SinonStub;

  beforeEach(() => {
    config = {
      isEnabled: () => true,
    };
    controller = new HealthController(config);

    mockReq = {};
    jsonStub = sinon.stub();
    sendStub = sinon.stub();
    statusStub = sinon.stub().returns({ json: jsonStub, send: sendStub });
    mockRes = {
      status: statusStub,
      json: jsonStub,
      send: sendStub,
    };

    // Stub mongoose connection readyState
    connectionStub = sinon.stub(mongoose.connection, 'readyState');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('getHealth', () => {
    it('should return 404 when health check is disabled', () => {
      config.isEnabled = () => false;
      controller = new HealthController(config);

      controller.getHealth(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(404)).to.be.true;
      expect(sendStub.calledWith('not found')).to.be.true;
    });

    it('should return 200 with OK status when mongoose is connected', () => {
      connectionStub.value(1); // 1 = connected

      controller.getHealth(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(200)).to.be.true;
      expect(jsonStub.calledOnce).to.be.true;

      const response = jsonStub.firstCall.args[0];
      expect(response.status).to.equal('OK');
      expect(response.mongoose).to.equal(1);
      expect(response.errors).to.be.undefined;
    });

    it('should return 500 with error when mongoose is disconnected', () => {
      connectionStub.value(0); // 0 = disconnected

      controller.getHealth(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(500)).to.be.true;
      expect(jsonStub.calledOnce).to.be.true;

      const response = jsonStub.firstCall.args[0];
      expect(response.status).to.equal('Not OK');
      expect(response.mongoose).to.equal(0);
      expect(response.errors).to.have.lengthOf(1);
      expect(response.errors[0].error).to.equal('DBERROR');
      expect(response.errors[0].message).to.equal('mongodb disconnected');
    });

    it('should return 500 with error when mongoose is connecting', () => {
      connectionStub.value(2); // 2 = connecting

      controller.getHealth(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(500)).to.be.true;

      const response = jsonStub.firstCall.args[0];
      expect(response.status).to.equal('Not OK');
      expect(response.errors[0].message).to.equal('mongodb connecting');
    });

    it('should return 500 with error when mongoose is disconnecting', () => {
      connectionStub.value(3); // 3 = disconnecting

      controller.getHealth(mockReq as Request, mockRes as Response, () => {});

      expect(statusStub.calledWith(500)).to.be.true;

      const response = jsonStub.firstCall.args[0];
      expect(response.status).to.equal('Not OK');
      expect(response.errors[0].message).to.equal('mongodb disconnecting');
    });
  });
});

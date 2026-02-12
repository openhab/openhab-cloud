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
import { HomepageController } from '../../../../src/controllers/homepage.controller';
import type { Request, Response } from 'express';

describe('HomepageController', () => {
  let controller: HomepageController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let renderStub: sinon.SinonStub;
  let flashStub: sinon.SinonStub;

  beforeEach(() => {
    controller = new HomepageController();

    flashStub = sinon.stub();
    flashStub.withArgs('error').returns(['Error message']);
    flashStub.withArgs('info').returns(['Info message']);

    mockReq = {
      user: { _id: 'user123', username: 'testuser' } as Express.User,
      flash: flashStub,
    };

    renderStub = sinon.stub();
    mockRes = {
      render: renderStub,
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('index', () => {
    it('should render index template with correct title', () => {
      controller.index(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      expect(renderStub.firstCall.args[0]).to.equal('index');
      expect(renderStub.firstCall.args[1].title).to.equal('Home');
    });

    it('should pass user to template', () => {
      controller.index(mockReq as Request, mockRes as Response, () => {});

      const templateData = renderStub.firstCall.args[1];
      expect(templateData.user).to.equal(mockReq.user);
    });

    it('should pass flash error messages to template', () => {
      controller.index(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('error')).to.be.true;
      const templateData = renderStub.firstCall.args[1];
      expect(templateData.errormessages).to.deep.equal(['Error message']);
    });

    it('should pass flash info messages to template', () => {
      controller.index(mockReq as Request, mockRes as Response, () => {});

      expect(flashStub.calledWith('info')).to.be.true;
      const templateData = renderStub.firstCall.args[1];
      expect(templateData.infomessages).to.deep.equal(['Info message']);
    });

    it('should work without authenticated user', () => {
      mockReq.user = undefined;

      controller.index(mockReq as Request, mockRes as Response, () => {});

      expect(renderStub.calledOnce).to.be.true;
      const templateData = renderStub.firstCall.args[1];
      expect(templateData.user).to.be.undefined;
    });
  });
});

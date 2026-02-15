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

import type { RequestHandler, Request } from 'express';
import type { Types } from 'mongoose';
import type { IInvitation } from '../types/models';
import type { ILogger } from '../types/notification';
import type { ValidatedRequest } from '../middleware/validation.middleware';
import type { InvitationInput } from '../schemas';

/**
 * Repository interface for Invitation operations
 */
export interface IInvitationRepositoryForInvitations {
  send(email: string): Promise<IInvitation>;
}

/**
 * System configuration interface
 */
export interface IInvitationsSystemConfig {
  getBaseURL(): string;
}

/**
 * Invitations Controller
 *
 * Handles invitation routes:
 * - View invitations page
 * - Send new invitations
 */
export class InvitationsController {
  constructor(
    private readonly invitationRepository: IInvitationRepositoryForInvitations,
    private readonly systemConfig: IInvitationsSystemConfig,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /invitations
   *
   * Display invitations page.
   */
  getInvitations: RequestHandler = async (req, res) => {
    try {
      res.render('invitations', {
        title: 'Invitations',
        user: req.user,
        openhab: req.openhab,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting invitations page:', error);
      req.flash('error', 'Error loading invitations');
      res.redirect('/');
    }
  };

  /**
   * POST /invitations
   *
   * Send an invitation to the specified email.
   */
  sendInvitation: RequestHandler = async (req: Request, res) => {
    const typedReq = req as ValidatedRequest<InvitationInput>;

    try {
      const email = typedReq.validatedBody.inviteemail;

      await this.invitationRepository.send(email);
      req.flash('info', 'Invitation sent!');
      res.redirect('/invitations');
    } catch (error) {
      this.logger.error('Error sending invitation:', error);
      req.flash('error', 'There was an error while processing your request');
      res.redirect('/invitations');
    }
  };
}

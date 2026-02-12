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

import type { RequestHandler } from 'express';
import type { Types } from 'mongoose';
import type { IOAuth2Token } from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Repository interface for OAuth2Token operations
 */
export interface IOAuth2TokenRepositoryForApplications {
  findByUserWithClient(userId: string | Types.ObjectId): Promise<IOAuth2Token[]>;
  findByIdAndUser(
    id: string | Types.ObjectId,
    userId: string | Types.ObjectId
  ): Promise<IOAuth2Token | null>;
  deleteById(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Applications Controller
 *
 * Handles OAuth2 application/token management routes.
 */
export class ApplicationsController {
  constructor(
    private readonly oauth2TokenRepository: IOAuth2TokenRepositoryForApplications,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /applications
   *
   * Display list of authorized OAuth2 applications.
   */
  getApplications: RequestHandler = async (req, res) => {
    try {
      if (!req.user) {
        return res.redirect('/login');
      }

      const oauth2tokens = await this.oauth2TokenRepository.findByUserWithClient(req.user._id);

      res.render('applications', {
        oauth2tokens,
        title: 'Applications',
        user: req.user,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting applications:', error);
      req.flash('error', 'Error loading applications');
      res.redirect('/');
    }
  };

  /**
   * GET /applications/:id/delete
   *
   * Delete/revoke an OAuth2 token.
   */
  deleteApplication: RequestHandler = async (req, res) => {
    const idParam = req.params['id'];

    if (!idParam || typeof idParam !== 'string') {
      return res.redirect('/applications');
    }

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(idParam)) {
      req.flash('error', 'Invalid application ID');
      return res.redirect('/applications');
    }

    try {
      if (!req.user) {
        return res.redirect('/login');
      }

      this.logger.info(`Deleting application ${idParam}`);

      const token = await this.oauth2TokenRepository.findByIdAndUser(idParam, req.user._id);

      if (token) {
        await this.oauth2TokenRepository.deleteById(token._id);
        req.flash('info', 'Application access revoked');
      }

      res.redirect('/applications');
    } catch (error) {
      this.logger.error('Error deleting application:', error);
      req.flash('error', 'Error revoking application access');
      res.redirect('/applications');
    }
  };
}

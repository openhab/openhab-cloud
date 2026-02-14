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
import type { IEnrollment, IInvitation, IOAuth2Client } from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Repository interface for Enrollment operations
 */
export interface IEnrollmentRepositoryForStaff {
  findPaginated(options: {
    filter?: Record<string, unknown>;
    limit: number;
    skip: number;
    sort?: Record<string, 'asc' | 'desc'>;
  }): Promise<IEnrollment[]>;
  count(filter?: Record<string, unknown>): Promise<number>;
  findById(id: string | Types.ObjectId): Promise<IEnrollment | null>;
  updateInvited(id: string | Types.ObjectId, invitedAt: Date): Promise<void>;
}

/**
 * Repository interface for Invitation operations (staff)
 */
export interface IInvitationRepositoryForStaff {
  findPaginated(options: {
    filter?: Record<string, unknown>;
    limit: number;
    skip: number;
    sort?: Record<string, 'asc' | 'desc'>;
  }): Promise<IInvitation[]>;
  count(filter?: Record<string, unknown>): Promise<number>;
  findById(id: string | Types.ObjectId): Promise<IInvitation | null>;
  send(email: string): Promise<IInvitation>;
  resend(id: string | Types.ObjectId): Promise<void>;
  deleteById(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Repository interface for OAuth2Client operations
 */
export interface IOAuth2ClientRepositoryForStaff {
  findPaginated(options: {
    limit: number;
    skip: number;
    sort?: Record<string, 'asc' | 'desc'>;
  }): Promise<IOAuth2Client[]>;
  count(): Promise<number>;
}

/**
 * Redis client interface for stats
 */
export interface IRedisClientForStaff {
  mget(keys: string[]): Promise<(string | null)[]>;
}

/**
 * Staff Controller
 *
 * Handles admin/staff routes:
 * - Enrollment management
 * - Stats viewing
 * - Invitation management
 * - OAuth2 client management
 */
export class StaffController {
  private readonly perPage = 20;

  constructor(
    private readonly enrollmentRepository: IEnrollmentRepositoryForStaff,
    private readonly invitationRepository: IInvitationRepositoryForStaff,
    private readonly oauth2ClientRepository: IOAuth2ClientRepositoryForStaff,
    private readonly redis: IRedisClientForStaff,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /staff
   *
   * Display enrollments list with pagination.
   */
  getEnrollments: RequestHandler = async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query['page'] as string) || 0);

      const filter = { invited: null };
      const enrollments = await this.enrollmentRepository.findPaginated({
        filter,
        limit: this.perPage,
        skip: this.perPage * page,
        sort: { created: 'asc' },
      });

      const count = await this.enrollmentRepository.count();

      res.render('staff/staff', {
        enrollments,
        pages: Math.ceil(count / this.perPage),
        page,
        title: 'Enrollments',
        user: req.user,
        openhab: req.openhab,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting enrollments:', error);
      req.flash('error', 'Error loading enrollments');
      res.redirect('/');
    }
  };

  /**
   * GET /staff/stats
   *
   * Display system statistics.
   */
  getStats: RequestHandler = async (req, res) => {
    try {
      const statKeys = [
        'openhabCount',
        'openhabOnlineCount',
        'userCount',
        'invitationUsedCount',
        'invitationUnusedCount',
        'userDeviceCount',
        'last5MinStatTimestamp',
      ];

      const stats = await this.redis.mget(statKeys);

      res.render('staff/stats', {
        openhabCount: stats[0],
        openhabOnlineCount: stats[1],
        userCount: stats[2],
        invitationUsedCount: stats[3],
        invitationUnusedCount: stats[4],
        userDeviceCount: stats[5],
        last5MinStatTimestamp: stats[6],
        title: 'Stats',
        user: req.user,
        openhab: req.openhab,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting stats:', error);
      req.flash('error', 'Error loading stats');
      res.redirect('/staff');
    }
  };

  /**
   * POST /staff/processenroll/:id
   *
   * Process an enrollment by sending an invitation.
   */
  processEnrollment: RequestHandler = async (req, res) => {
    const enrollIdParam = req.params['id'] as string;

    try {
      const enrollment = await this.enrollmentRepository.findById(enrollIdParam);

      if (!enrollment) {
        this.logger.error('Unable to find enrollment');
        req.flash('error', 'There was an error while processing your request');
        return res.redirect('/staff');
      }

      await this.invitationRepository.send(enrollment.email);
      await this.enrollmentRepository.updateInvited(enrollIdParam, new Date());

      req.flash('info', 'Invitation sent!');
      res.redirect('/staff');
    } catch (error) {
      this.logger.error('Error processing enrollment:', error);
      req.flash('error', 'There was an error while processing your request');
      res.redirect('/staff');
    }
  };

  /**
   * GET /staff/invitations
   *
   * Display invitations list with pagination.
   */
  getInvitations: RequestHandler = async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query['page'] as string) || 0);

      const filter: Record<string, unknown> = { used: false };
      const emailQuery = req.query['email'];
      if (emailQuery && typeof emailQuery === 'string') {
        filter['email'] = emailQuery;
      }

      const invitations = await this.invitationRepository.findPaginated({
        filter,
        limit: this.perPage,
        skip: this.perPage * page,
        sort: { created: 'asc' },
      });

      const count = await this.invitationRepository.count();

      res.render('staff/invitations', {
        invitations,
        pages: Math.ceil(count / this.perPage),
        page,
        title: 'Invitations',
        user: req.user,
        openhab: req.openhab,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting invitations:', error);
      req.flash('error', 'Error loading invitations');
      res.redirect('/staff');
    }
  };

  /**
   * POST /staff/invitations/:id/resend
   *
   * Resend an invitation.
   */
  resendInvitation: RequestHandler = async (req, res) => {
    const invitationIdParam = req.params['id'] as string;

    try {
      const invitation = await this.invitationRepository.findById(invitationIdParam);

      if (!invitation) {
        req.flash('error', 'Invitation not found');
        return res.redirect('/staff/invitations');
      }

      await this.invitationRepository.resend(invitationIdParam);
      req.flash('info', 'Invitation was resent!');
      res.redirect('/staff/invitations');
    } catch (error) {
      this.logger.error('Error resending invitation:', error);
      req.flash('error', 'There was an error while processing your request');
      res.redirect('/staff/invitations');
    }
  };

  /**
   * GET /staff/invitations/:id/delete
   *
   * Delete an invitation.
   */
  deleteInvitation: RequestHandler = async (req, res) => {
    const invitationIdParam = req.params['id'] as string;

    try {
      const invitation = await this.invitationRepository.findById(invitationIdParam);

      if (!invitation) {
        req.flash('error', 'Invitation not found');
        return res.redirect('/staff/invitations');
      }

      await this.invitationRepository.deleteById(invitationIdParam);
      req.flash('info', 'Invitation was deleted');
      res.redirect('/staff/invitations');
    } catch (error) {
      this.logger.error('Error deleting invitation:', error);
      req.flash('error', 'There was an error while processing your request');
      res.redirect('/staff/invitations');
    }
  };

  /**
   * GET /staff/oauthclients
   *
   * Display OAuth2 clients list with pagination.
   */
  getOAuthClients: RequestHandler = async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query['page'] as string) || 0);

      const oauthclients = await this.oauth2ClientRepository.findPaginated({
        limit: this.perPage,
        skip: this.perPage * page,
        sort: { created: 'asc' },
      });

      const count = await this.oauth2ClientRepository.count();

      res.render('staff/oauthclients', {
        oauthclients,
        pages: Math.ceil(count / this.perPage),
        page,
        title: 'OAuth Clients',
        user: req.user,
        openhab: req.openhab,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting OAuth clients:', error);
      req.flash('error', 'Error loading OAuth clients');
      res.redirect('/staff');
    }
  };
}

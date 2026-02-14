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
import type { IEvent } from '../types/models';
import type { ILogger } from '../types/notification';

/**
 * Repository interface for Event operations
 */
export interface IEventRepositoryForEvents {
  findByOpenhab(
    openhabId: string | Types.ObjectId,
    options: {
      source?: string;
      limit: number;
      skip: number;
    }
  ): Promise<IEvent[]>;
  count(): Promise<number>;
}

/**
 * Events Controller
 *
 * Handles event viewing routes.
 */
export class EventsController {
  private readonly perPage = 20;

  constructor(
    private readonly eventRepository: IEventRepositoryForEvents,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /events
   *
   * Display paginated events list.
   */
  getEvents: RequestHandler = async (req, res) => {
    try {
      const page = Math.max(0, parseInt(req.query['page'] as string) || 0);
      const source = typeof req.query['source'] === 'string' ? req.query['source'] : undefined;

      if (!req.openhab) {
        req.flash('error', 'openHAB instance not found');
        return res.redirect('/');
      }

      const events = await this.eventRepository.findByOpenhab(req.openhab._id, {
        source,
        limit: this.perPage,
        skip: this.perPage * page,
      });

      const count = await this.eventRepository.count();

      res.render('events', {
        events,
        pages: Math.ceil(count / this.perPage),
        page,
        title: 'Events',
        user: req.user,
        openhab: req.openhab,
        source,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting events:', error);
      req.flash('error', 'Error loading events');
      res.redirect('/');
    }
  };
}

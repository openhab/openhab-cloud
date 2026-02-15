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

import type { RequestHandler, Request, Response, NextFunction } from 'express';
import type { Types } from 'mongoose';
import type { IOpenhab, IItem, IEvent } from '../types/models';
import type { ILogger } from '../types/notification';
import type { ConnectionInfo } from '../types/connection';
import passport from 'passport';

/**
 * Repository interface for Openhab operations
 */
export interface IOpenhabRepositoryForIfttt {
  findByAccount(accountId: string | Types.ObjectId): Promise<IOpenhab | null>;
  getConnectionInfo(openhabId: string | Types.ObjectId): Promise<ConnectionInfo | null>;
}

/**
 * Repository interface for Item operations
 */
export interface IItemRepositoryForIfttt {
  findByOpenhab(openhabId: string | Types.ObjectId): Promise<IItem[]>;
  findByOpenhabAndName(
    openhabId: string | Types.ObjectId,
    name: string
  ): Promise<IItem | null>;
}

/**
 * Repository interface for Event operations
 */
export interface IEventRepositoryForIfttt {
  findByOpenhabAndSource(
    openhabId: string | Types.ObjectId,
    source: string,
    options: {
      status?: string;
      limit: number;
    }
  ): Promise<IEvent[]>;
  findRaisedAbove(
    openhabId: string | Types.ObjectId,
    source: string,
    value: number,
    limit: number
  ): Promise<IEvent[]>;
  findDroppedBelow(
    openhabId: string | Types.ObjectId,
    source: string,
    value: number,
    limit: number
  ): Promise<IEvent[]>;
}

/**
 * Socket emitter interface for sending commands
 */
export interface ISocketEmitterForIfttt {
  emitCommand(uuid: string, item: string, command: string): void;
}

/**
 * IFTTT configuration interface
 */
export interface IIftttConfig {
  getChannelKey(): string;
  getTestToken(): string;
  getBaseURL(): string;
  getInternalAddress(): string;
}

/**
 * IFTTT Controller
 *
 * Handles IFTTT integration API endpoints:
 * - User info
 * - Status
 * - Test setup
 * - Actions (send commands)
 * - Triggers (item state, raised above, dropped below)
 */
export class IftttController {
  constructor(
    private readonly openhabRepository: IOpenhabRepositoryForIfttt,
    private readonly itemRepository: IItemRepositoryForIfttt,
    private readonly eventRepository: IEventRepositoryForIfttt,
    private readonly socketEmitter: ISocketEmitterForIfttt,
    private readonly config: IIftttConfig,
    private readonly logger: ILogger
  ) {}

  /**
   * Middleware to validate IFTTT channel key
   */
  ensureChannelKey: RequestHandler = (req, res, next): void => {
    const channelKey = req.headers['ifttt-channel-key'];
    if (!channelKey) {
      res.status(401).send('Bad request');
      return;
    }
    if (channelKey !== this.config.getChannelKey()) {
      res.status(401).send('Bad request');
      return;
    }
    next();
  };

  /**
   * Middleware for bearer authentication with JSON error responses
   */
  authenticate: RequestHandler = (req, res, next): void => {
    passport.authenticate(
      'bearer',
      { session: false },
      (error: Error | null, user: Express.User | false, _info: unknown) => {
        if (error) {
          res.status(401).json({ errors: [{ message: String(error) }] });
          return;
        }
        if (!user) {
          res.status(401).json({ errors: [{ message: 'Authentication failed' }] });
          return;
        }
        req.logIn(user, loginError => {
          if (loginError) {
            res.status(401).json({ errors: [{ message: String(loginError) }] });
            return;
          }
          next();
        });
      }
    )(req, res, next);
  };

  /**
   * GET /ifttt/v1/user/info
   *
   * Returns user info for IFTTT after successful authorization.
   */
  getUserInfo: RequestHandler = (req, res) => {
    res.json({
      data: {
        name: req.user!.username,
        id: req.user!._id,
        url: this.config.getBaseURL() + '/account',
      },
    });
  };

  /**
   * GET /ifttt/v1/status
   *
   * Status endpoint called periodically by IFTTT.
   */
  getStatus: RequestHandler = (_req, res) => {
    res.send('service OK');
  };

  /**
   * GET /ifttt/v1/test/setup
   *
   * Returns test data for IFTTT API testing.
   */
  getTestSetup: RequestHandler = (_req, res) => {
    res.json({
      data: {
        accessToken: this.config.getTestToken(),
        samples: {
          triggers: {
            itemstate: {
              item: 'Light_GF_Kitchen_Table',
              status: 'ON',
            },
            item_raised_above: {
              item: 'Temperature',
              value: '19',
            },
            item_dropped_below: {
              item: 'Temperature',
              value: '19',
            },
          },
          actions: {
            command: {
              item: 'DemoSwitch',
              command: 'ON',
            },
          },
        },
      },
    });
  };

  /**
   * POST /ifttt/v1/actions/command
   *
   * Send a command to an openHAB item.
   */
  actionCommand: RequestHandler = async (req, res) => {
    try {
      if (!req.body.actionFields) {
        return res.status(400).json({ errors: [{ message: 'No actionfields' }] });
      }

      const { item, command } = req.body.actionFields;
      if (!item || !command) {
        return res.status(400).json({ errors: [{ message: 'Actionfields incomplete' }] });
      }

      const openhab = await this.openhabRepository.findByAccount(req.user!.account);
      if (!openhab) {
        return res.status(400).json({ errors: [{ message: 'Request failed' }] });
      }

      // Check if openHAB is on another server (for clustering)
      const connectionInfo = await this.openhabRepository.getConnectionInfo(openhab._id);
      if (connectionInfo && connectionInfo.serverAddress !== this.config.getInternalAddress()) {
        return res.redirect(307, 'http://' + connectionInfo.serverAddress + req.path);
      }

      this.socketEmitter.emitCommand(openhab.uuid, item, command);
      return res.json({ data: [{ id: '12345' }] });
    } catch (error) {
      this.logger.error('Error in actionCommand:', error);
      return res.status(400).json({ errors: [{ message: 'Request failed' }] });
    }
  };

  /**
   * POST /ifttt/v1/triggers/itemstate
   *
   * Trigger: Item changed to specific state.
   */
  triggerItemState: RequestHandler = async (req, res) => {
    try {
      const eventLimit = req.body.limit ?? 50;

      const openhab = await this.openhabRepository.findByAccount(req.user!.account);
      if (!openhab) {
        return res.status(400).json({ errors: [{ message: 'No openhab' }] });
      }

      if (!req.body.triggerFields) {
        return res.status(400).json({ errors: [{ message: 'No triggerFields' }] });
      }

      const { item: itemName, status: itemStatus } = req.body.triggerFields;

      const item = await this.itemRepository.findByOpenhabAndName(openhab._id, itemName);
      if (!item) {
        return res.status(400).json({ errors: [{ message: 'No item' }] });
      }

      if (eventLimit <= 0) {
        return res.json({ data: [] });
      }

      const events = await this.eventRepository.findByOpenhabAndSource(openhab._id, item.name, {
        status: itemStatus,
        limit: eventLimit,
      });

      const responseData = events.map(event => ({
        item: itemName,
        status: itemStatus,
        created_at: event.when,
        meta: {
          id: event._id,
          timestamp: Math.round(new Date(event.when).getTime() / 1000),
        },
      }));

      return res.json({ data: responseData });
    } catch (error) {
      this.logger.error('Error in triggerItemState:', error);
      return res.status(400).json({ errors: [{ message: 'Error retrieving events' }] });
    }
  };

  /**
   * POST /ifttt/v1/triggers/item_raised_above
   *
   * Trigger: Item value raised above threshold.
   */
  triggerItemRaisedAbove: RequestHandler = async (req, res) => {
    try {
      const eventLimit = req.body.limit ?? 50;

      const openhab = await this.openhabRepository.findByAccount(req.user!.account);
      if (!openhab) {
        return res.status(400).json({ errors: [{ message: 'No openhab' }] });
      }

      if (!req.body.triggerFields) {
        return res.status(400).json({ errors: [{ message: 'No triggerFields' }] });
      }

      const { item: itemName, value } = req.body.triggerFields;

      const item = await this.itemRepository.findByOpenhabAndName(openhab._id, itemName);
      if (!item) {
        return res.status(400).json({ errors: [{ message: 'No item' }] });
      }

      if (eventLimit <= 0) {
        return res.json({ data: [] });
      }

      const events = await this.eventRepository.findRaisedAbove(
        openhab._id,
        item.name,
        parseFloat(value),
        eventLimit
      );

      const responseData = events.map(event => ({
        item: itemName,
        status: event.status,
        created_at: event.when,
        meta: {
          id: event._id,
          timestamp: Math.round(new Date(event.when).getTime() / 1000),
        },
      }));

      return res.json({ data: responseData });
    } catch (error) {
      this.logger.error('Error in triggerItemRaisedAbove:', error);
      return res.status(400).json({ errors: [{ message: String(error) }] });
    }
  };

  /**
   * POST /ifttt/v1/triggers/item_dropped_below
   *
   * Trigger: Item value dropped below threshold.
   */
  triggerItemDroppedBelow: RequestHandler = async (req, res) => {
    try {
      const eventLimit = req.body.limit ?? 50;

      const openhab = await this.openhabRepository.findByAccount(req.user!.account);
      if (!openhab) {
        return res.status(400).json({ errors: [{ message: 'No openhab' }] });
      }

      if (!req.body.triggerFields) {
        return res.status(400).json({ errors: [{ message: 'No triggerFields' }] });
      }

      const { item: itemName, value } = req.body.triggerFields;

      const item = await this.itemRepository.findByOpenhabAndName(openhab._id, itemName);
      if (!item) {
        return res.status(400).json({ errors: [{ message: 'No item' }] });
      }

      if (eventLimit <= 0) {
        return res.json({ data: [] });
      }

      const events = await this.eventRepository.findDroppedBelow(
        openhab._id,
        item.name,
        parseFloat(value),
        eventLimit
      );

      const responseData = events.map(event => ({
        item: itemName,
        status: event.status,
        created_at: event.when,
        meta: {
          id: event._id,
          timestamp: Math.round(new Date(event.when).getTime() / 1000),
        },
      }));

      return res.json({ data: responseData });
    } catch (error) {
      this.logger.error('Error in triggerItemDroppedBelow:', error);
      return res.status(400).json({ errors: [{ message: String(error) }] });
    }
  };

  /**
   * POST /ifttt/v1/actions/command/fields/item/options
   * POST /ifttt/v1/triggers/itemstate/fields/item/options
   * POST /ifttt/v1/triggers/item_raised_above/fields/item/options
   * POST /ifttt/v1/triggers/item_dropped_below/fields/item/options
   *
   * Returns list of items for action/trigger field dropdowns.
   */
  itemOptions: RequestHandler = async (req, res) => {
    try {
      const openhab = await this.openhabRepository.findByAccount(req.user!.account);
      if (!openhab) {
        return res.status(400).json({ errors: [{ message: 'Request failed' }] });
      }

      const items = await this.itemRepository.findByOpenhab(openhab._id);
      const responseData = items.map(item => ({
        label: item.name,
        value: item.name,
      }));

      return res.json({ data: responseData });
    } catch (error) {
      this.logger.error('Error in itemOptions:', error);
      return res.status(400).json({ errors: [{ message: 'Request failed' }] });
    }
  };
}

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
import mongoose from 'mongoose';

/**
 * Health check errors
 */
const Errors = {
  DBERROR: 'DBERROR',
} as const;

/**
 * Health check error response
 */
interface HealthError {
  error: string;
  message: string;
}

/**
 * Health check response
 */
interface HealthResponse {
  status: 'OK' | 'Not OK';
  mongoose: number;
  errors?: HealthError[];
}

/**
 * Configuration for HealthController
 */
export interface HealthControllerConfig {
  isEnabled: () => boolean;
}

/**
 * Health Controller
 *
 * Provides health check endpoint for monitoring.
 */
export class HealthController {
  constructor(private readonly config: HealthControllerConfig) {}

  /**
   * GET /health
   *
   * Returns the health status of the application including database connectivity.
   */
  getHealth: RequestHandler = (_req, res) => {
    if (!this.config.isEnabled()) {
      res.status(404).send('not found');
      return;
    }

    const mongooseState = mongoose.connection.readyState;
    const errors = this.collectErrors(mongooseState);

    const response: HealthResponse = {
      status: errors.length === 0 ? 'OK' : 'Not OK',
      mongoose: mongooseState,
    };

    if (errors.length > 0) {
      response.errors = errors;
      res.status(500).json(response);
    } else {
      res.status(200).json(response);
    }
  };

  /**
   * Collect health check errors based on MongoDB connection state
   */
  private collectErrors(mongooseState: number): HealthError[] {
    const errors: HealthError[] = [];

    switch (mongooseState) {
      case 0: // disconnected
        errors.push({
          error: Errors.DBERROR,
          message: 'mongodb disconnected',
        });
        break;
      case 2: // connecting
        errors.push({
          error: Errors.DBERROR,
          message: 'mongodb connecting',
        });
        break;
      case 3: // disconnecting
        errors.push({
          error: Errors.DBERROR,
          message: 'mongodb disconnecting',
        });
        break;
      // case 1 is 'connected' - no error
    }

    return errors;
  }
}

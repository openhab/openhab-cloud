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

import type { IUser, IOpenhab } from './models';
import type { ConnectionInfo } from './connection';

declare global {
  namespace Express {
    /**
     * Extend Express User to use our IUser interface
     * Include the getOpenhab method that exists on the Mongoose model
     */
    interface User extends IUser {
      getOpenhab(): Promise<IOpenhab | null>;
      checkPassword(password: string): Promise<boolean>;
    }

    /**
     * Extend Express Request with openHAB-specific properties
     */
    interface Request {
      /**
       * The authenticated user's openHAB instance
       */
      openhab?: IOpenhab;

      /**
       * Connection info from Redis for the user's openHAB
       */
      connectionInfo?: ConnectionInfo;

      /**
       * Raw request body for proxying
       */
      rawBody?: Buffer | string;

      /**
       * CSRF token function (from csurf middleware)
       */
      csrfToken?(): string;

      /**
       * Form data (from express-form)
       */
      form?: {
        username: string;
        password: string;
        [key: string]: unknown;
      };

      /**
       * Flash messages (from connect-flash)
       */
      flash(type: string, message?: string): string[] | undefined;
    }

    /**
     * Extend Express Response locals
     */
    interface Locals {
      openhab?: IOpenhab;
      openhablastonline?: Date;
      openhabstatus?: 'online' | 'offline';
      openhabMajorVersion?: number;
    }
  }
}

// Extend express-session
declare module 'express-session' {
  interface SessionData {
    returnTo?: string;
    timezone?: string;
  }
}

export {};

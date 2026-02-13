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
import { z } from 'zod';
import type { ZodSchema, ZodIssue } from 'zod';

/**
 * Validated request with typed body
 */
export interface ValidatedRequest<T> extends Request {
  validatedBody: T;
}

/**
 * Format Zod errors into user-friendly messages
 */
function formatZodErrors(issues: ZodIssue[]): string[] {
  return issues.map(err => {
    const field = err.path.join('.');
    return field ? `${field}: ${err.message}` : err.message;
  });
}

/**
 * Create a validation middleware for request body
 *
 * Validates req.body against the provided Zod schema.
 * On success, sets req.validatedBody with the parsed/transformed data.
 * On failure, either redirects (for web forms) or returns JSON error (for API).
 *
 * @param schema - Zod schema to validate against
 * @param options - Configuration options
 */
export function validateBody<T extends ZodSchema>(
  schema: T,
  options: {
    /**
     * Where to redirect on validation failure (for web forms).
     * If not set, returns JSON error response.
     */
    redirectOnError?: string | ((req: Request) => string);
    /**
     * Flash message type for errors (default: 'error')
     */
    flashType?: string;
  } = {}
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = formatZodErrors(result.error.issues);

      if (options.redirectOnError) {
        // Web form mode - flash errors and redirect
        const flashType = options.flashType ?? 'error';
        errors.forEach(err => req.flash(flashType, err));

        const redirectUrl =
          typeof options.redirectOnError === 'function'
            ? options.redirectOnError(req)
            : options.redirectOnError;

        res.redirect(redirectUrl);
        return;
      }

      // API mode - return JSON error
      res.status(400).json({
        error: 'Validation failed',
        details: errors,
      });
      return;
    }

    // Attach validated data to request
    (req as ValidatedRequest<z.infer<T>>).validatedBody = result.data;
    next();
  };
}

/**
 * Create a validation middleware for URL parameters
 *
 * @param schema - Zod schema to validate against
 * @param options - Configuration options
 */
export function validateParams<T extends ZodSchema>(
  schema: T,
  options: {
    /**
     * Where to redirect on validation failure (for web forms).
     * If not set, returns JSON error response.
     */
    redirectOnError?: string | ((req: Request) => string);
    /**
     * Flash message type for errors (default: 'error')
     */
    flashType?: string;
  } = {}
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);

    if (!result.success) {
      const errors = formatZodErrors(result.error.issues);

      if (options.redirectOnError) {
        const flashType = options.flashType ?? 'error';
        errors.forEach(err => req.flash(flashType, err));

        const redirectUrl =
          typeof options.redirectOnError === 'function'
            ? options.redirectOnError(req)
            : options.redirectOnError;

        res.redirect(redirectUrl);
        return;
      }

      res.status(400).json({
        error: 'Invalid URL parameters',
        details: errors,
      });
      return;
    }

    // Type assertion since we know the schema output matches params
    Object.assign(req.params, result.data);
    next();
  };
}

/**
 * MongoDB ObjectId validation schema
 */
export const ObjectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

/**
 * Common param schemas
 */
export const IdParamSchema = z.object({
  id: ObjectIdSchema,
});
export type IdParam = z.infer<typeof IdParamSchema>;

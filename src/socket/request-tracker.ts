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

import type { Response } from 'express';
import type { IOpenhab } from '../types/models';
import type { TrackedRequest } from './types';

/**
 * Request Tracker
 *
 * Tracks in-flight HTTP requests that are being proxied through openHAB.
 * Each request gets a unique ID that is used to correlate responses
 * from the openHAB socket connection.
 *
 * Note: This is an in-memory implementation. For distributed deployments,
 * requests must be routed to the server that holds the WebSocket connection.
 */
export class RequestTracker {
  private requests: Map<number, TrackedRequest> = new Map();
  private requestCounter = 1;

  /**
   * Get the number of tracked requests
   */
  size(): number {
    return this.requests.size;
  }

  /**
   * Check if a request with the given ID exists
   */
  has(requestId: number): boolean {
    return this.requests.has(requestId);
  }

  /**
   * Get a tracked request by ID
   *
   * @throws RangeError if request not found
   */
  get(requestId: number): TrackedRequest {
    const request = this.requests.get(requestId);
    if (!request) {
      throw new RangeError(
        `The request with ID ${requestId} is not tracked by this RequestTracker`
      );
    }
    return request;
  }

  /**
   * Get all tracked requests
   */
  getAll(): Map<number, TrackedRequest> {
    return this.requests;
  }

  /**
   * Acquire a new unique request ID
   */
  acquireRequestId(): number {
    return this.requestCounter++;
  }

  /**
   * Add a request to the tracker
   *
   * @param openhab - The openHAB instance this request is for
   * @param response - The Express response object to write to
   * @param requestId - Optional specific ID (acquires new if not provided)
   * @returns The request ID
   */
  add(openhab: IOpenhab, response: Response, requestId?: number): number {
    const id = requestId ?? this.acquireRequestId();

    const trackedRequest: TrackedRequest = {
      openhab,
      response,
      headersSent: false,
      finished: false,
      createdAt: new Date(),
    };

    this.requests.set(id, trackedRequest);
    return id;
  }

  /**
   * Remove a request from the tracker
   *
   * @throws RangeError if request not found
   */
  remove(requestId: number): void {
    if (!this.has(requestId)) {
      throw new RangeError(
        `The request with ID ${requestId} is not tracked by this RequestTracker`
      );
    }
    this.requests.delete(requestId);
  }

  /**
   * Safely remove a request (no error if not found)
   */
  safeRemove(requestId: number): boolean {
    return this.requests.delete(requestId);
  }

  /**
   * Mark a request's headers as sent
   */
  markHeadersSent(requestId: number): void {
    const request = this.requests.get(requestId);
    if (request) {
      request.headersSent = true;
    }
  }

  /**
   * Mark a request as finished
   */
  markFinished(requestId: number): void {
    const request = this.requests.get(requestId);
    if (request) {
      request.finished = true;
    }
  }

  /**
   * Clean up orphaned requests (finished but not removed)
   *
   * @returns Array of removed request IDs
   */
  cleanupOrphaned(): number[] {
    const removed: number[] = [];

    for (const [requestId, request] of this.requests) {
      if (request.finished) {
        this.requests.delete(requestId);
        removed.push(requestId);
      }
    }

    return removed;
  }

  /**
   * Clean up requests older than the given age
   *
   * @param maxAgeMs - Maximum age in milliseconds
   * @returns Array of removed request IDs
   */
  cleanupStale(maxAgeMs: number): number[] {
    const removed: number[] = [];
    const now = Date.now();

    for (const [requestId, request] of this.requests) {
      if (now - request.createdAt.getTime() > maxAgeMs) {
        this.requests.delete(requestId);
        removed.push(requestId);
      }
    }

    return removed;
  }
}

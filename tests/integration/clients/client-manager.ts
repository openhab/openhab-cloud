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

/**
 * Client Manager
 *
 * Manages multiple OpenHAB test clients for concurrent testing.
 */

import { OpenHABTestClient } from './openhab-client';

/**
 * Manages multiple OpenHAB test client connections
 */
export class ClientManager {
  private clients = new Map<string, OpenHABTestClient>();
  private serverUrl: string;

  constructor(serverUrl: string) {
    this.serverUrl = serverUrl;
  }

  /**
   * Create a new client
   */
  createClient(
    uuid: string,
    secret: string,
    version: string = '4.0.0'
  ): OpenHABTestClient {
    if (this.clients.has(uuid)) {
      throw new Error(`Client with UUID ${uuid} already exists`);
    }

    const client = new OpenHABTestClient(this.serverUrl, uuid, secret, version);
    this.clients.set(uuid, client);
    return client;
  }

  /**
   * Get an existing client by UUID
   */
  getClient(uuid: string): OpenHABTestClient | undefined {
    return this.clients.get(uuid);
  }

  /**
   * Connect all clients
   */
  async connectAll(): Promise<void> {
    const promises = Array.from(this.clients.values()).map((client) =>
      client.connect()
    );
    await Promise.all(promises);
  }

  /**
   * Disconnect all clients
   */
  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.clients.values()).map((client) =>
      client.disconnect()
    );
    await Promise.all(promises);
    this.clients.clear();
  }

  /**
   * Disconnect and remove a specific client
   */
  async removeClient(uuid: string): Promise<void> {
    const client = this.clients.get(uuid);
    if (client) {
      await client.disconnect();
      this.clients.delete(uuid);
    }
  }

  /**
   * Get count of connected clients
   */
  get connectedCount(): number {
    return Array.from(this.clients.values()).filter((c) => c.isConnected).length;
  }

  /**
   * Get all clients
   */
  get allClients(): OpenHABTestClient[] {
    return Array.from(this.clients.values());
  }

  /**
   * Get all UUIDs
   */
  get allUuids(): string[] {
    return Array.from(this.clients.keys());
  }
}

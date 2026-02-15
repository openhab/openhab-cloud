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

import type { Socket as NetSocket } from 'net';

/**
 * Write data to a net.Socket with basic backpressure handling.
 *
 * If the socket's internal buffer is full (write returns false),
 * we pause and wait for a 'drain' event before resolving.
 * Node.js will buffer internally regardless, but this provides
 * cooperative flow control with the Socket.IO transport layer.
 *
 * @param socket - The TCP socket to write to
 * @param data - Buffer or ArrayBuffer to write
 * @returns Promise that resolves when the write is accepted
 */
export function writeWithBackpressure(socket: NetSocket, data: Buffer | ArrayBuffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.destroyed) {
      reject(new Error('Socket is destroyed'));
      return;
    }

    let settled = false;

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const canContinue = socket.write(buf, (err) => {
      if (settled) return;
      if (err) {
        settled = true;
        socket.removeListener('drain', onDrain);
        reject(err);
      }
    });

    const onDrain = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    if (canContinue) {
      if (!settled) {
        settled = true;
        resolve();
      }
    } else {
      socket.once('drain', onDrain);
    }
  });
}

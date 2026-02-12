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
 * Mock Responses
 *
 * Pre-configured responses for common proxy requests.
 */

import { ProxyResponse } from './openhab-client';

/**
 * Item representation
 */
export interface Item {
  name: string;
  state: string;
  type?: string;
  label?: string;
  category?: string;
  tags?: string[];
  groupNames?: string[];
}

/**
 * Mock response builders
 */
export const mockResponses = {
  /**
   * JSON response for REST API items list
   */
  restApiItems(items: Item[]): ProxyResponse {
    return {
      id: 0, // Will be set by caller
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(items),
    };
  },

  /**
   * JSON response for single REST API item
   */
  restApiItem(item: Item): ProxyResponse {
    return {
      id: 0,
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(item),
    };
  },

  /**
   * Error response
   */
  error(status: number, message: string): ProxyResponse {
    return {
      id: 0,
      status,
      headers: {
        'Content-Type': 'text/plain',
      },
      body: message,
    };
  },

  /**
   * HTML page response
   */
  htmlPage(html: string): ProxyResponse {
    return {
      id: 0,
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
      body: html,
    };
  },

  /**
   * BasicUI page mock
   */
  basicUiPage(title: string): ProxyResponse {
    const html = `<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body>
  <h1>${title}</h1>
  <div id="content">Mock BasicUI Page</div>
</body>
</html>`;
    return mockResponses.htmlPage(html);
  },

  /**
   * Sitemap response
   */
  sitemap(name: string, widgets: Array<{ label: string; item?: string }>): ProxyResponse {
    const sitemap = {
      name,
      label: name,
      homepage: {
        widgets: widgets.map((w, i) => ({
          widgetId: `widget-${i}`,
          type: 'Text',
          label: w.label,
          item: w.item
            ? {
                name: w.item,
                state: 'ON',
                type: 'Switch',
              }
            : undefined,
        })),
      },
    };

    return {
      id: 0,
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sitemap),
    };
  },

  /**
   * Command accepted response
   */
  commandAccepted(): ProxyResponse {
    return {
      id: 0,
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
      },
      body: 'OK',
    };
  },

  /**
   * Not found response
   */
  notFound(path: string): ProxyResponse {
    return mockResponses.error(404, `Not Found: ${path}`);
  },

  /**
   * Server error response
   */
  serverError(message = 'Internal Server Error'): ProxyResponse {
    return mockResponses.error(500, message);
  },
};

/**
 * Create a request handler that returns mock responses
 */
export function createMockHandler(
  handlers: Record<string, () => ProxyResponse>
): (req: { id: number; path: string }) => ProxyResponse {
  return (req) => {
    const handler = handlers[req.path];
    if (handler) {
      const response = handler();
      return { ...response, id: req.id };
    }
    return { ...mockResponses.notFound(req.path), id: req.id };
  };
}

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
 * Routes Module
 *
 * Sets up all Express routes. Uses TypeScript controllers where available,
 * falls back to legacy route modules for unimplemented functionality.
 */

import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Types } from 'mongoose';
import type { Server as SocketIOServer } from 'socket.io';

import { createMiddleware, MiddlewareDependencies } from './middleware';
import type { AppLogger } from '../lib/logger';
import type { PromisifiedRedisClient } from '../lib/redis';
import type { IUser, IInvitation, IOpenhab } from '../types/models';

// Controllers
import { HealthController, AccountController, InvitationsController, UsersController, OAuth2Controller, StaffController, RegistrationController, DevicesController, ApiController, EventsController, ItemsController, NotificationsViewController, ApplicationsController, HomepageController, TimezoneController, IftttController } from '../controllers';
import type { DeviceType, INotification } from '../types/models';
import type { NotificationPayload } from '../types/notification';
import type { ServiceContainer } from '../factories';

// Validation
import { validateBody, validateParams, IdParamSchema } from '../middleware/validation.middleware';
import {
  LoginSchema,
  RegisterSchema,
  AccountUpdateSchema,
  PasswordChangeSchema,
  LostPasswordSchema,
  PasswordResetSchema,
  InvitationSchema,
  AddUserSchema,
  SendMessageSchema,
} from '../schemas';

// TypeScript Mongoose models
import {
  Invitation,
  User,
  OAuth2Client,
  OAuth2Code,
  OAuth2Token,
  OAuth2Scope,
  Enrollment,
  UserDevice,
  Notification,
  Event,
  Item,
  Openhab,
} from '../models';

export interface RoutesDependencies extends MiddlewareDependencies {
  // TypeScript controllers
  healthController: HealthController;

  // Services for controller instantiation
  services: ServiceContainer;

  // Socket.IO for proxy routes
  io: SocketIOServer;
  requestTracker: {
    acquireRequestId(): number;
    add(openhab: IOpenhab, res: Response, requestId?: number): number;
    remove(requestId: number): void;
    safeRemove(requestId: number): boolean;
    has(requestId: number): boolean;
  };

  // Feature flags
  iftttEnabled: boolean;
  hasLegalTerms: boolean;
  hasLegalPolicy: boolean;
  registrationEnabled: boolean;

  // Devices config
  devicesConfig: {
    getBaseURL(): string;
    getAppleLink(): string;
    getAndroidLink(): string;
  };

  // API config
  apiConfig: {
    isGcmConfigured(): boolean;
    getGcmSenderId(): string;
    getProxyURL(): string;
    getAppleId(): string;
    getAndroidId(): string;
  };

  // IFTTT config
  iftttConfig: {
    getChannelKey(): string;
    getTestToken(): string;
    getBaseURL(): string;
  };
}

/**
 * Create and configure all routes
 */
export function createRoutes(deps: RoutesDependencies): Router {
  const router = Router();
  const middleware = createMiddleware(deps);
  const {
    ensureAuthenticated,
    ensureRestAuthenticated,
    ensureMaster,
    ensureStaff,
    setOpenhab,
    ensureServer,
    preassembleBody,
  } = middleware;

  const {
    healthController,
    services,
    io,
    requestTracker,
    systemConfig,
    logger,
    iftttEnabled,
    hasLegalTerms,
    hasLegalPolicy,
    registrationEnabled,
  } = deps;

  // Create TypeScript controllers with services
  const accountController = new AccountController(
    services.userService,
    services.openhabService,
    {
      getBaseURL: () => systemConfig.getBaseURL(),
      hasLegalTerms: () => hasLegalTerms,
      hasLegalPolicy: () => hasLegalPolicy,
      isRegistrationEnabled: () => registrationEnabled,
    },
    logger
  );

  // InvitationsController with repository adapter
  const invitationsController = new InvitationsController(
    {
      send: async (email: string) => {
        // Create and save invitation using TypeScript model's static method
        const invitation = await Invitation.createInvitation(email);
        // Note: Email sending should be handled by a separate EmailService
        // For now, just return the saved invitation
        return invitation;
      },
    },
    { getBaseURL: () => systemConfig.getBaseURL() },
    logger
  );

  // UsersController with repository adapter
  const usersController = new UsersController(
    {
      findByAccount: async (accountId) => User.find({ account: accountId }),
      findByIdAndAccount: async (id, accountId) =>
        User.findOne({ _id: id, account: accountId }),
      findByUsername: async (username) => User.findOne({ username }),
      registerToAccount: async (username, password, accountId, role) => {
        // TypeScript model uses async registerToAccount
        const objectId = typeof accountId === 'string' ? new Types.ObjectId(accountId) : accountId;
        return User.registerToAccount(username, password, objectId, role);
      },
      deleteById: async (id) => {
        await User.findByIdAndDelete(id);
      },
    },
    services.passwordValidator,
    logger
  );

  // OAuth2Controller with repository adapters
  const oauth2Controller = new OAuth2Controller(
    {
      findById: async (id) => OAuth2Client.findById(id),
      findByClientId: async (clientId) => OAuth2Client.findOne({ clientId }),
    },
    {
      create: async (data) => {
        const code = new OAuth2Code(data);
        return code.save();
      },
      findByCodeAndClientAndRedirect: async (code, clientId, redirectURI) =>
        OAuth2Code.findOne({ code, oAuthClient: clientId, redirectURI }),
      invalidate: async (id) => {
        await OAuth2Code.findByIdAndUpdate(id, { valid: false });
      },
    },
    {
      create: async (data) => {
        const token = new OAuth2Token(data);
        return token.save();
      },
    },
    {
      findByName: async (name) => OAuth2Scope.findOne({ name }),
    },
    logger
  );

  // StaffController with repository adapters
  const staffController = new StaffController(
    {
      findPaginated: async (options) => {
        let query = Enrollment.find(options.filter || {});
        if (options.sort) {
          const sortObj: Record<string, 1 | -1> = {};
          for (const [key, value] of Object.entries(options.sort)) {
            sortObj[key] = value === 'asc' ? 1 : -1;
          }
          query = query.sort(sortObj);
        }
        return query.skip(options.skip).limit(options.limit);
      },
      count: async (filter) => Enrollment.countDocuments(filter || {}),
      findById: async (id) => Enrollment.findById(id),
      updateInvited: async (id, invitedAt) => {
        await Enrollment.findByIdAndUpdate(id, { invited: invitedAt });
      },
    },
    {
      findPaginated: async (options) => {
        let query = Invitation.find(options.filter || {});
        if (options.sort) {
          const sortObj: Record<string, 1 | -1> = {};
          for (const [key, value] of Object.entries(options.sort)) {
            sortObj[key] = value === 'asc' ? 1 : -1;
          }
          query = query.sort(sortObj);
        }
        return query.skip(options.skip).limit(options.limit);
      },
      count: async (filter) => Invitation.countDocuments(filter || {}),
      findById: async (id) => Invitation.findById(id),
      send: async (email: string) => {
        // Create and save invitation using TypeScript model's static method
        const invitation = await Invitation.createInvitation(email);
        // Note: Email sending should be handled by a separate EmailService
        return invitation;
      },
      resend: async (id) => {
        // Update lastNotified timestamp using TypeScript model's static method
        await Invitation.updateLastNotified(id);
        // Note: Actual email re-sending should be handled by a separate EmailService
      },
      deleteById: async (id) => {
        await Invitation.findByIdAndDelete(id);
      },
    },
    {
      findPaginated: async (options) => {
        let query = OAuth2Client.find({});
        if (options.sort) {
          const sortObj: Record<string, 1 | -1> = {};
          for (const [key, value] of Object.entries(options.sort)) {
            sortObj[key] = value === 'asc' ? 1 : -1;
          }
          query = query.sort(sortObj);
        }
        return query.skip(options.skip).limit(options.limit);
      },
      count: async () => OAuth2Client.countDocuments({}),
    },
    {
      mget: async (keys: string[]) => deps.redis.mget(keys),
    },
    logger
  );

  // RegistrationController with repository adapter
  const registrationController = new RegistrationController(
    {
      findByOwnerAndDeviceId: async (ownerId, deviceType, deviceId) =>
        UserDevice.findOne({ owner: ownerId, deviceType, deviceId }),
      create: async (data) => {
        const device = new UserDevice({
          ...data,
          lastUpdate: new Date(),
          registered: new Date(),
        });
        return device.save();
      },
      updateFcmRegistration: async (id, fcmRegistration) => {
        await UserDevice.findByIdAndUpdate(id, {
          fcmRegistration,
          lastUpdate: new Date(),
        });
      },
    },
    logger
  );

  // DevicesController with repository adapters
  const devicesController = new DevicesController(
    {
      findByOwner: async (ownerId) => UserDevice.find({ owner: ownerId }),
      findByIdAndOwner: async (id, ownerId) =>
        UserDevice.findOne({ _id: id, owner: ownerId }),
      deleteById: async (id) => {
        await UserDevice.findByIdAndDelete(id);
      },
    },
    {
      create: async (data: { user: string; message: string; payload: NotificationPayload }) => {
        const notification = new Notification(data);
        return notification.save();
      },
    },
    {
      isConfigured: () => services.fcmProvider.isConfigured(),
      send: async (token: string, notification: INotification) => {
        await services.fcmProvider.send(token, notification);
      },
    },
    deps.devicesConfig,
    logger
  );

  // ApiController with repository adapters
  const apiController = new ApiController(
    {
      findByUser: async (userId, options) => {
        let query = Notification.find({ user: userId }).sort({ created: 'desc' });
        if (options?.skip) query = query.skip(options.skip);
        if (options?.limit) query = query.limit(options.limit);
        return query.lean();
      },
    },
    {
      findByOwner: async (ownerId) => UserDevice.find({ owner: ownerId }),
    },
    services.notificationService,
    {
      sendHideNotification: async (tokens: string[], notificationId: string) => {
        await services.fcmProvider.sendHideNotification(tokens, notificationId);
      },
    },
    deps.apiConfig,
    logger
  );

  // EventsController with repository adapter
  const eventsController = new EventsController(
    {
      findByOpenhab: async (openhabId, options) => {
        const filter: Record<string, unknown> = { openhab: openhabId };
        if (options.source) filter['source'] = options.source;
        return Event.find(filter)
          .limit(options.limit)
          .skip(options.skip)
          .sort({ when: 'desc' })
          .lean();
      },
      count: async () => Event.countDocuments({}),
    },
    logger
  );

  // ItemsController with repository adapter
  const itemsController = new ItemsController(
    {
      findByOpenhab: async (openhabId, sort) => {
        const sortMap: Record<string, Record<string, 'asc' | 'desc'>> = {
          name: { name: 'asc' },
          last_update: { last_update: 'desc' },
          status: { status: 'asc' },
        };
        return Item.find({ openhab: openhabId })
          .sort(sortMap[sort] || sortMap['name'])
          .lean();
      },
    },
    logger
  );

  // NotificationsViewController with repository adapter
  const notificationsViewController = new NotificationsViewController(
    {
      findByUser: async (userId, options) =>
        Notification.find({ user: userId })
          .limit(options.limit)
          .skip(options.skip)
          .sort({ created: 'desc' })
          .lean(),
      count: async () => Notification.countDocuments({}),
    },
    logger
  );

  // ApplicationsController with repository adapter
  const applicationsController = new ApplicationsController(
    {
      findByUserWithClient: async (userId) =>
        OAuth2Token.find({ user: userId }).populate('oAuthClient'),
      findByIdAndUser: async (id, userId) =>
        OAuth2Token.findOne({ _id: id, user: userId }),
      deleteById: async (id) => {
        await OAuth2Token.findByIdAndDelete(id);
      },
    },
    logger
  );

  // HomepageController and TimezoneController (simple, no dependencies)
  const homepageController = new HomepageController();
  const timezoneController = new TimezoneController();

  // IftttController with repository adapters
  const iftttController = new IftttController(
    {
      findByAccount: async accountId => Openhab.findOne({ account: accountId }),
    },
    {
      findByOpenhab: async (openhabId) => Item.find({ openhab: openhabId }),
      findByOpenhabAndName: async (openhabId, name) =>
        Item.findOne({ openhab: openhabId, name }),
    },
    {
      findByOpenhabAndSource: async (openhabId, source, options) => {
        const query: Record<string, unknown> = { openhab: openhabId, source };
        if (options.status) query['status'] = options.status;
        return Event.find(query).sort({ when: 'desc' }).limit(options.limit).lean();
      },
      findRaisedAbove: async (openhabId, source, value, limit) =>
        Event.find({ openhab: openhabId, source })
          .where('numericStatus').gt(value)
          .where('oldNumericStatus').lte(value)
          .sort({ when: 'desc' })
          .limit(limit)
          .lean(),
      findDroppedBelow: async (openhabId, source, value, limit) =>
        Event.find({ openhab: openhabId, source })
          .where('numericStatus').lt(value)
          .where('oldNumericStatus').gte(value)
          .sort({ when: 'desc' })
          .limit(limit)
          .lean(),
    },
    {
      emitCommand: (uuid, item, command) => {
        io.sockets.in(uuid).emit('command', { item, command });
      },
    },
    deps.iftttConfig,
    logger
  );

  // ============================================
  // General Routes
  // ============================================

  router.get('/', setOpenhab, homepageController.index);
  router.get('/health', healthController.getHealth);
  router.get('/events', ensureAuthenticated, setOpenhab, eventsController.getEvents);
  router.get('/items', ensureAuthenticated, setOpenhab, itemsController.getItems);
  router.get('/notifications', ensureAuthenticated, setOpenhab, notificationsViewController.getNotifications);

  // ============================================
  // Login/Logout Routes
  // ============================================

  router.get('/logout', (req: Request, res: Response, next: NextFunction) => {
    req.logout((err) => {
      if (err) return next(err);
      res.redirect('/');
    });
  });

  router.get('/login', (req: Request, res: Response) => {
    const errormessages = req.flash('error');
    const invitationCode = req.query['invitationCode'] ?? '';

    res.render('login', {
      title: 'Log in',
      user: req.user,
      errormessages,
      infomessages: req.flash('info'),
      invitationCode,
    });
  });

  router.post(
    '/login',
    validateBody(LoginSchema, { redirectOnError: '/login' }),
    passport.authenticate('local', {
      successReturnToOrRedirect: '/',
      failureRedirect: '/login',
      failureFlash: true,
      keepSessionInfo: true,
    })
  );

  // ============================================
  // Account Routes (TypeScript Controller)
  // ============================================

  router.get('/account', ensureAuthenticated, setOpenhab, accountController.getAccount);
  router.post('/account', ensureAuthenticated, setOpenhab, ensureMaster,
    validateBody(AccountUpdateSchema, { redirectOnError: '/account' }),
    accountController.postAccount);
  router.post('/accountpassword', ensureAuthenticated, setOpenhab,
    validateBody(PasswordChangeSchema, { redirectOnError: '/account' }),
    accountController.postAccountPassword);
  router.get('/accountdelete', ensureAuthenticated, setOpenhab, ensureMaster, accountController.getAccountDelete);
  router.post('/accountdelete', ensureAuthenticated, setOpenhab, ensureMaster, accountController.postAccountDelete);
  router.get('/itemsdelete', ensureAuthenticated, setOpenhab, ensureMaster, accountController.getItemsDelete);
  router.post('/itemsdelete', ensureAuthenticated, setOpenhab, ensureMaster, accountController.postItemsDelete);

  // ============================================
  // Registration Routes (TypeScript Controller)
  // ============================================

  router.post('/register',
    validateBody(RegisterSchema, { redirectOnError: '/login' }),
    accountController.register);
  router.get('/verify', accountController.verifyEmail);
  router.get('/enroll', accountController.getEnroll);
  router.post('/enroll', accountController.postEnroll);

  // ============================================
  // Devices Routes (TypeScript Controller)
  // ============================================

  router.get('/devices', ensureAuthenticated, setOpenhab, devicesController.getDevices);
  router.get('/devices/:id', ensureAuthenticated, setOpenhab, devicesController.getDevices);
  router.get('/devices/:id/delete', ensureAuthenticated, setOpenhab, devicesController.deleteDevice);
  router.post('/devices/:id/sendmessage', ensureAuthenticated, setOpenhab,
    validateBody(SendMessageSchema, { redirectOnError: '/devices' }),
    devicesController.sendMessage);

  // ============================================
  // Applications Routes (TypeScript Controller)
  // ============================================

  router.get('/applications', ensureAuthenticated, setOpenhab, applicationsController.getApplications);
  router.get('/applications/:id/delete', ensureAuthenticated, setOpenhab, applicationsController.deleteApplication);

  // ============================================
  // Invitations Routes (TypeScript Controller)
  // ============================================

  router.get('/invitations', ensureAuthenticated, setOpenhab, invitationsController.getInvitations);
  router.post('/invitations', ensureAuthenticated, setOpenhab,
    validateBody(InvitationSchema, { redirectOnError: '/invitations' }),
    invitationsController.sendInvitation);

  // Lost password routes (TypeScript Controller)
  router.get('/lostpassword', accountController.getLostPassword);
  router.post('/lostpassword',
    validateBody(LostPasswordSchema, { redirectOnError: '/lostpassword' }),
    accountController.postLostPassword);
  router.get('/lostpasswordreset', accountController.getLostPasswordReset);
  router.post('/lostpasswordreset',
    validateBody(PasswordResetSchema, { redirectOnError: (req) => {
      // Sanitize resetCode to prevent injection - only allow alphanumeric and hyphens (UUID format)
      const resetCode = String(req.body.resetCode || '').replace(/[^a-zA-Z0-9-]/g, '');
      return `/lostpasswordreset?resetCode=${encodeURIComponent(resetCode)}`;
    }}),
    accountController.postLostPasswordReset);

  // ============================================
  // User Management Routes (TypeScript Controller)
  // ============================================

  router.get('/users', ensureAuthenticated, setOpenhab, ensureMaster, usersController.getUsers);
  router.get('/users/add', ensureAuthenticated, setOpenhab, ensureMaster, usersController.getAddUser);
  router.post('/users/add', ensureAuthenticated, setOpenhab, ensureMaster,
    validateBody(AddUserSchema, { redirectOnError: '/users/add' }),
    usersController.addUser);
  router.get('/users/delete/:id', ensureAuthenticated, setOpenhab, ensureMaster,
    validateParams(IdParamSchema, { redirectOnError: '/users' }),
    usersController.deleteUser);
  router.get('/users/:id', ensureAuthenticated, setOpenhab, ensureMaster, usersController.getUsers);

  // ============================================
  // OAuth2 Routes (TypeScript Controller)
  // ============================================

  router.get('/oauth2/authorize', ensureAuthenticated, ...oauth2Controller.authorization);
  router.post('/oauth2/authorize/decision', ensureAuthenticated, ...oauth2Controller.decision);
  router.post('/oauth2/token',
    passport.authenticate(['oAuthBasic', 'oauth2-client-password'], { session: false }),
    ...oauth2Controller.token);

  // ============================================
  // Staff Routes (TypeScript Controller)
  // ============================================

  router.get('/staff', ensureAuthenticated, setOpenhab, ensureStaff, staffController.getEnrollments);
  router.get('/staff/processenroll/:id', ensureAuthenticated, setOpenhab, ensureStaff,
    validateParams(IdParamSchema, { redirectOnError: '/staff' }),
    staffController.processEnrollment);
  router.get('/staff/stats', ensureAuthenticated, setOpenhab, ensureStaff, staffController.getStats);
  router.get('/staff/invitations', ensureAuthenticated, setOpenhab, ensureStaff, staffController.getInvitations);
  router.get('/staff/resendinvitation/:id', ensureAuthenticated, setOpenhab, ensureStaff,
    validateParams(IdParamSchema, { redirectOnError: '/staff/invitations' }),
    staffController.resendInvitation);
  router.get('/staff/deleteinvitation/:id', ensureAuthenticated, setOpenhab, ensureStaff,
    validateParams(IdParamSchema, { redirectOnError: '/staff/invitations' }),
    staffController.deleteInvitation);
  router.get('/staff/oauthclients', ensureAuthenticated, setOpenhab, ensureStaff, staffController.getOAuthClients);

  // ============================================
  // IFTTT Routes (TypeScript Controller)
  // ============================================

  if (iftttEnabled) {
    logger.info('IFTTT is configured, app handling IFTTT capabilities...');
    router.get('/ifttt/v1/user/info', iftttController.authenticate, iftttController.getUserInfo);
    router.get('/ifttt/v1/status', iftttController.ensureChannelKey, iftttController.getStatus);
    router.post('/ifttt/v1/test/setup', iftttController.ensureChannelKey, iftttController.getTestSetup);
    router.post('/ifttt/v1/actions/command', iftttController.authenticate, setOpenhab, ensureServer, iftttController.actionCommand);
    router.post('/ifttt/v1/actions/command/fields/item/options', iftttController.authenticate, iftttController.itemOptions);
    router.post('/ifttt/v1/triggers/itemstate', iftttController.authenticate, iftttController.triggerItemState);
    router.post('/ifttt/v1/triggers/itemstate/fields/item/options', iftttController.authenticate, iftttController.itemOptions);
    router.post('/ifttt/v1/triggers/item_raised_above', iftttController.authenticate, iftttController.triggerItemRaisedAbove);
    router.post('/ifttt/v1/triggers/item_raised_above/fields/item/options', iftttController.authenticate, iftttController.itemOptions);
    router.post('/ifttt/v1/triggers/item_dropped_below', iftttController.authenticate, iftttController.triggerItemDroppedBelow);
    router.post('/ifttt/v1/triggers/item_dropped_below/fields/item/options', iftttController.authenticate, iftttController.itemOptions);
  }

  // ============================================
  // Timezone Route
  // ============================================

  router.all('/setTimezone', timezoneController.setTimezone);

  // ============================================
  // API Routes (TypeScript Controller)
  // ============================================

  router.get('/api/v1/notifications', ensureRestAuthenticated, setOpenhab, preassembleBody, apiController.getNotifications);
  router.post('/api/v1/sendnotification', ensureRestAuthenticated, setOpenhab, preassembleBody, apiController.sendNotification);
  router.get('/api/v1/hidenotification/:id', ensureRestAuthenticated, setOpenhab, preassembleBody, apiController.hideNotification);
  router.get('/api/v1/settings/notifications', ensureRestAuthenticated, setOpenhab, preassembleBody, apiController.getNotificationSettings);
  router.get('/api/v1/proxyurl', ensureRestAuthenticated, setOpenhab, preassembleBody, apiController.getProxyUrl);
  router.get('/api/v1/appids', apiController.getAppIds);

  // ============================================
  // Device Registration Routes (TypeScript Controller)
  // ============================================

  router.all('/addAndroidRegistration{*path}', ensureRestAuthenticated, setOpenhab, preassembleBody, registrationController.registerAndroid);
  router.all('/addIosRegistration{*path}', ensureRestAuthenticated, setOpenhab, preassembleBody, registrationController.registerIos);

  // ============================================
  // Proxy Routes
  // ============================================

  const proxyRoute = createProxyHandler(io, requestTracker, systemConfig, logger);

  // WebSocket proxy route — no preassembleBody (upgrade requests have no body to assemble)
  router.all('/ws/{*path}', ensureRestAuthenticated, setOpenhab, ensureServer, proxyRoute);

  // Express 5 route patterns: {*param} = zero-or-more path segments, :param = single segment
  const proxyPaths = [
    '/rest{*path}', '/images/{*path}', '/static/{*path}', '/rrdchart.png{*path}', '/chart{*path}',
    '/openhab.app{*path}', '/WebApp{*path}', '/CMD{*path}', '/cometVisu{*path}', '/proxy{*path}',
    '/greent{*path}', '/jquery.:ext', '/classicui/{*path}', '/paperui/{*path}', '/basicui/{*path}',
    '/doc/{*path}', '/start/{*path}', '/icon{*path}', '/habmin/{*path}', '/remote{*path}', '/habpanel/{*path}',
  ];

  for (const path of proxyPaths) {
    router.all(path, ensureRestAuthenticated, setOpenhab, preassembleBody, ensureServer, proxyRoute);
  }

  return router;
}

/**
 * Create proxy route handler
 */
function createProxyHandler(
  io: SocketIOServer,
  requestTracker: RoutesDependencies['requestTracker'],
  systemConfig: MiddlewareDependencies['systemConfig'],
  logger: AppLogger
) {
  return (req: Request, res: Response) => {
    if (logger.auditRequest) {
      logger.auditRequest(req as Parameters<typeof logger.auditRequest>[0]);
    }

    req.socket.setTimeout(600000);

    // Tell OH3 to use alternative Authentication header
    res.cookie('X-OPENHAB-AUTH-HEADER', 'true');

    const requestId = requestTracker.acquireRequestId();

    // Copy and sanitize headers
    const requestHeaders: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        requestHeaders[key] = value;
      }
    }

    // Check if this is a WebSocket upgrade request
    // Also detect via sec-websocket-* headers which survive reverse proxies
    // that strip hop-by-hop headers (Upgrade, Connection)
    const isUpgrade = req.headers['upgrade']?.toLowerCase() === 'websocket'
      || (req.headers['sec-websocket-key'] != null && req.headers['sec-websocket-version'] != null);

    // Remove sensitive headers
    delete requestHeaders['cookie'];
    delete requestHeaders['cookie2'];
    delete requestHeaders['authorization'];
    delete requestHeaders['x-real-ip'];
    delete requestHeaders['x-forwarded-for'];
    delete requestHeaders['x-forwarded-proto'];

    // For WebSocket upgrades, ensure hop-by-hop headers are present
    // (reverse proxies like nginx strip Upgrade and Connection headers)
    if (isUpgrade) {
      requestHeaders['upgrade'] = 'websocket';
      requestHeaders['connection'] = 'Upgrade';
    } else {
      delete requestHeaders['connection'];
    }

    requestHeaders['host'] = req.headers.host as string || `${systemConfig.getHost()}:${systemConfig.getPort()}`;
    requestHeaders['user-agent'] = 'openhab-cloud/0.0.1';

    // Strip off path prefix for remote vhosts hack
    let requestPath = req.path;
    if (requestPath.startsWith('/remote/')) {
      requestPath = requestPath.replace('/remote', '');
      requestHeaders['host'] = `${systemConfig.getProxyHost()}:${systemConfig.getProxyPort()}`;
    }

    // Send request to openhab agent module
    const openhab = req.openhab;
    if (!openhab) {
      logger.warn('Proxy request without openhab instance');
      res.status(500).json({ error: 'openHAB instance not available' });
      return;
    }

    io.sockets.in(openhab.uuid).emit('request', {
      id: requestId,
      method: req.method,
      headers: requestHeaders,
      path: requestPath,
      query: req.query,
      body: req.rawBody,
      userId: req.user?.username,
    });

    requestTracker.add(openhab, res, requestId);

    res.on('finish', () => {
      requestTracker.safeRemove(requestId);
    });

    res.on('close', () => {
      if (requestTracker.has(requestId) && openhab) {
        io.sockets.in(openhab.uuid).emit('cancel', { id: requestId });
        requestTracker.safeRemove(requestId);
      }
    });
  };
}

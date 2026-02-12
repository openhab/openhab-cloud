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
import type { UserService, PasswordResult } from '../services/user.service';
import type { OpenhabService } from '../services/openhab.service';
import type { ILogger } from '../types/notification';
import type { ValidatedRequest } from '../middleware/validation.middleware';
import type {
  LoginInput,
  RegisterInput,
  AccountUpdateInput,
  PasswordChangeInput,
  LostPasswordInput,
  PasswordResetInput,
} from '../schemas';

/**
 * Wraps an async request handler to properly catch and forward errors to Express
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * System configuration interface
 */
export interface IAccountSystemConfig {
  getBaseURL(): string;
  hasLegalTerms(): boolean;
  hasLegalPolicy(): boolean;
  isRegistrationEnabled(): boolean;
}

/**
 * Account Controller
 *
 * Handles account-related web routes:
 * - Registration
 * - Login/Logout
 * - Password management
 * - Account settings
 * - Account deletion
 */
export class AccountController {
  constructor(
    private readonly userService: UserService,
    private readonly openhabService: OpenhabService,
    private readonly systemConfig: IAccountSystemConfig,
    private readonly logger: ILogger
  ) {}

  // =========================================================================
  // Registration
  // =========================================================================

  /**
   * POST /register
   *
   * Register a new user account.
   */
  register: RequestHandler = asyncHandler(async (req: Request, res) => {
    const typedReq = req as ValidatedRequest<RegisterInput>;
    const { username, password, openhabuuid, openhabsecret, agree } = typedReq.validatedBody;

    // Check if legal terms agreement is required
    if (this.systemConfig.hasLegalTerms() || this.systemConfig.hasLegalPolicy()) {
      if (!agree) {
        req.flash('error', 'You must agree to the terms and privacy policy');
        return this.renderLogin(req, res);
      }
    }

    const result = await this.userService.register({
      username,
      password,
      openhabUuid: openhabuuid,
      openhabSecret: openhabsecret,
    });

    if (!result.success) {
      req.flash('error', result.error ?? 'Registration failed');
      return this.renderLogin(req, res);
    }

    // Log the user in
    // Cast to Express.User - the Mongoose model has the openhab method
    req.login(result.user! as Express.User, error => {
      if (error) {
        this.logger.error('Login after registration failed:', error);
        req.flash('error', 'Registration successful, but login failed. Please log in.');
        return res.redirect('/login');
      }

      req.flash('info', 'Your account successfully registered. Welcome to the openHAB cloud!');
      res.redirect('/');
    });
  });

  /**
   * GET /verify
   *
   * Verify user's email address.
   */
  verifyEmail: RequestHandler = asyncHandler(async (req, res) => {
    const code = req.query['code'];

    if (!code || typeof code !== 'string') {
      req.flash('error', 'Invalid verification code');
      return res.redirect('/');
    }

    const result = await this.userService.verifyEmail(code);

    if (result.success) {
      req.flash('info', 'E-Mail was successfully verified');
    } else {
      req.flash('error', result.error ?? 'Verification failed');
    }

    res.redirect('/');
  });

  // =========================================================================
  // Password Recovery
  // =========================================================================

  /**
   * GET /lostpassword
   *
   * Render the lost password form.
   */
  getLostPassword: RequestHandler = (req, res) => {
    res.render('lostpassword', {
      title: 'Lost my password',
      user: req.user,
      errormessages: req.flash('error'),
      infomessages: req.flash('info'),
    });
  };

  /**
   * POST /lostpassword
   *
   * Initiate password reset process.
   */
  postLostPassword: RequestHandler = asyncHandler(async (req: Request, res) => {
    const typedReq = req as ValidatedRequest<LostPasswordInput>;

    const result = await this.userService.initiatePasswordReset(typedReq.validatedBody.email);

    if (result.success) {
      req.flash(
        'info',
        "We've sent a password reset link to your e-mail address, if an account with this address exists."
      );
      res.redirect('/');
    } else {
      req.flash('error', result.error ?? 'Failed to process request');
      res.redirect('/lostpassword');
    }
  });

  /**
   * GET /lostpasswordreset
   *
   * Render the password reset form.
   */
  getLostPasswordReset: RequestHandler = (req, res) => {
    const resetCode = req.query['resetCode'];

    if (!resetCode) {
      return res.redirect('/');
    }

    res.render('lostpasswordreset', {
      title: 'Set your new password',
      user: req.user,
      resetCode,
      errormessages: req.flash('error'),
      infomessages: req.flash('info'),
    });
  };

  /**
   * POST /lostpasswordreset
   *
   * Complete password reset with new password.
   */
  postLostPasswordReset: RequestHandler = asyncHandler(async (req: Request, res) => {
    const typedReq = req as ValidatedRequest<PasswordResetInput>;
    const { password, resetCode } = typedReq.validatedBody;

    const result = await this.userService.resetPassword(resetCode, password);

    if (result.success) {
      req.flash('info', 'New password has been successfully set');
      res.redirect('/login');
    } else {
      req.flash('error', result.error ?? 'Failed to reset password');
      res.redirect(`/lostpasswordreset?resetCode=${resetCode}`);
    }
  });

  // =========================================================================
  // Account Settings
  // =========================================================================

  /**
   * GET /account
   *
   * Render account settings page.
   */
  getAccount: RequestHandler = (req, res) => {
    res.render('account', {
      title: 'Account',
      user: req.user,
      openhab: req.openhab,
      errormessages: req.flash('error'),
      infomessages: req.flash('info'),
    });
  };

  /**
   * POST /account
   *
   * Update or create openHAB UUID and secret.
   */
  postAccount: RequestHandler = asyncHandler(async (req: Request, res) => {
    const typedReq = req as ValidatedRequest<AccountUpdateInput>;
    const { openhabuuid, openhabsecret } = typedReq.validatedBody;

    if (!req.openhab) {
      // No existing openHAB - create a new one
      const result = await this.openhabService.create({
        account: req.user!.account,
        uuid: openhabuuid,
        secret: openhabsecret,
      });

      if (result.success) {
        req.flash('info', 'openHAB successfully registered');
      } else {
        req.flash('error', result.error ?? 'Failed to register openHAB');
      }
    } else {
      // Update existing openHAB
      const result = await this.openhabService.updateCredentials(
        req.openhab._id,
        openhabuuid,
        openhabsecret
      );

      if (result.success) {
        req.flash('info', 'openHAB settings successfully updated');
      } else {
        req.flash('error', result.error ?? 'Failed to update settings');
      }
    }

    res.redirect('/account');
  });

  /**
   * POST /accountpassword
   *
   * Change user password.
   */
  postAccountPassword: RequestHandler = asyncHandler(async (req: Request, res) => {
    const typedReq = req as ValidatedRequest<PasswordChangeInput>;
    const { oldpassword, password } = typedReq.validatedBody;

    const result = await this.userService.changePassword(req.user!._id, oldpassword, password);

    if (result.success) {
      req.flash('info', 'Password successfully changed');
    } else {
      req.flash('error', result.error ?? 'Failed to change password');
    }

    res.redirect('/account');
  });

  // =========================================================================
  // Account Deletion
  // =========================================================================

  /**
   * GET /accountdelete
   *
   * Render account deletion confirmation page.
   */
  getAccountDelete: RequestHandler = (req, res) => {
    res.render('accountdelete', {
      title: 'Delete my account',
      user: req.user,
      openhab: req.openhab,
      errormessages: req.flash('error'),
      infomessages: req.flash('info'),
    });
  };

  /**
   * POST /accountdelete
   *
   * Delete user account and all associated data.
   */
  postAccountDelete: RequestHandler = asyncHandler(async (req, res) => {
    this.logger.info(`Deleting data for ${req.user!.username}`);

    const result = await this.userService.deleteAccount(req.user!._id);

    if (result.success) {
      req.logout(err => {
        if (err) {
          this.logger.error('Logout after account deletion failed:', err);
        }
        res.redirect('/');
      });
    } else {
      req.flash('error', result.error ?? 'An error occurred during operation, please contact support');
      res.redirect('/accountdelete');
    }
  });

  /**
   * GET /itemsdelete
   *
   * Render items deletion confirmation page.
   */
  getItemsDelete: RequestHandler = (req, res) => {
    res.render('itemsdelete', {
      title: 'Delete my items and events',
      user: req.user,
      openhab: req.openhab,
      errormessages: req.flash('error'),
      infomessages: req.flash('info'),
    });
  };

  /**
   * POST /itemsdelete
   *
   * Delete user's items and events (but keep account).
   */
  postItemsDelete: RequestHandler = asyncHandler(async (req, res) => {
    const result = await this.userService.deleteItemsAndEvents(req.user!._id);

    if (result.success) {
      req.flash('info', 'Items and events deleted successfully');
    } else {
      req.flash('error', result.error ?? 'There was an error while processing your request');
    }

    res.redirect('/account');
  });

  // =========================================================================
  // Legacy Enrollment Routes (Redirect to login)
  // =========================================================================

  /**
   * GET /enroll
   */
  getEnroll: RequestHandler = (_req, res) => {
    res.redirect('/login');
  };

  /**
   * POST /enroll
   */
  postEnroll: RequestHandler = (_req, res) => {
    res.redirect('/login');
  };

  // =========================================================================
  // Private Helpers
  // =========================================================================

  private renderLogin(req: Request, res: any): void {
    res.render('login', {
      title: 'Login / Sign up',
      user: req.user,
      errormessages: req.flash('error'),
      infomessages: req.flash('info'),
    });
  }
}

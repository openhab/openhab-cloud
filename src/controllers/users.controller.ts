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

import type { RequestHandler, Request } from 'express';
import type { Types } from 'mongoose';
import type { IUser, UserRole } from '../types/models';
import type { ILogger } from '../types/notification';
import type { ValidatedRequest } from '../middleware/validation.middleware';
import type { AddUserInput } from '../schemas';

/**
 * Repository interface for User operations
 */
export interface IUserRepositoryForUsers {
  findByAccount(accountId: string | Types.ObjectId): Promise<IUser[]>;
  findByIdAndAccount(
    id: string | Types.ObjectId,
    accountId: string | Types.ObjectId
  ): Promise<IUser | null>;
  findByUsername(username: string): Promise<IUser | null>;
  registerToAccount(
    username: string,
    password: string,
    accountId: string | Types.ObjectId,
    role: UserRole
  ): Promise<IUser>;
  deleteById(id: string | Types.ObjectId): Promise<void>;
}

/**
 * Password service interface
 */
export interface IPasswordService {
  isComplexEnough(password: string): boolean;
  getComplexityError(): string;
}

/**
 * Users Controller
 *
 * Handles user management routes for account owners:
 * - List users in account
 * - Add new users
 * - Delete users
 */
export class UsersController {
  constructor(
    private readonly userRepository: IUserRepositoryForUsers,
    private readonly passwordService: IPasswordService,
    private readonly logger: ILogger
  ) {}

  /**
   * GET /users
   * GET /users/:id
   *
   * Display list of users in the account.
   */
  getUsers: RequestHandler = async (req, res) => {
    try {
      const users = await this.userRepository.findByAccount(req.user!.account);

      // Determine selected user
      let selectedUserId = '';
      let selectedUserArrayId = 0;

      const idParam = req.params['id'];
      if (idParam && typeof idParam === 'string') {
        selectedUserId = idParam;
      } else if (users.length > 0 && users[0]) {
        selectedUserId = users[0]._id.toString();
      }

      // Find the array index of selected user
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        if (user && user._id.toString() === selectedUserId) {
          selectedUserArrayId = i;
          break;
        }
      }

      res.render('users', {
        users,
        usersAction: 'list',
        selectedUserId,
        selectedUserArrayId,
        title: 'Users',
        user: req.user,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting users:', error);
      req.flash('error', 'Error loading users');
      res.redirect('/');
    }
  };

  /**
   * GET /users/add
   *
   * Display the add user form.
   */
  getAddUser: RequestHandler = async (req, res) => {
    try {
      const users = await this.userRepository.findByAccount(req.user!.account);

      res.render('users', {
        users,
        usersAction: 'add',
        selectedUserId: '',
        title: 'Users',
        user: req.user,
        errormessages: req.flash('error'),
        infomessages: req.flash('info'),
      });
    } catch (error) {
      this.logger.error('Error getting add user page:', error);
      req.flash('error', 'Error loading page');
      res.redirect('/users');
    }
  };

  /**
   * POST /users/add
   *
   * Add a new user to the account.
   */
  addUser: RequestHandler = async (req: Request, res) => {
    const typedReq = req as ValidatedRequest<AddUserInput>;

    try {
      const { username, password, role } = typedReq.validatedBody;

      // Check password complexity
      if (!this.passwordService.isComplexEnough(password)) {
        req.flash('error', this.passwordService.getComplexityError());
        return res.redirect('/users/add');
      }

      // Check if username already exists
      const existingUser = await this.userRepository.findByUsername(username);
      if (existingUser) {
        req.flash('error', 'This username already exists');
        return res.redirect('/users/add');
      }

      // Register the new user
      await this.userRepository.registerToAccount(username, password, req.user!.account, role);
      req.flash('info', 'User was added successfully');
      res.redirect('/users');
    } catch (error) {
      this.logger.error('Error adding user:', error);
      req.flash('error', 'There was an error adding user');
      res.redirect('/users/add');
    }
  };

  /**
   * GET /users/:id/delete
   *
   * Delete a user from the account.
   */
  deleteUser: RequestHandler = async (req, res) => {
    const userIdParam = req.params['id'];

    if (!userIdParam || typeof userIdParam !== 'string') {
      return res.redirect('/users');
    }

    // Validate ObjectId format
    if (!/^[0-9a-fA-F]{24}$/.test(userIdParam)) {
      req.flash('error', 'Invalid user ID');
      return res.redirect('/users');
    }

    const userId = userIdParam;

    try {
      // Prevent self-deletion
      if (userId === req.user!._id.toString()) {
        req.flash('error', "You can't delete yourself");
        return res.redirect('/users');
      }

      // Find the user and verify ownership
      const userToDelete = await this.userRepository.findByIdAndAccount(userId, req.user!.account);

      if (!userToDelete) {
        req.flash('error', 'User not found or does not belong to this account');
        return res.redirect('/users');
      }

      await this.userRepository.deleteById(userId);
      this.logger.info(`User deleted: ${userId}`);
      req.flash('info', 'User deleted');
      res.redirect('/users');
    } catch (error) {
      this.logger.error('Error deleting user:', error);
      req.flash('error', 'There was an error processing your request');
      res.redirect('/users');
    }
  };
}

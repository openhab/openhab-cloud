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

import { z } from 'zod';

// ============================================================================
// Password Validation
// ============================================================================

/**
 * Minimum password requirements:
 * - At least 8 characters (security best practice)
 * - Additional complexity is checked at service layer
 */
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters');

// ============================================================================
// Authentication Schemas
// ============================================================================

export const LoginSchema = z.object({
  username: z.string().email('Invalid email address').transform(s => s.toLowerCase()),
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const RegisterSchema = z.object({
  username: z.string().email('Invalid email address').transform(s => s.toLowerCase()),
  password: passwordSchema,
  openhabuuid: z.string().min(1, 'openHAB UUID is required').trim(),
  openhabsecret: z.string().min(1, 'openHAB secret is required').trim(),
  agree: z.string().optional(),
});
export type RegisterInput = z.infer<typeof RegisterSchema>;

// ============================================================================
// Account Schemas
// ============================================================================

export const AccountUpdateSchema = z.object({
  openhabuuid: z.string().min(1, 'openHAB UUID is required').trim(),
  openhabsecret: z.string().min(1, 'openHAB secret is required').trim(),
});
export type AccountUpdateInput = z.infer<typeof AccountUpdateSchema>;

export const PasswordChangeSchema = z.object({
  oldpassword: z.string().min(1, 'Old password is required'),
  password: passwordSchema,
  password1: z.string().min(1, 'Repeat new password is required'),
}).refine(data => data.password === data.password1, {
  message: "Passwords don't match",
  path: ['password1'],
});
export type PasswordChangeInput = z.infer<typeof PasswordChangeSchema>;

export const LostPasswordSchema = z.object({
  email: z.string().email('Invalid email address').transform(s => s.toLowerCase()),
});
export type LostPasswordInput = z.infer<typeof LostPasswordSchema>;

export const PasswordResetSchema = z.object({
  password: passwordSchema,
  password2: z.string().min(1, 'Repeat new password is required'),
  resetCode: z.string().min(1, 'Reset code is required'),
}).refine(data => data.password === data.password2, {
  message: "Passwords don't match",
  path: ['password2'],
});
export type PasswordResetInput = z.infer<typeof PasswordResetSchema>;

// ============================================================================
// User Management Schemas
// ============================================================================

export const AddUserSchema = z.object({
  username: z.string().email('Invalid email address').transform(s => s.toLowerCase()),
  password: passwordSchema,
  password1: z.string().min(1, 'Verify password is required'),
  role: z.enum(['user', 'master'], { message: "Role must be 'user' or 'master'" }),
}).refine(data => data.password === data.password1, {
  message: "Passwords don't match",
  path: ['password1'],
});
export type AddUserInput = z.infer<typeof AddUserSchema>;

// ============================================================================
// Device Schemas
// ============================================================================

export const SendMessageSchema = z.object({
  messagetext: z.string().min(1, 'Message text is required').trim(),
});
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

// ============================================================================
// Invitation Schemas
// ============================================================================

export const InvitationSchema = z.object({
  inviteemail: z.string().email('Invalid email address').transform(s => s.toLowerCase()),
});
export type InvitationInput = z.infer<typeof InvitationSchema>;

// ============================================================================
// Notification Schemas (API)
// ============================================================================

export const SendNotificationSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  message: z.string().min(1, 'Message is required'),
  icon: z.string().optional(),
  severity: z.string().optional(),
  tag: z.string().optional(),
});
export type SendNotificationInput = z.infer<typeof SendNotificationSchema>;

// ============================================================================
// FCM Registration Schemas
// ============================================================================

export const FCMRegistrationSchema = z.object({
  regId: z.string().min(1, 'Registration ID is required'),
  deviceId: z.string().min(1, 'Device ID is required'),
  deviceModel: z.string().optional(),
});
export type FCMRegistrationInput = z.infer<typeof FCMRegistrationSchema>;

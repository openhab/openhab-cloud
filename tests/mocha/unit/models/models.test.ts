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

import { expect } from 'chai';

// Import types only (no runtime dependencies)
import type {
  IUser,
  IUserAccount,
  IOpenhab,
  IUserDevice,
  INotification,
  INotificationPayload,
  IOAuth2Client,
  IOAuth2Token,
  IOAuth2Code,
  IOAuth2Scope,
  IEvent,
  IItem,
  IItemState,
  IEmailVerification,
  IInvitation,
  ILostPassword,
  IEnrollment,
  DeviceType,
  EventColor,
  UserRole,
  UserGroup,
} from '../../../../src/types/models';

describe('TypeScript Model Types', function () {
  describe('DeviceType', function () {
    it('should have correct values', function () {
      const iosDevice: DeviceType = 'ios';
      const androidDevice: DeviceType = 'android';
      expect(iosDevice).to.equal('ios');
      expect(androidDevice).to.equal('android');
    });
  });

  describe('EventColor', function () {
    it('should have correct values', function () {
      const colors: EventColor[] = ['good', 'bad', 'info'];
      expect(colors).to.deep.equal(['good', 'bad', 'info']);
    });
  });

  describe('UserRole', function () {
    it('should have correct values', function () {
      const roles: UserRole[] = ['master', 'user'];
      expect(roles).to.deep.equal(['master', 'user']);
    });
  });

  describe('UserGroup', function () {
    it('should have correct values', function () {
      const groups: UserGroup[] = ['staff', 'user'];
      expect(groups).to.deep.equal(['staff', 'user']);
    });
  });

  describe('IUser', function () {
    it('should allow creating typed user object', function () {
      const user: Partial<IUser> = {
        username: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        salt: 'test-salt',
        hash: 'test-hash',
        active: true,
        role: 'user',
        verifiedEmail: false,
        created: new Date(),
        registered: new Date(),
      };
      expect(user.username).to.equal('test@example.com');
      expect(user.role).to.equal('user');
      expect(user.active).to.be.true;
    });

    it('should allow master role', function () {
      const admin: Partial<IUser> = {
        username: 'admin@example.com',
        role: 'master',
      };
      expect(admin.role).to.equal('master');
    });

    it('should allow optional fields', function () {
      const user: Partial<IUser> = {
        username: 'test@example.com',
        // firstName, lastName, group, last_online are optional
      };
      expect(user.firstName).to.be.undefined;
      expect(user.lastName).to.be.undefined;
      expect(user.group).to.be.undefined;
    });
  });

  describe('IUserAccount', function () {
    it('should allow creating typed user account', function () {
      const account: Partial<IUserAccount> = {
        modified: new Date(),
        registered: new Date(),
      };
      expect(account.modified).to.be.instanceOf(Date);
    });
  });

  describe('IOpenhab', function () {
    it('should allow creating typed openhab object', function () {
      const openhab: Partial<IOpenhab> = {
        uuid: 'test-uuid-1234',
        secret: 'test-secret',
        name: 'My Home',
      };
      expect(openhab.uuid).to.equal('test-uuid-1234');
      expect(openhab.secret).to.equal('test-secret');
    });

    it('should have optional name and last_online', function () {
      const openhab: Partial<IOpenhab> = {
        uuid: 'uuid',
        secret: 'secret',
      };
      expect(openhab.name).to.be.undefined;
      expect(openhab.last_online).to.be.undefined;
    });
  });

  describe('IUserDevice', function () {
    it('should allow creating typed user device', function () {
      const device: Partial<IUserDevice> = {
        fcmRegistration: 'fcm-token-123',
        deviceType: 'android',
        deviceModel: 'Pixel 5',
        deviceId: 'device-id-123',
        lastUpdate: new Date(),
      };
      expect(device.deviceType).to.equal('android');
      expect(device.fcmRegistration).to.equal('fcm-token-123');
    });

    it('should allow ios device type', function () {
      const device: Partial<IUserDevice> = {
        deviceType: 'ios',
      };
      expect(device.deviceType).to.equal('ios');
    });
  });

  describe('INotificationPayload', function () {
    it('should allow creating notification payload', function () {
      const payload: INotificationPayload = {
        message: 'Test message',
        title: 'Test Title',
        icon: 'alarm',
        severity: 'high',
        tag: 'alert',
        type: 'notification',
        'reference-id': 'ref-123',
        actions: 'action1=Label1,action2=Label2',
      };
      expect(payload.message).to.equal('Test message');
      expect(payload['reference-id']).to.equal('ref-123');
    });

    it('should allow hideNotification type', function () {
      const payload: INotificationPayload = {
        message: '',
        type: 'hideNotification',
      };
      expect(payload.type).to.equal('hideNotification');
    });

    it('should allow custom properties via index signature', function () {
      const payload: INotificationPayload = {
        message: 'test',
        customField: 'custom value',
        anotherField: 123,
      };
      expect(payload['customField']).to.equal('custom value');
    });
  });

  describe('INotification', function () {
    it('should allow creating typed notification', function () {
      const notification: Partial<INotification> = {
        message: 'Test notification',
        icon: 'alarm',
        severity: 'high',
        acknowledged: false,
        payload: {
          message: 'Test notification',
          title: 'Alert',
          actions: 'action1,action2',
        },
        created: new Date(),
      };
      expect(notification.message).to.equal('Test notification');
      expect(notification.payload?.title).to.equal('Alert');
    });
  });

  describe('IOAuth2Client', function () {
    it('should allow creating typed OAuth2 client', function () {
      const client: Partial<IOAuth2Client> = {
        name: 'Test App',
        description: 'A test application',
        homeUrl: 'https://example.com',
        clientId: 'client-id-123',
        clientSecret: 'client-secret-456',
        active: true,
        created: new Date(),
      };
      expect(client.clientId).to.equal('client-id-123');
      expect(client.active).to.be.true;
    });
  });

  describe('IOAuth2Token', function () {
    it('should allow creating typed OAuth2 token', function () {
      const token: Partial<IOAuth2Token> = {
        token: 'access-token-123',
        scope: ['read', 'write'],
        valid: true,
        created: new Date(),
      };
      expect(token.token).to.equal('access-token-123');
      expect(token.scope).to.deep.equal(['read', 'write']);
    });
  });

  describe('IOAuth2Code', function () {
    it('should allow creating typed OAuth2 code', function () {
      const code: Partial<IOAuth2Code> = {
        code: 'auth-code-123',
        scope: ['read'],
        redirectURI: 'https://example.com/callback',
        valid: true,
        created: new Date(),
      };
      expect(code.code).to.equal('auth-code-123');
      expect(code.redirectURI).to.equal('https://example.com/callback');
    });
  });

  describe('IOAuth2Scope', function () {
    it('should allow creating typed OAuth2 scope', function () {
      const scope: Partial<IOAuth2Scope> = {
        name: 'read',
        description: 'Read access',
        valid: true,
        created: new Date(),
      };
      expect(scope.name).to.equal('read');
    });
  });

  describe('IEvent', function () {
    it('should allow creating typed event', function () {
      const event: Partial<IEvent> = {
        source: 'Temperature_Sensor',
        status: '25.5',
        oldStatus: '24.0',
        numericStatus: 25.5,
        oldNumericStatus: 24.0,
        color: 'good',
        when: new Date(),
      };
      expect(event.source).to.equal('Temperature_Sensor');
      expect(event.color).to.equal('good');
    });

    it('should allow all event colors', function () {
      const goodEvent: Partial<IEvent> = { color: 'good' };
      const badEvent: Partial<IEvent> = { color: 'bad' };
      const infoEvent: Partial<IEvent> = { color: 'info' };

      expect(goodEvent.color).to.equal('good');
      expect(badEvent.color).to.equal('bad');
      expect(infoEvent.color).to.equal('info');
    });
  });

  describe('IItemState', function () {
    it('should allow creating typed item state', function () {
      const state: IItemState = {
        when: new Date(),
        value: 'ON',
      };
      expect(state.value).to.equal('ON');
    });
  });

  describe('IItem', function () {
    it('should allow creating typed item', function () {
      const item: Partial<IItem> = {
        name: 'Living_Room_Light',
        type: 'Switch',
        label: 'Living Room Light',
        icon: 'light',
        status: 'ON',
        prev_status: 'OFF',
        last_update: new Date(),
        last_change: new Date(),
        states: [
          { when: new Date(), value: 'ON' },
          { when: new Date(), value: 'OFF' },
        ],
      };
      expect(item.name).to.equal('Living_Room_Light');
      expect(item.type).to.equal('Switch');
      expect(item.states).to.have.length(2);
    });
  });

  describe('IEmailVerification', function () {
    it('should allow creating typed email verification', function () {
      const verification: Partial<IEmailVerification> = {
        code: 'verify-code-123',
        email: 'test@example.com',
        used: false,
        created: new Date(),
      };
      expect(verification.code).to.equal('verify-code-123');
      expect(verification.used).to.be.false;
    });
  });

  describe('IInvitation', function () {
    it('should allow creating typed invitation', function () {
      const invitation: Partial<IInvitation> = {
        code: 'invite-code-123',
        email: 'invitee@example.com',
        used: false,
        created: new Date(),
      };
      expect(invitation.code).to.equal('invite-code-123');
    });
  });

  describe('ILostPassword', function () {
    it('should allow creating typed lost password', function () {
      const recovery: Partial<ILostPassword> = {
        recoveryCode: 'recovery-123',
        used: false,
        created: new Date(),
      };
      expect(recovery.recoveryCode).to.equal('recovery-123');
    });
  });

  describe('IEnrollment', function () {
    it('should allow creating typed enrollment', function () {
      const enrollment: Partial<IEnrollment> = {
        email: 'beta@example.com',
        platform: 'linux',
        javaExp: '5',
        description: 'Want to test new features',
        created: new Date(),
      };
      expect(enrollment.email).to.equal('beta@example.com');
      expect(enrollment.platform).to.equal('linux');
    });
  });
});

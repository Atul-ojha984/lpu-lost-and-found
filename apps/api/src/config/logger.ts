import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      'req.body.password',
      'req.body.confirmPassword',
      'req.body.currentPassword',
      'req.body.otp',
      'req.body.otpHash',
      'req.body.token',
      'req.body.refreshToken',
      'req.body.privateVault',
      'req.body.challengeAnswer',
      'password',
      'passwordHash',
      'otp',
      'otpHash',
      'token',
      'secret',
    ],
    remove: true,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

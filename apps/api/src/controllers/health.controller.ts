import { Request, Response } from 'express';
import { getDatabaseStatus } from '../config/database';
import { sendSuccess } from '../utils/api-response';
import { env } from '../config/env';

export function getHealth(req: Request, res: Response): void {
  const dbStatus = getDatabaseStatus();

  const healthData = {
    status: 'HEALTHY',
    service: 'LPU Lost & Found REST API',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      connected: dbStatus.isConnected,
      state: dbStatus.isConnected ? 'CONNECTED' : dbStatus.readyState === 2 ? 'CONNECTING' : 'DISCONNECTED',
      host: dbStatus.host || 'Not connected',
      name: dbStatus.name || 'None',
    },
    version: '1.0.0',
    memoryUsageMB: {
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    },
  };

  sendSuccess(res, healthData, 200, 'LPU Lost & Found API is operational');
}

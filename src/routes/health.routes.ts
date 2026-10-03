import { Router, type Request, type Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: 'ok' });
});

healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: 'ok', message: 'Roofing Construction API is running' });
});
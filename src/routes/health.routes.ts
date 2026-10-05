import { Router, type Request, type Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: 'ok' });
});

healthRouter.get('/health/diag', async (_req: Request, res: Response) => {
  try {
    const { env } = await import('../config/env.ts');
    const { db, publicDb } = await import('../config/supabase.ts');
    const { catalogService } = await import('../services/catalog.service.ts');

    const config = env();
    const supabaseHost = config.supabaseUrl.hostname;

    const { data: dbCat, error: dbCatErr } = await db.from('categories').select('id, name');
    const { data: pubCat, error: pubCatErr } = await publicDb.from('categories').select('id, name');
    const { data: dbProd, error: dbProdErr } = await db.from('products').select('id, name');
    const { data: pubProd, error: pubProdErr } = await publicDb.from('products_public').select('id, name');

    let catalogError: string | null = null;
    try {
      await catalogService.listProducts({ limit: 10 });
    } catch (err) {
      catalogError = err instanceof Error ? `${err.name}: ${err.message}\n${err.stack}` : String(err);
    }

    res.status(200).json({
      supabaseHost,
      dbCatCount: dbCat?.length ?? 0,
      dbCatErr: dbCatErr?.message ?? null,
      pubCatCount: pubCat?.length ?? 0,
      pubCatErr: pubCatErr?.message ?? null,
      dbProdCount: dbProd?.length ?? 0,
      dbProdErr: dbProdErr?.message ?? null,
      pubProdCount: pubProd?.length ?? 0,
      pubProdErr: pubProdErr?.message ?? null,
      catalogError,
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    });
  }
});

healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, status: 'ok', message: 'Roofing Construction API is running' });
});
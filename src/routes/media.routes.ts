import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';

import {
  SetPermissionSchema,
  UpdateImageSchema,
} from '../contracts/schemas/media.ts';
import type { ImageRole } from '../contracts/schemas/common.ts';
import { ValidationError } from '../lib/errors.ts';
import { requireAdmin } from '../middlewares/require-admin.ts';
import { mediaService } from '../services/media.service.ts';

export const mediaRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 8 * 1024 * 1024, // 8 MB limit
  },
});

function handleFileUpload(fieldName: string) {
  const uploadMiddleware = upload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction): void => {
    uploadMiddleware(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return next(new ValidationError('File size exceeds the 8MB limit'));
          }
          return next(new ValidationError(`Upload error: ${err.message}`));
        }
        return next(err);
      }
      next();
    });
  };
}

mediaRouter.post(
  '/api/admin/products/:productId/images',
  requireAdmin,
  handleFileUpload('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new ValidationError('File is required', [{ path: 'file', message: 'No file uploaded' }]);
      }

      const productId = req.params.productId as string;
      const { role, altText, source, sourceUrl, license } = req.body as Record<string, string | undefined>;

      const result = await mediaService.uploadProductImage({
        productId,
        fileBuffer: req.file.buffer,
        role: role as ImageRole | undefined,
        altText,
        source,
        sourceUrl,
        license,
        uploadedBy: req.user?.id,
      });

      res.status(201).json({
        success: true,
        image: result.image,
        suggestedAlt: result.suggestedAlt,
      });
    } catch (error) {
      next(error);
    }
  },
);

mediaRouter.get(
  '/api/admin/products/:productId/images',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const productId = req.params.productId as string;
      const items = await mediaService.listProductImagesForAdmin(productId);
      res.json({ success: true, items });
    } catch (error) {
      next(error);
    }
  },
);

mediaRouter.patch(
  '/api/admin/images/:imageId',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const imageId = req.params.imageId as string;
      const input = UpdateImageSchema.parse(req.body);
      const image = await mediaService.updateImage(imageId, input);
      res.json({ success: true, image });
    } catch (error) {
      next(error);
    }
  },
);

mediaRouter.patch(
  '/api/admin/images/:imageId/permission',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const imageId = req.params.imageId as string;
      const input = SetPermissionSchema.parse(req.body);
      const image = await mediaService.updateImagePermission(
        imageId,
        input.permissionStatus,
        req.user?.id,
        req.ip,
      );
      res.json({ success: true, image });
    } catch (error) {
      next(error);
    }
  },
);

mediaRouter.post(
  '/api/admin/images/:imageId/primary',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const imageId = req.params.imageId as string;
      await mediaService.setPrimaryImage(imageId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

mediaRouter.delete(
  '/api/admin/images/:imageId',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const imageId = req.params.imageId as string;
      await mediaService.deleteImage(imageId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  },
);

mediaRouter.post(
  '/api/admin/images/sweep',
  requireAdmin,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await mediaService.sweepSoftDeletedImages();
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

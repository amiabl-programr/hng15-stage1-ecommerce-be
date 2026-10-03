import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';

import { mediaController } from '../controllers/media.controller.ts';
import { ValidationError } from '../lib/errors.ts';
import { requireAdmin } from '../middlewares/require-admin.ts';

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
  mediaController.uploadProductImage,
);

mediaRouter.get(
  '/api/admin/products/:productId/images',
  requireAdmin,
  mediaController.listProductImages,
);

mediaRouter.patch(
  '/api/admin/images/:imageId',
  requireAdmin,
  mediaController.updateImage,
);

mediaRouter.patch(
  '/api/admin/images/:imageId/permission',
  requireAdmin,
  mediaController.setPermission,
);

mediaRouter.post(
  '/api/admin/images/:imageId/primary',
  requireAdmin,
  mediaController.setPrimary,
);

mediaRouter.delete(
  '/api/admin/images/:imageId',
  requireAdmin,
  mediaController.deleteImage,
);

mediaRouter.post(
  '/api/admin/images/sweep',
  requireAdmin,
  mediaController.sweepImages,
);

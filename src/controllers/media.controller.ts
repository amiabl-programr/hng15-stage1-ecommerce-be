import type { Request, Response, NextFunction } from 'express';

import {
  SetPermissionSchema,
  UpdateImageSchema,
} from '../contracts/schemas/media.ts';
import type { ImageRole } from '../contracts/schemas/common.ts';
import { ValidationError } from '../lib/errors.ts';
import { mediaService } from '../services/media.service.ts';

export async function uploadProductImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
}

export async function listProductImages(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const productId = req.params.productId as string;
    const items = await mediaService.listProductImagesForAdmin(productId);
    res.json({ success: true, items });
  } catch (error) {
    next(error);
  }
}

export async function updateImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const imageId = req.params.imageId as string;
    const input = UpdateImageSchema.parse(req.body);
    const image = await mediaService.updateImage(imageId, input);
    res.json({ success: true, image });
  } catch (error) {
    next(error);
  }
}

export async function setPermission(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
}

export async function setPrimary(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const imageId = req.params.imageId as string;
    await mediaService.setPrimaryImage(imageId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function deleteImage(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const imageId = req.params.imageId as string;
    await mediaService.deleteImage(imageId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function sweepImages(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await mediaService.sweepSoftDeletedImages();
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export const mediaController = {
  uploadProductImage,
  listProductImages,
  updateImage,
  setPermission,
  setPrimary,
  deleteImage,
  sweepImages,
};

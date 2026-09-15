import path from 'path';
import fs from 'fs-extra';
import multer from 'multer';
import crypto from 'crypto';
import { recordMediaFileOwnership } from './media-ownership';
import { dataUsageTracker } from './data-usage-tracker';

/**
 * Shared by API v1 (`/media/upload`) and v2 (`/media/upload`) so both
 * expose identical upload behavior — same allowed types, same audio
 * conversion for WhatsApp compatibility, same ownership/usage tracking.
 */
export const apiMediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadDir = path.join(process.cwd(), 'uploads', 'api');
      fs.ensureDirSync(uploadDir);
      cb(null, uploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueId = crypto.randomBytes(16).toString('hex');
      const fileExt = path.extname(file.originalname) || '';
      cb(null, `${uniqueId}${fileExt}`);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/3gpp',
      'audio/mpeg', 'audio/aac', 'audio/ogg', 'audio/mp4', 'audio/webm',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  }
});

export interface UploadedApiMedia {
  url: string;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  size: number;
  mimetype: string;
}

export async function processUploadedApiMedia(params: {
  file: Express.Multer.File;
  companyId?: number;
  baseUrl: string;
}): Promise<UploadedApiMedia> {
  const { file, companyId, baseUrl } = params;

  let finalUrl = `${baseUrl}/uploads/api/${path.basename(file.path)}`;
  let finalMimeType = file.mimetype;
  let finalSize = file.size;

  let mediaType: UploadedApiMedia['mediaType'];
  if (file.mimetype.startsWith('image/')) mediaType = 'image';
  else if (file.mimetype.startsWith('video/')) mediaType = 'video';
  else if (file.mimetype.startsWith('audio/')) mediaType = 'audio';
  else mediaType = 'document';

  if (mediaType === 'audio') {
    try {
      const { convertAudioForWhatsAppWithFallback } = await import('../utils/audio-converter');
      const tempDir = path.join(process.cwd(), 'temp', 'api-audio');
      await fs.ensureDir(tempDir);

      const conversionResult = await convertAudioForWhatsAppWithFallback(
        file.path,
        tempDir,
        file.originalname
      );

      if (!conversionResult || !conversionResult.outputPath) {
        throw new Error('Audio conversion failed: no output path');
      }

      const mediaDir = path.join(process.cwd(), 'public', 'media', 'audio');
      await fs.ensureDir(mediaDir);

      const convertedFileName = path.basename(conversionResult.outputPath);
      const publicMediaPath = path.join(mediaDir, convertedFileName);

      await fs.move(conversionResult.outputPath, publicMediaPath);

      // Strip codec parameters from MIME type for WhatsApp compatibility
      let cleanMimeType = conversionResult.mimeType;
      if (cleanMimeType.includes(';')) {
        cleanMimeType = cleanMimeType.split(';')[0].trim();
      }

      finalUrl = `${baseUrl}/media/audio/${convertedFileName}`;
      finalMimeType = cleanMimeType;
      finalSize = conversionResult.metadata.size || file.size;
    } catch (conversionError) {
      console.warn('API audio conversion failed, using original file:', conversionError);
      // Keep original file if conversion fails
    }
  }

  if (companyId) {
    dataUsageTracker.trackFileUpload(companyId, finalSize).catch((err) => {
      console.error('Failed to track API media upload:', err);
    });
    recordMediaFileOwnership({
      companyId,
      publicUrl: finalUrl,
      bucket: finalUrl.includes('/uploads/api/') ? 'uploads/api' : 'media/audio',
      fileSize: finalSize
    }).catch((err) => {
      console.error('Failed to record API media ownership:', err);
    });
  }

  return {
    url: finalUrl,
    mediaType,
    filename: file.originalname,
    size: finalSize,
    mimetype: finalMimeType
  };
}

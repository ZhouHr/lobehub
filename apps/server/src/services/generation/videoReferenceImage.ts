import { parseDataUri } from '@lobechat/model-runtime';

import type { FileService } from '@/server/services/file';

/** gufo rejects requests larger than 8 MB, so keep the inlined image below that. */
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const resolveMimeType = (key: string) => {
  const extension = key.toLowerCase().match(/\.(jpeg|jpg|png|webp)$/)?.[0];

  return (extension ? MIME_BY_EXTENSION[extension] : undefined) ?? 'image/png';
};

/**
 * gufo never fetches remote URLs: the first/last frame must be a multipart file or a
 * base64 `data:` URL. LobeHub stores uploaded reference images in S3 and passes their
 * full URLs to the provider, so inline the bytes before the request reaches gufo.
 */
export const inlineVideoReferenceImage = async (
  fileService: FileService,
  url: string,
): Promise<string> => {
  if (url.startsWith('data:')) {
    const { base64, mimeType } = parseDataUri(url);

    if (!base64 || !mimeType?.startsWith('image/')) {
      throw new Error('Invalid inline reference image: expected a base64 image data URL');
    }

    return url;
  }

  const key = (await fileService.getKeyFromFullUrl(url)) ?? url;
  const bytes = await fileService.getFileByteArray(key);

  if (bytes.byteLength === 0) {
    throw new Error('Failed to inline reference image: the file is empty');
  }

  if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
    throw new Error('Reference image is too large for gufo (max 5 MB)');
  }

  return `data:${resolveMimeType(key)};base64,${Buffer.from(bytes).toString('base64')}`;
};

import { describe, expect, it, vi } from 'vitest';

import type { FileService } from '@/server/services/file';

import { inlineVideoReferenceImage } from './videoReferenceImage';

const createFileService = (overrides: Partial<FileService> = {}) =>
  ({
    getFileByteArray: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    getKeyFromFullUrl: vi.fn().mockResolvedValue('images/frame.png'),
    ...overrides,
  }) as unknown as FileService;

describe('inlineVideoReferenceImage', () => {
  it('converts an uploaded S3 URL into a base64 data URL', async () => {
    const fileService = createFileService();

    await expect(
      inlineVideoReferenceImage(fileService, 'https://s3.example.com/images/frame.png'),
    ).resolves.toBe('data:image/png;base64,AQID');

    expect(fileService.getKeyFromFullUrl).toHaveBeenCalledWith(
      'https://s3.example.com/images/frame.png',
    );
    expect(fileService.getFileByteArray).toHaveBeenCalledWith('images/frame.png');
  });

  it('passes an already inlined data URL through', async () => {
    const fileService = createFileService();

    await expect(
      inlineVideoReferenceImage(fileService, 'data:image/webp;base64,AQID'),
    ).resolves.toBe('data:image/webp;base64,AQID');

    expect(fileService.getKeyFromFullUrl).not.toHaveBeenCalled();
  });

  it('uses the file extension for the MIME type', async () => {
    const fileService = createFileService({
      getFileByteArray: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      getKeyFromFullUrl: vi.fn().mockResolvedValue('images/frame.jpg'),
    });

    await expect(
      inlineVideoReferenceImage(fileService, 'https://s3.example.com/images/frame.jpg'),
    ).resolves.toBe('data:image/jpeg;base64,AQID');
  });

  it('rejects an empty file', async () => {
    const fileService = createFileService({
      getFileByteArray: vi.fn().mockResolvedValue(new Uint8Array()),
    });

    await expect(
      inlineVideoReferenceImage(fileService, 'https://s3.example.com/images/frame.png'),
    ).rejects.toThrow('the file is empty');
  });

  it('rejects an image above the gufo request budget', async () => {
    const fileService = createFileService({
      getFileByteArray: vi.fn().mockResolvedValue(new Uint8Array(5 * 1024 * 1024 + 1)),
    });

    await expect(
      inlineVideoReferenceImage(fileService, 'https://s3.example.com/images/frame.png'),
    ).rejects.toThrow('too large');
  });
});

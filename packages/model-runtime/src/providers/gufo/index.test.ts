// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateVideoOptions } from '../../core/openaiCompatible';
import type { CreateVideoPayload } from '../../types/video';
import { createGufoVideo, pollGufoVideoStatus } from './index';

vi.mock('debug', () => ({
  default: vi.fn(() => vi.fn()),
}));

const mockOptions: CreateVideoOptions = {
  apiKey: 'test-token',
  baseURL: 'http://gufo-gateway:8080/v1',
  provider: 'gufo',
};

const createPayload = (params: CreateVideoPayload['params']): CreateVideoPayload => ({
  model: 'minimax-h3-fast',
  params,
});

describe('createGufoVideo', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the OpenAI-compatible fields gufo expects', async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ id: 'gufo-task-1' }),
      ok: true,
    } as Response);

    const result = await createGufoVideo(
      createPayload({ duration: 5, prompt: 'a red fox in snow', size: '512x512' }),
      mockOptions,
    );

    expect(fetch).toHaveBeenCalledWith(
      'http://gufo-gateway:8080/v1/videos',
      expect.objectContaining({ method: 'POST' }),
    );

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);

    expect(body).toEqual({
      model: 'minimax-h3-fast',
      prompt: 'a red fox in snow',
      seconds: 5,
      size: '512x512',
    });
    expect(result).toEqual({ inferenceId: 'gufo-task-1' });
  });

  it('maps first and last frames to first_frame and last_frame', async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ id: 'gufo-task-2' }),
      ok: true,
    } as Response);

    await createGufoVideo(
      createPayload({
        duration: 1,
        endImageUrl: 'data:image/png;base64,AAAA',
        imageUrl: 'data:image/png;base64,BBBB',
        prompt: 'morph',
        size: '512x512',
      }),
      mockOptions,
    );

    const body = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);

    expect(body.first_frame).toBe('data:image/png;base64,BBBB');
    expect(body.last_frame).toBe('data:image/png;base64,AAAA');
    expect(body).not.toHaveProperty('input_reference');
  });

  it('rejects remote image URLs that gufo cannot fetch', async () => {
    await expect(
      createGufoVideo(
        createPayload({
          duration: 5,
          imageUrl: 'https://cdn.example.com/frame.png',
          prompt: 'a fox',
          size: '512x512',
        }),
        mockOptions,
      ),
    ).rejects.toThrow('requires first_frame as a base64 data URL');
  });

  it('turns a full gufo queue into a readable error', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'queue full',
    } as Response);

    await expect(
      createGufoVideo(createPayload({ duration: 5, prompt: 'a fox', size: '512x512' }), mockOptions),
    ).rejects.toThrow('gufo is busy');
  });
});

describe('pollGufoVideoStatus', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('builds a gateway content URL once gufo completes', async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({ id: 'gufo-task-1', status: 'completed' }),
      ok: true,
    } as Response);

    await expect(pollGufoVideoStatus('gufo-task-1', mockOptions)).resolves.toEqual({
      headers: { Authorization: 'Bearer test-token' },
      status: 'success',
      videoUrl: 'http://gufo-gateway:8080/v1/videos/gufo-task-1/content',
    });
  });

  it('treats a missing task as failed instead of retrying until timeout', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'not found',
    } as Response);

    await expect(pollGufoVideoStatus('gufo-task-404', mockOptions)).resolves.toEqual({
      error: 'gufo video task not found or expired',
      status: 'failed',
    });
  });
});

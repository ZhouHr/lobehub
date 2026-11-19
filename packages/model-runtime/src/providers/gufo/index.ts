import createDebug from 'debug';
import { ModelProvider } from 'model-bank';

import type {
  CreateVideoOptions,
  OpenAICompatibleFactoryOptions,
} from '../../core/openaiCompatible';
import {
  createOpenAICompatibleRuntime,
  pollOpenAICompatibleVideoStatus,
} from '../../core/openaiCompatible';
import type { CreateVideoPayload, CreateVideoResult, PollVideoStatusResult } from '../../types/video';
import { resolveMappedModelId } from '../../utils/modelIdMapping';

const log = createDebug('lobe-video:gufo');

/**
 * gufo binds the preset to the model alias and only serves two sizes. Keep the
 * validation here as well as in the model cards: agent tools and API callers can
 * bypass the UI.
 */
const GUFO_SIZES = new Set(['512x512', '1344x768']);
const GUFO_DEFAULT_BASE_URL = 'http://127.0.0.1:8080/v1';

const normalizeBaseURL = (baseURL?: string | null) =>
  (baseURL || process.env.GUFO_BASE_URL || GUFO_DEFAULT_BASE_URL).replace(/\/+$/, '');

const isSupportedDuration = (duration: number) =>
  duration === 1 || (duration >= 5 && duration <= 14.375);

/**
 * gufo refuses `input_reference` and never fetches remote image URLs, so first and
 * last frames must already be data URLs. The server-side lambda inlines uploaded
 * images before calling this; anything else is rejected with a clear message.
 */
const assertInlineImage = (value: string, field: 'first_frame' | 'last_frame') => {
  if (!value.startsWith('data:image/')) {
    throw new Error(
      `gufo requires ${field} as a base64 data URL; the ai07 deployment does not fetch remote image URLs`,
    );
  }
};

export async function createGufoVideo(
  payload: CreateVideoPayload,
  options: CreateVideoOptions,
): Promise<CreateVideoResult> {
  const { model, params } = payload;
  const requestModel = resolveMappedModelId(model, options);
  const baseURL = normalizeBaseURL(options.baseURL);

  if (params.size && !GUFO_SIZES.has(params.size)) {
    throw new Error(`gufo does not support size ${params.size}; use 512x512 or 1344x768`);
  }

  if (typeof params.duration === 'number' && !isSupportedDuration(params.duration)) {
    throw new Error(`gufo does not support ${params.duration}s; use 1s or 5–14.375s`);
  }

  const body: Record<string, unknown> = {
    model: requestModel,
    prompt: params.prompt,
  };

  if (params.size) body.size = params.size;
  if (typeof params.duration === 'number') body.seconds = params.duration;

  if (params.imageUrl) {
    assertInlineImage(params.imageUrl, 'first_frame');
    body.first_frame = params.imageUrl;
  }

  if (params.endImageUrl) {
    assertInlineImage(params.endImageUrl, 'last_frame');
    body.last_frame = params.endImageUrl;
  }

  log('Creating video with gufo - model: %s, params: %O', requestModel, {
    ...params,
    imageUrl: params.imageUrl ? '<inline>' : undefined,
    endImageUrl: params.endImageUrl ? '<inline>' : undefined,
  });

  const response = await fetch(`${baseURL}/videos`, {
    body: JSON.stringify(body),
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const errorText = await response.text();

    if (response.status === 429) {
      throw new Error('gufo is busy: the ai07 video queue is full, please retry later');
    }

    if (response.status === 503) {
      throw new Error('gufo is not ready: the ai07 video service is unavailable or the GPU was lost');
    }

    throw new Error(`gufo video API error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { id?: string };

  if (!data?.id) throw new Error('Invalid response from gufo: missing video id');

  return { inferenceId: data.id };
}

/**
 * gufo deletes finished jobs after its TTL; a 404 is terminal, not a transient
 * polling failure. The default OpenAI-compatible poller treats every HTTP error
 * as retryable, so a deleted job would otherwise sit pending until the task timeout.
 */
export async function pollGufoVideoStatus(
  inferenceId: string,
  options: CreateVideoOptions,
): Promise<PollVideoStatusResult> {
  try {
    return await pollOpenAICompatibleVideoStatus(inferenceId, {
      apiKey: options.apiKey,
      baseURL: normalizeBaseURL(options.baseURL),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('404')) {
      return { error: 'gufo video task not found or expired', status: 'failed' };
    }

    throw error;
  }
}

export const gufoParams = {
  baseURL: normalizeBaseURL(),
  createVideo: createGufoVideo,
  handlePollVideoStatus: pollGufoVideoStatus,
  provider: ModelProvider.Gufo,
} satisfies OpenAICompatibleFactoryOptions;

export const LobeGufoAI = createOpenAICompatibleRuntime(gufoParams);

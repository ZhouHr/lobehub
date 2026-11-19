import type { AIVideoModelCard } from '../types/aiModel';

/**
 * MiniMax H3 models served by gufo on ai07.
 *
 * gufo binds the preset to the model alias and only accepts two sizes
 * (`512x512` and `1344x768`), so each card exposes exactly one size. Durations are
 * limited per preset to keep a request inside the video polling budget: exact at
 * 5s already takes about 19 minutes, and fullres is only offered at 1s.
 */
const gufoVideoModels: AIVideoModelCard[] = [
  {
    description:
      'MiniMax H3 fast preset on ai07: 20 steps at 512×512, about 4 minutes for 5s with native audio.',
    displayName: 'H3 (ai07, fast)',
    enabled: true,
    id: 'minimax-h3-fast',
    parameters: {
      duration: { default: 5, enum: [1, 5, 10] },
      endImageUrl: { default: null },
      imageUrl: { default: null },
      prompt: { default: '' },
      size: { default: '512x512', enum: ['512x512'] },
    },
    releasedAt: '2026-11-18',
    type: 'video',
  },
  {
    description:
      'MiniMax H3 aggressive preset on ai07: skips more work than fast, about 3 minutes for 5s at 512×512 with native audio.',
    displayName: 'H3 (ai07, aggressive)',
    enabled: true,
    id: 'minimax-h3-aggressive',
    parameters: {
      duration: { default: 5, enum: [1, 5, 10] },
      endImageUrl: { default: null },
      imageUrl: { default: null },
      prompt: { default: '' },
      size: { default: '512x512', enum: ['512x512'] },
    },
    releasedAt: '2026-11-18',
    type: 'video',
  },
  {
    description:
      'MiniMax H3 released schedule (49 steps) on ai07 at 512×512 with native audio. 5s takes about 19 minutes; keep it for short clips.',
    displayName: 'H3 (ai07, exact)',
    enabled: true,
    id: 'minimax-h3',
    parameters: {
      duration: { default: 1, enum: [1, 5] },
      endImageUrl: { default: null },
      imageUrl: { default: null },
      prompt: { default: '' },
      size: { default: '512x512', enum: ['512x512'] },
    },
    releasedAt: '2026-11-18',
    type: 'video',
  },
  {
    description:
      'MiniMax H3 full resolution on ai07 at 1344×768 with native audio. One second takes about 12 minutes; only 1s is offered.',
    displayName: 'H3 (ai07, 1344×768)',
    enabled: true,
    id: 'minimax-h3-fullres',
    parameters: {
      duration: { default: 1, enum: [1] },
      endImageUrl: { default: null },
      imageUrl: { default: null },
      prompt: { default: '' },
      size: { default: '1344x768', enum: ['1344x768'] },
    },
    releasedAt: '2026-11-18',
    type: 'video',
  },
];

export const allModels = [...gufoVideoModels];

export default allModels;

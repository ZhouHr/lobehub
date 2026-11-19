'use client';

import { Block, Center, Progress, Spin, Text } from '@lobehub/ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { MAX_ESTIMATED_PROGRESS, useEstimatedProgress } from '@/hooks/useEstimatedProgress';
import { ElapsedTime } from '@/routes/(main)/(create)/image/features/GenerationFeed/GenerationItem/ElapsedTime';
import { AsyncTaskStatus } from '@/types/asyncTask';
import type { Generation } from '@/types/generation';

const DEFAULT_AVG_LATENCY_MS = 180_000;

const getSessionStorageKey = (generationId: string) => `generation_start_time_${generationId}`;

interface VideoLoadingItemProps {
  aspectRatio?: string;
  avgLatencyMs?: number | null;
  generation: Generation;
}

const VideoLoadingItem = memo<VideoLoadingItemProps>(
  ({ generation, aspectRatio, avgLatencyMs }) => {
    const { t } = useTranslation('video');
    const latency = avgLatencyMs && avgLatencyMs > 0 ? avgLatencyMs : DEFAULT_AVG_LATENCY_MS;
    const queuePosition = generation.task.queuePosition;
    const isGenerating =
      generation.task.status === AsyncTaskStatus.Processing ||
      generation.task.status === AsyncTaskStatus.Pending;

    const progress = useEstimatedProgress({
      durationMs: latency,
      enabled: isGenerating,
      storageKey: getSessionStorageKey(generation.id),
    });

    return (
      <Block
        align={'center'}
        justify={'center'}
        variant={'filled'}
        style={{
          aspectRatio: aspectRatio?.includes(':') ? aspectRatio.replace(':', '/') : '16/9',
          maxHeight: '50vh',
        }}
      >
        <Center gap={8}>
          {progress !== null ? <Progress percent={progress} size={48} type="circle" /> : <Spin />}
          {queuePosition != null && queuePosition > 0 && (
            <Text fontSize={12} type={'secondary'}>
              {t('generation.status.queued', { position: String(queuePosition) })}
            </Text>
          )}
          {progress === MAX_ESTIMATED_PROGRESS && (
            <ElapsedTime generationId={generation.id} isActive={isGenerating} />
          )}
        </Center>
      </Block>
    );
  },
);

VideoLoadingItem.displayName = 'VideoLoadingItem';

export default VideoLoadingItem;

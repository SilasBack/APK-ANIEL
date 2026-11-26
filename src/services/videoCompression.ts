import { Video, getVideoMetaData, getFileSize } from 'react-native-compressor';
import { CONFIG } from '../constants/config';

export const VIDEO_TARGET_BYTES = 90 * 1024 * 1024; // 90 MB
const AUDIO_BITRATE_BPS = 128_000;
const CONTAINER_OVERHEAD_FACTOR = 0.94;
const MIN_VIDEO_BITRATE_BPS = 300_000;

export interface VideoCompressionResult {
  uri: string;
  size: number;
  mime: 'video/mp4';
  ext: 'mp4';
  originalSize: number;
  compressed: boolean;
}

export function calculateTargetBitrateBps(durationSeconds: number, targetBytes = VIDEO_TARGET_BYTES): number {
  const safeDuration = Math.max(1, durationSeconds);
  const totalBitsPerSec = (targetBytes * 8 * CONTAINER_OVERHEAD_FACTOR) / safeDuration;
  return Math.max(MIN_VIDEO_BITRATE_BPS, Math.floor(totalBitsPerSec - AUDIO_BITRATE_BPS));
}

function chooseMaxDimension(bitrateBps: number): number {
  if (bitrateBps < 1_500_000) return 720;
  if (bitrateBps < 3_500_000) return 1080;
  return 1280;
}

async function resolveFileSizeBytes(uri: string, fallbackSize?: number): Promise<number> {
  try {
    const meta = await getVideoMetaData(uri);
    if (typeof meta?.size === 'number' && Number.isFinite(meta.size) && meta.size > 0) {
      return meta.size;
    }
  } catch {
    // Fallback to getFileSize below
  }
  try {
    const raw = await getFileSize(uri);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  } catch {
    // Ignore
  }
  return fallbackSize && fallbackSize > 0 ? fallbackSize : 0;
}

export async function compressVideoIfNeededAsync(
  uri: string,
  knownFileSizeBytes?: number | null,
  knownDurationMs?: number | null,
  onProgress?: (percent: number, pass: 1 | 2) => void
): Promise<VideoCompressionResult> {
  let durationSec = knownDurationMs && knownDurationMs > 0 ? knownDurationMs / 1000 : 0;
  let originalSize = knownFileSizeBytes && knownFileSizeBytes > 0 ? knownFileSizeBytes : 0;

  try {
    const meta = await getVideoMetaData(uri);
    if (meta?.duration && meta.duration > 0) {
      durationSec = meta.duration;
    }
    if (meta?.size && meta.size > 0) {
      originalSize = meta.size;
    }
  } catch {
    // Use picker metadata fallback if available
  }

  if (originalSize <= 0) {
    originalSize = await resolveFileSizeBytes(uri);
  }

  if (originalSize <= 0) {
    throw new Error('Não foi possível identificar o tamanho do vídeo selecionado.');
  }

  if (originalSize < CONFIG.ATTACHMENT_LIMIT_BYTES) {
    return {
      uri,
      size: originalSize,
      mime: 'video/mp4',
      ext: 'mp4',
      originalSize,
      compressed: false,
    };
  }

  if (durationSec <= 0) {
    // Conservative fallback if duration metadata is unavailable
    durationSec = Math.max(10, Math.round(originalSize / (1.5 * 1024 * 1024)));
  }

  // Pass 1: target ~90 MB
  let targetBitrate = calculateTargetBitrateBps(durationSec, VIDEO_TARGET_BYTES);
  let compressedUri = await Video.compress(
    uri,
    {
      compressionMethod: 'manual',
      bitrate: targetBitrate,
      maxSize: chooseMaxDimension(targetBitrate),
      preserveMetadata: true,
    },
    (progress) => {
      onProgress?.(Math.min(99, Math.max(0, Math.round(progress * 100))), 1);
    }
  );

  let compressedSize = await resolveFileSizeBytes(compressedUri);

  // Pass 2: if hardware VBR encoder overshot 100 MB, re-compress proportionally below 90 MB
  if (compressedSize >= CONFIG.ATTACHMENT_LIMIT_BYTES || compressedSize <= 0) {
    const scaleFactor =
      compressedSize > 0
        ? Math.min(0.85, (VIDEO_TARGET_BYTES / compressedSize) * 0.85)
        : 0.65;
    targetBitrate = Math.max(MIN_VIDEO_BITRATE_BPS, Math.floor(targetBitrate * scaleFactor));
    compressedUri = await Video.compress(
      uri,
      {
        compressionMethod: 'manual',
        bitrate: targetBitrate,
        maxSize: 720,
        preserveMetadata: true,
      },
      (progress) => {
        onProgress?.(Math.min(99, Math.max(0, Math.round(progress * 100))), 2);
      }
    );
    compressedSize = await resolveFileSizeBytes(compressedUri);
  }

  if (compressedSize <= 0 || compressedSize >= CONFIG.ATTACHMENT_LIMIT_BYTES) {
    const mb = compressedSize > 0 ? `${(compressedSize / 1048576).toFixed(1)} MB` : 'tamanho desconhecido';
    throw new Error(
      `O vídeo comprimido ainda ficou acima do limite de 100 MB (${mb}). Tente um vídeo mais curto.`
    );
  }

  onProgress?.(100, 1);

  return {
    uri: compressedUri,
    size: compressedSize,
    mime: 'video/mp4',
    ext: 'mp4',
    originalSize,
    compressed: true,
  };
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

export const STORAGE_ALERT_LIMIT_BYTES = 1024 * 1024 * 1024; // 1 GB
const DRAFT_KEY_PREFIX = '@aniel_detail_draft_';
const AUTO_CLEANUP_KEY = '@aniel_auto_cleanup_enabled';

export interface StorageStats {
  draftCount: number;
  draftBytes: number;
  mediaFileCount: number;
  mediaBytes: number;
  totalBytes: number;
  limitBytes: number;
  exceedsLimit: boolean;
}

export interface CleanupResult {
  removedDrafts: number;
  removedFiles: number;
  freedBytes: number;
  remaining: StorageStats;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2).replace('.', ',')} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function getManagedDirectories(): Directory[] {
  const dirs: Directory[] = [];
  try {
    if (Paths?.cache) dirs.push(Paths.cache);
  } catch {
    // Ignore if unavailable in test environment
  }
  try {
    if (Paths?.document) {
      dirs.push(new Directory(Paths.document, 'aniel_videos'));
    }
  } catch {
    // Ignore if unavailable
  }
  return dirs;
}

function scanDirectoryRecursive(
  dir: Directory,
  depth = 0
): { count: number; bytes: number } {
  if (depth > 6) return { count: 0, bytes: 0 };
  let count = 0;
  let bytes = 0;
  try {
    if (!dir.exists) return { count: 0, bytes: 0 };
    const entries = dir.list();
    for (const entry of entries) {
      if (entry instanceof Directory) {
        const sub = scanDirectoryRecursive(entry, depth + 1);
        count += sub.count;
        bytes += sub.bytes;
      } else if (entry instanceof File) {
        count += 1;
        const size = typeof entry.size === 'number' && entry.size > 0 ? entry.size : 0;
        bytes += size;
      }
    }
  } catch {
    // Skip protected or transient OS cache folders
  }
  return { count, bytes };
}

function clearDirectoryContents(
  dir: Directory,
  depth = 0
): { removedFiles: number; freedBytes: number } {
  if (depth > 6) return { removedFiles: 0, freedBytes: 0 };
  let removedFiles = 0;
  let freedBytes = 0;
  try {
    if (!dir.exists) return { removedFiles: 0, freedBytes: 0 };
    const entries = dir.list();
    for (const entry of entries) {
      if (entry instanceof Directory) {
        const sub = clearDirectoryContents(entry, depth + 1);
        removedFiles += sub.removedFiles;
        freedBytes += sub.freedBytes;
        try {
          if (entry.list().length === 0) {
            entry.delete();
          }
        } catch {
          // Keep system-owned subdirectory if Android locks it
        }
      } else if (entry instanceof File) {
        const size = typeof entry.size === 'number' && entry.size > 0 ? entry.size : 0;
        try {
          entry.delete();
          removedFiles += 1;
          freedBytes += size;
        } catch {
          // Skip file currently in use
        }
      }
    }
  } catch {
    // Ignore unreadable directories
  }
  return { removedFiles, freedBytes };
}

export async function getAutoCleanupEnabledAsync(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(AUTO_CLEANUP_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setAutoCleanupEnabledAsync(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(AUTO_CLEANUP_KEY, enabled ? 'true' : 'false');
}

export async function inspectAppStorageAsync(): Promise<StorageStats> {
  let draftCount = 0;
  let draftBytes = 0;

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const draftKeys = allKeys.filter((k) => k.startsWith(DRAFT_KEY_PREFIX));
    if (draftKeys.length > 0) {
      const pairs = await AsyncStorage.multiGet(draftKeys);
      for (const [, value] of pairs) {
        draftCount += 1;
        if (value) draftBytes += utf8ByteLength(value);
      }
    }
  } catch {
    // Non-fatal
  }

  let mediaFileCount = 0;
  let mediaBytes = 0;
  for (const dir of getManagedDirectories()) {
    const res = scanDirectoryRecursive(dir);
    mediaFileCount += res.count;
    mediaBytes += res.bytes;
  }

  const totalBytes = draftBytes + mediaBytes;
  return {
    draftCount,
    draftBytes,
    mediaFileCount,
    mediaBytes,
    totalBytes,
    limitBytes: STORAGE_ALERT_LIMIT_BYTES,
    exceedsLimit: totalBytes >= STORAGE_ALERT_LIMIT_BYTES,
  };
}

export async function cleanupAppStorageAsync(options?: {
  clearDrafts?: boolean;
  clearMedia?: boolean;
}): Promise<CleanupResult> {
  const clearDrafts = options?.clearDrafts !== false;
  const clearMedia = options?.clearMedia !== false;

  let removedDrafts = 0;
  let removedFiles = 0;
  let freedBytes = 0;

  if (clearDrafts) {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const draftKeys = allKeys.filter((k) => k.startsWith(DRAFT_KEY_PREFIX));
      if (draftKeys.length > 0) {
        const pairs = await AsyncStorage.multiGet(draftKeys);
        for (const [, value] of pairs) {
          if (value) freedBytes += utf8ByteLength(value);
        }
        await AsyncStorage.multiRemove(draftKeys);
        removedDrafts = draftKeys.length;
      }
    } catch {
      // Non-fatal
    }
  }

  if (clearMedia) {
    for (const dir of getManagedDirectories()) {
      const res = clearDirectoryContents(dir);
      removedFiles += res.removedFiles;
      freedBytes += res.freedBytes;
    }
  }

  const remaining = await inspectAppStorageAsync();
  return {
    removedDrafts,
    removedFiles,
    freedBytes,
    remaining,
  };
}

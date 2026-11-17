import { File as ExpoFile } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, '');
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  let padding = 0;
  if (clean.endsWith('==')) padding = 2;
  else if (clean.endsWith('=')) padding = 1;
  const byteLength = Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
  const bytes = new Uint8Array(byteLength);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const b0 = lookup[clean.charCodeAt(i)];
    const b1 = lookup[clean.charCodeAt(i + 1)];
    const b2 = lookup[clean.charCodeAt(i + 2)];
    const b3 = lookup[clean.charCodeAt(i + 3)];
    bytes[p++] = (b0 << 2) | (b1 >> 4);
    if (p < byteLength) bytes[p++] = ((b1 & 15) << 4) | (b2 >> 2);
    if (p < byteLength) bytes[p++] = ((b2 & 3) << 6) | (b3 & 63);
  }
  return bytes;
}

export async function readLocalFileBytesAsync(uri: string): Promise<Uint8Array> {
  const trimmed = (uri || '').trim();
  if (!trimmed) {
    throw new Error('URI do arquivo inválida ou vazia.');
  }

  // 1. Data URLs
  if (trimmed.startsWith('data:')) {
    return base64ToUint8Array(trimmed);
  }

  // 2. Try modern Expo File API
  try {
    const file = new ExpoFile(trimmed);
    if (typeof file.bytes === 'function') {
      const data = await file.bytes();
      if (data && data.length > 0) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      }
    }
  } catch {
    // Ignore and proceed to legacy fallback
  }

  // 3. Try legacy FileSystem.readAsStringAsync
  try {
    const base64 = await LegacyFS.readAsStringAsync(trimmed, {
      encoding: LegacyFS.EncodingType.Base64,
    });
    if (base64) {
      return base64ToUint8Array(base64);
    }
  } catch {
    // Ignore and proceed to fetch fallback
  }

  // 4. Try global fetch arrayBuffer
  try {
    const res = await fetch(trimmed);
    if (res.ok || res.status === 200 || res.status === 0) {
      const buf = await res.arrayBuffer();
      if (buf && buf.byteLength > 0) {
        return new Uint8Array(buf);
      }
    }
  } catch {
    // Ignore
  }

  throw new Error(`Não foi possível ler os dados do arquivo local: ${trimmed.slice(0, 60)}...`);
}

export interface UploadFileItem {
  name: string;
  uri: string;
  type?: string;
}

export async function createFormDataFilePart(file: UploadFileItem): Promise<any> {
  const mimeType = file.type || 'image/jpeg';
  const fileName = file.name;

  // Pre-load bytes so that convertFormDataAsync can read synchronously or immediately
  let cachedBytes: Uint8Array | null = null;
  try {
    cachedBytes = await readLocalFileBytesAsync(file.uri);
  } catch (err) {
    console.warn('[FileUpload] Aviso ao ler bytes antecipadamente:', err);
  }

  return {
    uri: file.uri,
    name: fileName,
    type: mimeType,
    bytes: async () => {
      if (cachedBytes && cachedBytes.length > 0) {
        return cachedBytes;
      }
      return await readLocalFileBytesAsync(file.uri);
    },
  };
}

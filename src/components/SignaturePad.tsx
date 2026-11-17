import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  PanResponder,
  GestureResponderEvent,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface Point {
  x: number;
  y: number;
}

interface Props {
  disabled?: boolean;
  onSaved: (pngDataUrl: string) => void;
  onCleared?: () => void;
}

// Pure TS PNG encoder for signature strokes (produces valid PNG image/png base64)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function writeUint32BE(arr: number[], val: number) {
  arr.push((val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff);
}

function makeChunk(type: string, data: Uint8Array): number[] {
  const out: number[] = [];
  writeUint32BE(out, data.length);
  const typeAndData = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) {
    const code = type.charCodeAt(i);
    out.push(code);
    typeAndData[i] = code;
  }
  typeAndData.set(data, 4);
  for (let i = 0; i < data.length; i++) {
    out.push(data[i]);
  }
  writeUint32BE(out, crc32(typeAndData));
  return out;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    const b2 = i < bytes.length ? bytes[i++] : NaN;
    const b3 = i < bytes.length ? bytes[i++] : NaN;

    const enc1 = b1 >> 2;
    const enc2 = ((b1 & 3) << 4) | (isNaN(b2) ? 0 : b2 >> 4);
    const enc3 = isNaN(b2) ? 64 : ((b2 & 15) << 2) | (isNaN(b3) ? 0 : b3 >> 6);
    const enc4 = isNaN(b3) ? 64 : b3 & 63;

    result +=
      chars.charAt(enc1) +
      chars.charAt(enc2) +
      (enc3 === 64 ? '=' : chars.charAt(enc3)) +
      (enc4 === 64 ? '=' : chars.charAt(enc4));
  }
  return result;
}

function encodeStrokesToPngDataUrl(
  strokes: Point[][],
  boxWidth: number,
  boxHeight: number
): string {
  const W = 320;
  const H = 110;
  // Grayscale 8-bit PNG (colorType = 0): white = 255, ink = 20
  const rawScanlines = new Uint8Array(H * (1 + W));
  for (let y = 0; y < H; y++) {
    const rowStart = y * (1 + W);
    rawScanlines[rowStart] = 0; // filter type 0 (None)
    rawScanlines.fill(255, rowStart + 1, rowStart + 1 + W);
  }

  const scaleX = W / Math.max(boxWidth, 1);
  const scaleY = H / Math.max(boxHeight, 1);

  const setPixel = (px: number, py: number, val: number) => {
    const x = Math.round(px);
    const y = Math.round(py);
    if (x >= 0 && x < W && y >= 0 && y < H) {
      rawScanlines[y * (1 + W) + 1 + x] = val;
    }
  };

  const drawLine = (x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1) * 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + dx * t;
      const cy = y0 + dy * t;
      setPixel(cx, cy, 15);
      setPixel(cx + 1, cy, 40);
      setPixel(cx, cy + 1, 40);
    }
  };

  for (const stroke of strokes) {
    for (let i = 1; i < stroke.length; i++) {
      drawLine(
        stroke[i - 1].x * scaleX,
        stroke[i - 1].y * scaleY,
        stroke[i].x * scaleX,
        stroke[i].y * scaleY
      );
    }
  }

  // Build uncompressed zlib stream
  const zlibBytes: number[] = [0x78, 0x01]; // zlib header
  let offset = 0;
  const total = rawScanlines.length;
  while (offset < total) {
    const blockLen = Math.min(65535, total - offset);
    const isLast = offset + blockLen >= total ? 1 : 0;
    zlibBytes.push(isLast);
    zlibBytes.push(blockLen & 0xff, (blockLen >>> 8) & 0xff);
    const nlen = ~blockLen & 0xffff;
    zlibBytes.push(nlen & 0xff, (nlen >>> 8) & 0xff);
    for (let i = 0; i < blockLen; i++) {
      zlibBytes.push(rawScanlines[offset + i]);
    }
    offset += blockLen;
  }
  writeUint32BE(zlibBytes, adler32(rawScanlines));

  const pngBytes: number[] = [137, 80, 78, 71, 13, 10, 26, 10]; // PNG signature
  const ihdr: number[] = [];
  writeUint32BE(ihdr, W);
  writeUint32BE(ihdr, H);
  ihdr.push(8, 0, 0, 0, 0); // 8-bit grayscale
  pngBytes.push(...makeChunk('IHDR', new Uint8Array(ihdr)));
  pngBytes.push(...makeChunk('IDAT', new Uint8Array(zlibBytes)));
  pngBytes.push(...makeChunk('IEND', new Uint8Array(0)));

  return `data:image/png;base64,${uint8ToBase64(new Uint8Array(pngBytes))}`;
}

export function SignaturePad({ disabled, onSaved, onCleared }: Props) {
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [currentStroke, setCurrentStroke] = useState<Point[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [boxSize, setBoxSize] = useState({ width: 320, height: 150 });
  const currentRef = useRef<Point[]>([]);

  // PanResponder registers these callbacks; ref access happens only during gestures.
  // React Native's documented pattern uses the same event-only ref access.
  /* eslint-disable react-hooks/refs */
  const panResponder = useMemo(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabled,
      onMoveShouldSetPanResponder: () => !disabled,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (disabled) return;
        const { locationX, locationY } = evt.nativeEvent;
        const pt = { x: locationX, y: locationY };
        currentRef.current = [pt, { x: locationX + 0.5, y: locationY + 0.5 }];
        setCurrentStroke([...currentRef.current]);
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        if (disabled) return;
        const { locationX, locationY } = evt.nativeEvent;
        currentRef.current.push({ x: locationX, y: locationY });
        setCurrentStroke([...currentRef.current]);
      },
      onPanResponderRelease: () => {
        if (disabled) return;
        if (currentRef.current.length > 0) {
          const finished = [...currentRef.current];
          setStrokes((prev) => [...prev, finished]);
          currentRef.current = [];
          setCurrentStroke([]);
        }
      },
    }), [disabled]
  );
  /* eslint-enable react-hooks/refs */

  function handleClear() {
    if (disabled) return;
    setStrokes([]);
    setCurrentStroke([]);
    currentRef.current = [];
    setStatusMsg('Nova assinatura limpa. A assinatura do servidor não foi alterada.');
    onCleared?.();
  }

  function handleSave() {
    if (disabled) return;
    const allStrokes = currentStroke.length > 0 ? [...strokes, currentStroke] : strokes;
    if (allStrokes.length === 0) {
      setStatusMsg('Assine no quadro acima antes de salvar.');
      return;
    }
    const pngDataUrl = encodeStrokesToPngDataUrl(allStrokes, boxSize.width, boxSize.height);
    onSaved(pngDataUrl);
    setStatusMsg('Assinatura guardada no rascunho.');
  }

  const allStrokesToRender = currentStroke.length > 0 ? [...strokes, currentStroke] : strokes;

  return (
    <View style={styles.wrapper}>
      <View
        style={[styles.canvasBox, disabled && styles.canvasDisabled]}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          if (width > 0 && height > 0) setBoxSize({ width, height });
        }}
        {...panResponder.panHandlers}
      >
        {allStrokesToRender.length === 0 && (
          <View style={styles.placeholderBox} pointerEvents="none">
            <MaterialIcons name="draw" size={24} color="#CBD5E0" />
            <Text style={styles.placeholderText}>Desenhe a assinatura aqui com o dedo</Text>
          </View>
        )}

        {allStrokesToRender.map((stroke, sIdx) =>
          stroke.map((pt, pIdx) => {
            if (pIdx === 0) return null;
            const prev = stroke[pIdx - 1];
            const dx = pt.x - prev.x;
            const dy = pt.y - prev.y;
            const length = Math.max(Math.hypot(dx, dy), 2);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            const midX = (prev.x + pt.x) / 2;
            const midY = (prev.y + pt.y) / 2;

            return (
              <View
                key={`${sIdx}-${pIdx}`}
                pointerEvents="none"
                style={[
                  styles.segment,
                  {
                    width: length,
                    left: midX - length / 2,
                    top: midY - 1.5,
                    transform: [{ rotate: `${angle}deg` }],
                  },
                ]}
              />
            );
          })
        )}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.secondaryBtn, disabled && styles.btnDisabled]}
          onPress={handleClear}
          disabled={disabled}
        >
          <MaterialIcons name="cleaning-services" size={16} color="#4A5568" />
          <Text style={styles.secondaryBtnText}>Limpar nova assinatura</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, disabled && styles.btnDisabled]}
          onPress={handleSave}
          disabled={disabled}
        >
          <MaterialIcons name="check" size={16} color="#FFF" />
          <Text style={styles.primaryBtnText}>Usar esta assinatura</Text>
        </TouchableOpacity>
      </View>

      {statusMsg.length > 0 && <Text style={styles.statusText}>{statusMsg}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginVertical: 8,
  },
  canvasBox: {
    height: 150,
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E0',
    borderStyle: 'dashed',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  canvasDisabled: {
    opacity: 0.6,
  },
  placeholderBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 12,
    color: '#A0AEC0',
    marginTop: 4,
  },
  segment: {
    position: 'absolute',
    height: 3,
    backgroundColor: '#1A202C',
    borderRadius: 1.5,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF2F7',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D3748',
    marginLeft: 6,
  },
  primaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#08776F',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  primaryBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
    marginLeft: 6,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  statusText: {
    fontSize: 12,
    color: '#08776F',
    marginTop: 6,
    fontWeight: '500',
  },
});

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  LayoutChangeEvent,
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

const MIN_ZOOM = 1;
const MAX_ZOOM = 5;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_DELAY_MS = 280;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

interface Props {
  visible: boolean;
  source: string | null;
  title?: string;
  count?: number;
  index?: number;
  canDelete?: boolean;
  actionsDisabled?: boolean;
  actionError?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function PhotoViewerModal({
  visible,
  source,
  title = 'Foto ampliada',
  count = 0,
  index = -1,
  canDelete = false,
  actionsDisabled = false,
  actionError = '',
  onPrevious,
  onNext,
  onDelete,
  onClose,
}: Props) {
  const key = `${source}:${index}`;
  const [zoomState, setZoomState] = useState({ key: '', value: 1 });
  const zoom = zoomState.key === key ? zoomState.value : 1;
  function setZoomDisplay(value: number) {
    setZoomState({ key, value: +clamp(value, MIN_ZOOM, MAX_ZOOM).toFixed(2) });
  }

  const [scaleAnim] = useState(() => new Animated.Value(1));
  const [txAnim] = useState(() => new Animated.Value(0));
  const [tyAnim] = useState(() => new Animated.Value(0));

  const transformRef = useRef({ scale: 1, tx: 0, ty: 0 });
  const containerSizeRef = useRef({ width: 0, height: 0 });
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const gestureRef = useRef<{
    mode: 'none' | 'pan' | 'pinch';
    startScale: number;
    startTx: number;
    startTy: number;
    startDist: number;
    startTouchX: number;
    startTouchY: number;
    startMidX: number;
    startMidY: number;
    moved: boolean;
  }>({
    mode: 'none',
    startScale: 1,
    startTx: 0,
    startTy: 0,
    startDist: 1,
    startTouchX: 0,
    startTouchY: 0,
    startMidX: 0,
    startMidY: 0,
    moved: false,
  });

  function clampTranslation(tx: number, ty: number, scale: number) {
    const { width, height } = containerSizeRef.current;
    if (scale <= 1 || width === 0 || height === 0) {
      return { tx: 0, ty: 0 };
    }
    const maxTx = (width * (scale - 1)) / 2;
    const maxTy = (height * (scale - 1)) / 2;
    return {
      tx: clamp(tx, -maxTx, maxTx),
      ty: clamp(ty, -maxTy, maxTy),
    };
  }

  function applyTransform(scale: number, tx: number, ty: number, animated = false) {
    const clampedScale = clamp(scale, MIN_ZOOM, MAX_ZOOM);
    const clamped = clampTranslation(tx, ty, clampedScale);
    transformRef.current = { scale: clampedScale, tx: clamped.tx, ty: clamped.ty };
    setZoomDisplay(clampedScale);

    if (animated) {
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: clampedScale, useNativeDriver: true, friction: 8, tension: 80 }),
        Animated.spring(txAnim, { toValue: clamped.tx, useNativeDriver: true, friction: 8, tension: 80 }),
        Animated.spring(tyAnim, { toValue: clamped.ty, useNativeDriver: true, friction: 8, tension: 80 }),
      ]).start();
    } else {
      scaleAnim.setValue(clampedScale);
      txAnim.setValue(clamped.tx);
      tyAnim.setValue(clamped.ty);
    }
  }

  useEffect(() => {
    transformRef.current = { scale: 1, tx: 0, ty: 0 };
    scaleAnim.setValue(1);
    txAnim.setValue(0);
    tyAnim.setValue(0);
  }, [key, visible, scaleAnim, txAnim, tyAnim]);

  function handleResponderGrant(evt: GestureResponderEvent) {
    const touches = evt.nativeEvent.touches;
    const { scale, tx, ty } = transformRef.current;
    if (touches.length >= 2) {
      const [t1, t2] = touches;
      const dist = Math.max(1, Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY));
      gestureRef.current = {
        mode: 'pinch',
        startScale: scale,
        startTx: tx,
        startTy: ty,
        startDist: dist,
        startTouchX: 0,
        startTouchY: 0,
        startMidX: (t1.locationX + t2.locationX) / 2,
        startMidY: (t1.locationY + t2.locationY) / 2,
        moved: true,
      };
    } else if (touches.length === 1) {
      const t = touches[0];
      gestureRef.current = {
        mode: 'pan',
        startScale: scale,
        startTx: tx,
        startTy: ty,
        startDist: 1,
        startTouchX: t.pageX,
        startTouchY: t.pageY,
        startMidX: 0,
        startMidY: 0,
        moved: false,
      };
    }
  }

  function handleResponderMove(evt: GestureResponderEvent) {
    const touches = evt.nativeEvent.touches;
    if (touches.length >= 2) {
      const [t1, t2] = touches;
      const dist = Math.max(1, Math.hypot(t2.pageX - t1.pageX, t2.pageY - t1.pageY));
      const midX = (t1.locationX + t2.locationX) / 2;
      const midY = (t1.locationY + t2.locationY) / 2;

      if (gestureRef.current.mode !== 'pinch') {
        const { scale, tx, ty } = transformRef.current;
        gestureRef.current = {
          mode: 'pinch',
          startScale: scale,
          startTx: tx,
          startTy: ty,
          startDist: dist,
          startTouchX: 0,
          startTouchY: 0,
          startMidX: midX,
          startMidY: midY,
          moved: true,
        };
        return;
      }

      const { startScale, startTx, startTy, startDist, startMidX, startMidY } = gestureRef.current;
      const nextScale = clamp(startScale * (dist / startDist), MIN_ZOOM, MAX_ZOOM);
      const { width, height } = containerSizeRef.current;
      const cx = width / 2;
      const cy = height / 2;
      const dx0 = startMidX - cx;
      const dy0 = startMidY - cy;
      const dx1 = midX - cx;
      const dy1 = midY - cy;
      const ratio = nextScale / startScale;
      const nextTx = dx1 - ratio * (dx0 - startTx);
      const nextTy = dy1 - ratio * (dy0 - startTy);
      applyTransform(nextScale, nextTx, nextTy);
      return;
    }

    if (touches.length === 1) {
      const t = touches[0];
      if (gestureRef.current.mode === 'pinch') {
        const { scale, tx, ty } = transformRef.current;
        gestureRef.current = {
          mode: 'pan',
          startScale: scale,
          startTx: tx,
          startTy: ty,
          startDist: 1,
          startTouchX: t.pageX,
          startTouchY: t.pageY,
          startMidX: 0,
          startMidY: 0,
          moved: true,
        };
        return;
      }

      const dx = t.pageX - gestureRef.current.startTouchX;
      const dy = t.pageY - gestureRef.current.startTouchY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        gestureRef.current.moved = true;
      }

      const { scale } = transformRef.current;
      if (scale > 1) {
        applyTransform(
          scale,
          gestureRef.current.startTx + dx,
          gestureRef.current.startTy + dy
        );
      }
    }
  }

  function handleResponderRelease(evt: GestureResponderEvent) {
    if (!gestureRef.current.moved && evt.nativeEvent.changedTouches.length === 1) {
      const touch = evt.nativeEvent.changedTouches[0];
      const now = Date.now();
      const prevTap = lastTapRef.current;
      if (
        prevTap &&
        now - prevTap.time <= DOUBLE_TAP_DELAY_MS &&
        Math.hypot(touch.locationX - prevTap.x, touch.locationY - prevTap.y) < 40
      ) {
        lastTapRef.current = null;
        const { scale } = transformRef.current;
        if (scale > 1.05) {
          applyTransform(1, 0, 0, true);
        } else {
          const { width, height } = containerSizeRef.current;
          const dx = touch.locationX - width / 2;
          const dy = touch.locationY - height / 2;
          const nextTx = dx - DOUBLE_TAP_ZOOM * dx;
          const nextTy = dy - DOUBLE_TAP_ZOOM * dy;
          applyTransform(DOUBLE_TAP_ZOOM, nextTx, nextTy, true);
        }
      } else {
        lastTapRef.current = { time: now, x: touch.locationX, y: touch.locationY };
      }
    }
    gestureRef.current.mode = 'none';
  }

  function handleResponderTerminate() {
    gestureRef.current.mode = 'none';
  }

  function handleContainerLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    containerSizeRef.current = { width, height };
  }

  function stepZoom(delta: number) {
    const nextScale = clamp(+(transformRef.current.scale + delta).toFixed(1), MIN_ZOOM, MAX_ZOOM);
    if (nextScale <= 1) {
      applyTransform(1, 0, 0, true);
    } else {
      const ratio = nextScale / transformRef.current.scale;
      applyTransform(
        nextScale,
        transformRef.current.tx * ratio,
        transformRef.current.ty * ratio,
        true
      );
    }
  }

  if (!visible || !source) return null;

  const hasGallery = count > 0 && index >= 0;
  const canPrev = hasGallery && index > 0 && !actionsDisabled;
  const canNext = hasGallery && index < count - 1 && !actionsDisabled;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop}>
        {/* Top Bar */}
        <View style={styles.header}>
          <View style={styles.headerTextCol}>
            {hasGallery && (
              <Text style={styles.counterBadge}>
                Foto {index + 1} de {count}
              </Text>
            )}
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <MaterialIcons name="close" size={26} color="#FFF" />
          </TouchableOpacity>
        </View>

        {actionError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{actionError}</Text>
          </View>
        ) : null}

        {/* Image Area with Free Pinch/Pan/Double-Tap Zoom */}
        <View
          style={styles.imageViewport}
          collapsable={false}
          onLayout={handleContainerLayout}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={handleResponderGrant}
          onResponderMove={handleResponderMove}
          onResponderRelease={handleResponderRelease}
          onResponderTerminate={handleResponderTerminate}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.imageAnimatedWrap,
              {
                transform: [
                  { translateX: txAnim },
                  { translateY: tyAnim },
                  { scale: scaleAnim },
                ],
              },
            ]}
          >
            <Image
              source={{ uri: source }}
              style={styles.image}
              resizeMode="contain"
            />
          </Animated.View>
        </View>

        {/* Controls Bar */}
        <View style={styles.controlsBar}>
          {/* Zoom Controls */}
          <View style={styles.zoomRow}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => stepZoom(-0.5)}
            >
              <MaterialIcons name="zoom-out" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomResetBtn} onPress={() => applyTransform(1, 0, 0, true)}>
              <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => stepZoom(0.5)}
            >
              <MaterialIcons name="zoom-in" size={20} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Gallery Prev / Next */}
          {hasGallery && (
            <View style={styles.navRow}>
              <TouchableOpacity
                style={[styles.navBtn, !canPrev && styles.btnDisabled]}
                onPress={onPrevious}
                disabled={!canPrev}
              >
                <MaterialIcons name="chevron-left" size={22} color="#FFF" />
                <Text style={styles.navBtnText}>Anterior</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.navBtn, !canNext && styles.btnDisabled]}
                onPress={onNext}
                disabled={!canNext}
              >
                <Text style={styles.navBtnText}>Próxima</Text>
                <MaterialIcons name="chevron-right" size={22} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}

          {/* Contextual Delete from Server */}
          {canDelete && onDelete && (
            <TouchableOpacity
              style={[styles.deleteServerBtn, actionsDisabled && styles.btnDisabled]}
              onPress={onDelete}
              disabled={actionsDisabled}
            >
              <MaterialIcons name="delete-forever" size={20} color="#FFF" />
              <Text style={styles.deleteServerText}>Excluir esta foto do servidor…</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 14, 20, 0.96)',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  headerTextCol: {
    flex: 1,
    marginRight: 12,
  },
  counterBadge: {
    color: '#4FD1C5',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  title: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
  },
  errorBanner: {
    backgroundColor: '#C53030',
    padding: 10,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  errorText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  imageViewport: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageAnimatedWrap: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  controlsBar: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.12)',
    gap: 10,
  },
  zoomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  zoomBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    padding: 8,
    borderRadius: 8,
  },
  zoomResetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
  },
  zoomText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  navBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2D3748',
    paddingVertical: 10,
    borderRadius: 10,
  },
  navBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 4,
  },
  deleteServerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C53030',
    paddingVertical: 12,
    borderRadius: 10,
  },
  deleteServerText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  btnDisabled: {
    opacity: 0.4,
  },
});

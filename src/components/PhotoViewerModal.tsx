import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

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
  const key=`${source}:${index}`;
  const [zoomState,setZoomState]=useState({key:'',value:1});
  const zoom=zoomState.key===key ? zoomState.value : 1;
  function setZoom(value: number | ((previous: number) => number)) {
    setZoomState(previous => ({key,value:typeof value==='function' ? value(previous.key===key ? previous.value : 1) : value}));
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

        {/* Image Area with Zoom */}
        <ScrollView
          contentContainerStyle={styles.imageScroll}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
        >
          <Image
            source={{ uri: source }}
            style={[
              styles.image,
              {
                transform: [{ scale: zoom }],
              },
            ]}
            resizeMode="contain"
          />
        </ScrollView>

        {/* Controls Bar */}
        <View style={styles.controlsBar}>
          {/* Zoom Controls */}
          <View style={styles.zoomRow}>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
            >
              <MaterialIcons name="zoom-out" size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.zoomResetBtn} onPress={() => setZoom(1)}>
              <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.zoomBtn}
              onPress={() => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(1)))}
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
  imageScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  image: {
    width: '100%',
    height: 380,
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

import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';

interface Props {
  visible: boolean;
  url: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

function VideoPlayerContent({
  url,
  onOpenExternal,
}: {
  url: string;
  onOpenExternal: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'readyToPlay' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
    p.play();
  });

  useEventListener(player, 'statusChange', (payload) => {
    setStatus(payload.status);
    if (payload.status === 'error') {
      setErrorMessage(
        payload.error?.message || 'Não foi possível reproduzir este vídeo diretamente.'
      );
    } else if (payload.status === 'readyToPlay') {
      setErrorMessage(null);
    }
  });

  useEventListener(player, 'playingChange', (payload) => {
    setIsPlaying(payload.isPlaying);
  });

  function handleTogglePlay() {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  }

  function handleRetry() {
    setStatus('loading');
    setErrorMessage(null);
    player.replace(url);
    player.play();
  }

  return (
    <View style={styles.playerArea}>
      <View style={styles.videoFrame}>
        <VideoView
          player={player}
          style={styles.video}
          nativeControls
          contentFit="contain"
          surfaceType="textureView"
          fullscreenOptions={{ enable: true }}
        />

        {status === 'loading' && (
          <View style={styles.overlayBox} pointerEvents="none">
            <ActivityIndicator size="large" color="#38B2AC" />
            <Text style={styles.overlayText}>Carregando vídeo do servidor…</Text>
          </View>
        )}

        {status === 'error' && (
          <View style={styles.errorBox}>
            <MaterialIcons name="error-outline" size={44} color="#FC8181" />
            <Text style={styles.errorTitle}>Falha na reprodução</Text>
            <Text style={styles.errorDesc}>{errorMessage}</Text>
            <View style={styles.errorActions}>
              <TouchableOpacity style={styles.retryBtn} onPress={handleRetry}>
                <MaterialIcons name="refresh" size={18} color="#FFF" />
                <Text style={styles.retryBtnText}>Tentar novamente</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.externalActionBtn} onPress={onOpenExternal}>
                <MaterialIcons name="open-in-new" size={18} color="#FFF" />
                <Text style={styles.retryBtnText}>Abrir externo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Quick playback bar */}
      <View style={styles.controlsBar}>
        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={() => player.seekBy(-10)}
          disabled={status === 'error'}
        >
          <MaterialIcons name="replay-10" size={26} color="#FFF" />
          <Text style={styles.ctrlLabel}>-10s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, styles.ctrlPrimary]}
          onPress={handleTogglePlay}
          disabled={status === 'error'}
        >
          <MaterialIcons name={isPlaying ? 'pause' : 'play-arrow'} size={30} color="#FFF" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={() => player.seekBy(10)}
          disabled={status === 'error'}
        >
          <MaterialIcons name="forward-10" size={26} color="#FFF" />
          <Text style={styles.ctrlLabel}>+10s</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={() => {
            player.replay();
          }}
          disabled={status === 'error'}
        >
          <MaterialIcons name="replay" size={24} color="#FFF" />
          <Text style={styles.ctrlLabel}>Início</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function VideoPlayerModal({
  visible,
  url,
  title = 'Vídeo do servidor',
  subtitle,
  onClose,
}: Props) {
  async function handleOpenExternal() {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Indisponível', 'Não foi possível abrir o endereço do vídeo externamente.');
      }
    } catch {
      Alert.alert('Erro', 'Falha ao abrir o vídeo externamente.');
    }
  }

  return (
    <Modal
      visible={visible && Boolean(url)}
      animationType="fade"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.headerSub} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={handleOpenExternal} style={styles.headerBtn}>
            <MaterialIcons name="open-in-new" size={22} color="#A0AEC0" />
          </TouchableOpacity>
        </View>

        {visible && url ? (
          <VideoPlayerContent key={url} url={url} onOpenExternal={handleOpenExternal} />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#111820',
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  headerBtn: {
    padding: 8,
  },
  headerTitleBox: {
    flex: 1,
    marginHorizontal: 8,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F8FAFC',
  },
  headerSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  playerArea: {
    flex: 1,
    justifyContent: 'space-between',
  },
  videoFrame: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  overlayBox: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
  },
  overlayText: {
    color: '#E2E8F0',
    marginTop: 10,
    fontSize: 13,
    fontWeight: '500',
  },
  errorBox: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: 'rgba(17, 24, 32, 0.96)',
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#742A2A',
  },
  errorTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  errorDesc: {
    color: '#CBD5E0',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#08776F',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  externalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2B6CB0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#111820',
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
  },
  ctrlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ctrlPrimary: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#08776F',
  },
  ctrlLabel: {
    color: '#CBD5E0',
    fontSize: 11,
    marginTop: 2,
  },
});

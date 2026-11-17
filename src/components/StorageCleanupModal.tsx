import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Switch,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import {
  cleanupAppStorageAsync,
  formatBytes,
  getAutoCleanupEnabledAsync,
  inspectAppStorageAsync,
  setAutoCleanupEnabledAsync,
  STORAGE_ALERT_LIMIT_BYTES,
  StorageStats,
} from '../services/storageCleanup';

interface Props {
  visible: boolean;
  onClose: () => void;
  onStatsUpdated?: (stats: StorageStats) => void;
}

export function StorageCleanupModal({ visible, onClose, onStatsUpdated }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(baseStyles);

  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [autoCleanup, setAutoCleanup] = useState(false);
  const [stats, setStats] = useState<StorageStats>({
    draftCount: 0,
    draftBytes: 0,
    mediaFileCount: 0,
    mediaBytes: 0,
    totalBytes: 0,
    limitBytes: STORAGE_ALERT_LIMIT_BYTES,
    exceedsLimit: false,
  });

  const onStatsUpdatedRef = useRef(onStatsUpdated);
  useEffect(() => {
    onStatsUpdatedRef.current = onStatsUpdated;
  }, [onStatsUpdated]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const [nextStats, enabled] = await Promise.all([
          inspectAppStorageAsync(),
          getAutoCleanupEnabledAsync(),
        ]);
        if (!active) return;
        setStats(nextStats);
        setAutoCleanup(enabled);
        onStatsUpdatedRef.current?.(nextStats);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [visible]);

  async function handleToggleAuto(next: boolean) {
    setAutoCleanup(next);
    try {
      await setAutoCleanupEnabledAsync(next);
    } catch {
      setAutoCleanup(!next);
    }
  }

  function confirmAndClean(options: { clearDrafts: boolean; clearMedia: boolean; label: string }) {
    if (cleaning) return;
    Alert.alert(
      'Confirmar limpeza',
      `Deseja remover ${options.label} deste celular?\n\nSeus logins salvos e os dados já enviados ao servidor permanecem intactos.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Limpar agora',
          style: 'destructive',
          onPress: async () => {
            setCleaning(true);
            try {
              const res = await cleanupAppStorageAsync(options);
              setStats(res.remaining);
              onStatsUpdated?.(res.remaining);
              Alert.alert(
                'Limpeza concluída',
                `Espaço liberado: ${formatBytes(res.freedBytes)}\n` +
                  `• Rascunhos removidos: ${res.removedDrafts}\n` +
                  `• Vídeos/arquivos em cache removidos: ${res.removedFiles}`
              );
            } catch (err: any) {
              Alert.alert('Erro na limpeza', err?.message || 'Não foi possível concluir a limpeza.');
            } finally {
              setCleaning(false);
            }
          },
        },
      ]
    );
  }

  const ratio = Math.min(1, stats.totalBytes / Math.max(1, stats.limitBytes));
  const percent = Math.round(ratio * 100);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <MaterialIcons name="cleaning-services" size={22} color={colors.primarySoftText} />
              <Text style={styles.title}>Limpeza & Armazenamento</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} disabled={cleaning}>
              <MaterialIcons name="close" size={22} color={colors.iconMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Calculando espaço usado…</Text>
            </View>
          ) : (
            <>
              {/* Usage meter */}
              <View
                style={[
                  styles.usageBox,
                  stats.exceedsLimit && styles.usageBoxAlert,
                ]}
              >
                <View style={styles.usageTopRow}>
                  <Text style={styles.usageValue}>{formatBytes(stats.totalBytes)}</Text>
                  <Text style={styles.usageLimit}>de {formatBytes(stats.limitBytes)} ({percent}%)</Text>
                </View>

                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.max(percent, stats.totalBytes > 0 ? 4 : 0)}%`,
                        backgroundColor: stats.exceedsLimit ? colors.danger : colors.primary,
                      },
                    ]}
                  />
                </View>

                {stats.exceedsLimit && (
                  <View style={styles.alertRow}>
                    <MaterialIcons name="warning-amber" size={16} color={colors.danger} />
                    <Text style={styles.alertText}>
                      Limite de 1 GB atingido. Recomendamos limpar agora.
                    </Text>
                  </View>
                )}

                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Rascunhos locais ({stats.draftCount})</Text>
                  <Text style={styles.breakdownVal}>{formatBytes(stats.draftBytes)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    Vídeos e cache ({stats.mediaFileCount} arq.)
                  </Text>
                  <Text style={styles.breakdownVal}>{formatBytes(stats.mediaBytes)}</Text>
                </View>
              </View>

              {/* Auto-cleanup switch */}
              <View style={styles.autoRow}>
                <View style={styles.autoTextCol}>
                  <Text style={styles.autoTitle}>Auto-limpeza ao atingir 1 GB</Text>
                  <Text style={styles.autoDesc}>
                    Notifica ao chegar em 1 GB e executa a limpeza automática de rascunhos e vídeos em cache.
                  </Text>
                </View>
                <Switch
                  value={autoCleanup}
                  onValueChange={handleToggleAuto}
                  trackColor={{ false: colors.borderStrong, true: colors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {/* Primary Clean All Button */}
              <TouchableOpacity
                style={[styles.primaryBtn, cleaning && styles.btnDisabled]}
                onPress={() =>
                  confirmAndClean({
                    clearDrafts: true,
                    clearMedia: true,
                    label: 'todos os rascunhos locais e vídeos/cache baixados',
                  })
                }
                disabled={cleaning}
              >
                {cleaning ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="delete-sweep" size={20} color="#FFF" />
                    <Text style={styles.primaryBtnText}>Limpar tudo agora</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Granular buttons */}
              <View style={styles.secondaryRow}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, cleaning && styles.btnDisabled]}
                  onPress={() =>
                    confirmAndClean({
                      clearDrafts: false,
                      clearMedia: true,
                      label: 'os vídeos e arquivos em cache baixados',
                    })
                  }
                  disabled={cleaning}
                >
                  <Text style={styles.secondaryBtnText}>Só vídeos/cache</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.secondaryBtn, cleaning && styles.btnDisabled]}
                  onPress={() =>
                    confirmAndClean({
                      clearDrafts: true,
                      clearMedia: false,
                      label: 'os rascunhos locais',
                    })
                  }
                  disabled={cleaning}
                >
                  <Text style={styles.secondaryBtnText}>Só rascunhos</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.safeNote}>
                Seu login, acessos salvos e dados já enviados ao servidor não são apagados.
              </Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  closeBtn: {
    padding: 4,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#718096',
  },
  usageBox: {
    backgroundColor: '#F7FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  usageBoxAlert: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FEB2B2',
  },
  usageTopRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  usageValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  usageLimit: {
    fontSize: 12,
    color: '#718096',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  alertText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#C53030',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#4A5568',
  },
  breakdownVal: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D3748',
  },
  autoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    gap: 10,
  },
  autoTextCol: {
    flex: 1,
  },
  autoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A202C',
  },
  autoDesc: {
    fontSize: 11,
    color: '#718096',
    marginTop: 2,
  },
  primaryBtn: {
    backgroundColor: '#08776F',
    borderRadius: 10,
    height: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: '#EDF2F7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D3748',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  safeNote: {
    fontSize: 11,
    color: '#718096',
    textAlign: 'center',
  },
});

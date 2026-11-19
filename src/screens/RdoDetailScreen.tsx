import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LoginSession, RdoSummary, RdoAttachment } from '../types';
import {
  cancelRdoAsync,
  getRdoAttachmentsAsync,
  isVideoAttachment,
  removeRdoAttachmentAsync,
  setRdoStatusAsync,
} from '../services/apiClient';
import { getClientDevice } from '../services/storage';
import { detailImageSource } from '../services/detailWorkflow';
import { CONFIG } from '../constants/config';
import { VideoPlayerModal } from '../components/VideoPlayerModal';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';
import { updateCachedRdo } from './RdoListScreen';

interface Props {
  session: LoginSession;
  rdo: RdoSummary;
  onBack: () => void;
  onOpenQuizDetail: () => void;
  onOpenBaixar: () => void;
  onOpenAttachments: () => void;
  onCancelled?: () => void;
}

export function RdoDetailScreen({
  session,
  rdo,
  onBack,
  onOpenQuizDetail,
  onOpenBaixar,
  onOpenAttachments,
  onCancelled,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(baseStyles);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [attachments, setAttachments] = useState<RdoAttachment[]>([]);
  const [hasServerVideo, setHasServerVideo] = useState<boolean | null>(null);
  const [currentStatus, setCurrentStatus] = useState(rdo.status);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [activeVideo, setActiveVideo] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  const serverVideo = attachments.find(isVideoAttachment) || null;
  const serverVideoUrl = serverVideo
    ? detailImageSource(
        String(serverVideo.caminho || serverVideo.url || serverVideo.caminhoArquivo || ''),
        CONFIG.BASE_URL
      )
    : null;

  const isClosed =
    currentStatus === 'FechadaProdutiva' || currentStatus === 'FechadaImprodutiva';



  async function checkAttachments() {
    setLoadingAttachments(true);
    try {
      const list = await getRdoAttachmentsAsync(session, rdo);
      setAttachments(list);
      const video = list.some(isVideoAttachment);
      setHasServerVideo(video);
    } catch {
      setHasServerVideo(null);
    } finally {
      setLoadingAttachments(false);
    }
  }

  useEffect(() => {
    checkAttachments();
  }, []);

  async function handleConfirmCancelRdo() {
    const trimmed = cancelReason.trim();
    if (!trimmed) {
      Alert.alert('Motivo obrigatório', 'Informe o motivo do cancelamento do RDO.');
      return;
    }
    if (trimmed.length > 4000) {
      Alert.alert('Motivo muito longo', 'O motivo deve ter no máximo 4.000 caracteres.');
      return;
    }

    setCancelling(true);
    try {
      await cancelRdoAsync(session, rdo, trimmed);
      setCancelModalVisible(false);
      setCancelReason('');
      Alert.alert('RDO cancelado', `O RDO #${rdo.number} foi cancelado no servidor.`, [
        { text: 'OK', onPress: () => (onCancelled ?? onBack)() },
      ]);
    } catch (err: any) {
      Alert.alert(
        'Erro ao cancelar RDO',
        err?.message || 'Não foi possível cancelar o RDO no servidor.'
      );
    } finally {
      setCancelling(false);
    }
  }

  async function handleStatusChange(targetStatus: 'Deslocando' | 'Atendendo' | 'Atendido') {
    const label =
      targetStatus === 'Deslocando'
        ? 'Deslocamento'
        : targetStatus === 'Atendendo'
        ? 'Iniciar Atendimento'
        : 'Finalizar Atendimento';

    Alert.alert(
      label,
      `Confirmar "${label}" para o RDO #${rdo.number} usando a localização atual do celular?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            setUpdatingStatus(true);
            try {
              const { status } = await Location.requestForegroundPermissionsAsync();
              if (status !== 'granted') {
                throw new Error('Permissão de localização é necessária para registrar o atendimento.');
              }
              const loc = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              const device = await getClientDevice();
              const updated = await setRdoStatusAsync(session, rdo, device, targetStatus, {
                latitude: loc.coords.latitude,
                longitude: loc.coords.longitude,
                accuracy: loc.coords.accuracy,
                altitude: loc.coords.altitude,
              });
              if (updated) {
                setCurrentStatus(updated.status);
                rdo.status = updated.status;
                rdo.raw = updated.raw;
                updateCachedRdo(updated);
              } else if (targetStatus !== 'Deslocando') {
                setCurrentStatus(targetStatus);
                rdo.status = targetStatus;
                rdo.raw = {
                  ...rdo.raw,
                  statusExecucao: targetStatus === 'Atendendo' ? '3' : '8',
                };
                updateCachedRdo(rdo);
              }
              Alert.alert(
                'Sucesso',
                updated
                  ? `Status "${updated.status}" confirmado pelo servidor.`
                  : 'Status confirmado pelo servidor.'
              );
            } catch (err: any) {
              Alert.alert('Erro', err?.message || 'Não foi possível atualizar o status.');
            } finally {
              setUpdatingStatus(false);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={colors.icon} />
        </TouchableOpacity>
        <View style={styles.appBarTitleBox}>
          <Text style={styles.appBarTitle}>RDO #{rdo.number}</Text>
          <Text style={styles.appBarSubtitle} numberOfLines={1}>
            Conta {session.login} · Contrato {rdo.contract} · Projeto {rdo.project}
          </Text>
        </View>
        <View style={styles.statusBadge}>
          <Text style={styles.statusText}>{currentStatus}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Primary Highlight: Detalhamento do RDO (Conforme Versão Windows) */}
        <TouchableOpacity
          style={styles.detailHeroBtn}
          activeOpacity={0.85}
          onPress={onOpenQuizDetail}
        >
          <View style={styles.detailHeroIconBox}>
            <MaterialIcons name="assignment" size={28} color="#08776F" />
          </View>
          <View style={styles.detailHeroTextCol}>
            <Text style={styles.detailHeroTitle}>📋 Detalhamento do RDO</Text>
            <Text style={styles.detailHeroSubtitle}>
              Respostas e fotos salvas, conferência de seriais, assinaturas e questionários
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={26} color="#FFF" />
        </TouchableOpacity>

        {/* Attendance / Travel Quick Buttons (For Open RDOs) */}
        {!isClosed && (
          <View style={styles.statusActionsRow}>
            <TouchableOpacity
              style={styles.statusActionBtn}
              onPress={() => handleStatusChange('Deslocando')}
              disabled={updatingStatus}
            >
              <MaterialIcons name="directions-car" size={18} color={colors.textSecondary} />
              <Text style={styles.statusActionText}>Deslocamento</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.statusActionBtn, styles.statusActionPrimary]}
              onPress={() =>
                handleStatusChange(currentStatus === 'Atendendo' ? 'Atendido' : 'Atendendo')
              }
              disabled={updatingStatus}
            >
              {updatingStatus ? (
                <ActivityIndicator size="small" color={colors.primarySoftText} />
              ) : (
                <>
                  <MaterialIcons
                    name={currentStatus === 'Atendendo' ? 'stop-circle' : 'play-circle-outline'}
                    size={18}
                    color={colors.primarySoftText}
                  />
                  <Text
                    style={[
                      styles.statusActionText,
                      { color: colors.primarySoftText, fontWeight: 'bold' },
                    ]}
                  >
                    {currentStatus === 'Atendendo' ? 'Finalizar Atend.' : 'Iniciar Atend.'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Info Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Dados do RDO</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Projeto / INEP:</Text>
            <Text style={styles.infoValue}>{rdo.project}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Contrato:</Text>
            <Text style={styles.infoValue}>{rdo.contract}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Tipo de Serviço:</Text>
            <Text style={styles.infoValue}>{rdo.service}</Text>
          </View>

          {rdo.date ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Data Inicial:</Text>
              <Text style={styles.infoValue}>{rdo.date}</Text>
            </View>
          ) : null}

          {rdo.address ? (
            <View style={styles.addressBox}>
              <MaterialIcons name="location-on" size={18} color="#08776F" />
              <Text style={styles.addressText}>{rdo.address}</Text>
            </View>
          ) : null}
        </View>

        {/* Video Requirement Notice */}
        <View
          style={[
            styles.noticeCard,
            hasServerVideo === true ? styles.noticeCardSuccess : styles.noticeCardWarning,
          ]}
        >
          {loadingAttachments ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MaterialIcons
              name={hasServerVideo ? 'check-circle' : 'videocam-off'}
              size={24}
              color={hasServerVideo ? colors.success : colors.warning}
            />
          )}
          <View style={styles.noticeTextContainer}>
            <Text
              style={[
                styles.noticeTitle,
                { color: hasServerVideo ? colors.successText : colors.warningText },
              ]}
            >
              {loadingAttachments
                ? 'Consultando anexos do RDO...'
                : hasServerVideo
                ? 'Vídeo confirmado no servidor'
                : 'Sem vídeo no servidor'}
            </Text>
            <Text
              style={[
                styles.noticeDesc,
                { color: hasServerVideo ? colors.successText : colors.warningText },
              ]}
            >
              {hasServerVideo
                ? 'Requisito de vídeo atendido para realizar a baixa.'
                : 'É obrigatório possuir vídeo anexado e enviado ao servidor para dar baixa na atividade.'}
            </Text>
          </View>
          {hasServerVideo && serverVideo && serverVideoUrl && (
            <TouchableOpacity
              style={styles.watchVideoBtn}
              onPress={() =>
                setActiveVideo({
                  url: serverVideoUrl,
                  title: serverVideo.nomeDocumento || 'Vídeo da obra',
                  subtitle: serverVideo.tamanho || undefined,
                })
              }
            >
              <MaterialIcons name="play-arrow" size={18} color="#FFF" />
              <Text style={styles.watchVideoBtnText}>Assistir</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Action Button: Baixar Atividade */}
        {!isClosed && (
          <TouchableOpacity
            style={[styles.primaryActionBtn, !hasServerVideo && styles.primaryActionBtnDisabled]}
            onPress={() => {
              if (!hasServerVideo) {
                Alert.alert(
                  'Vídeo obrigatório',
                  'É necessário enviar o vídeo da atividade nos Anexos antes de dar baixa no RDO.',
                  [
                    { text: 'Ir para Anexos', onPress: onOpenAttachments },
                    { text: 'Cancelar', style: 'cancel' },
                  ]
                );
                return;
              }
              onOpenBaixar();
            }}
          >
            <MaterialIcons name="task-alt" size={26} color="#FFF" />
            <View style={styles.primaryActionTextCol}>
              <Text style={styles.primaryActionTitle}>Baixar Atividade</Text>
              <Text style={styles.primaryActionSubtitle}>
                Finalizar e encerrar o RDO com envio definitivo
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#FFF" />
          </TouchableOpacity>
        )}

        {/* Secondary Actions */}
        <Text style={styles.sectionHeader}>Etapas e Mídia do RDO</Text>

        <TouchableOpacity style={styles.menuItem} onPress={onOpenQuizDetail}>
          <View style={[styles.menuIconCircle, { backgroundColor: '#E6F4F1' }]}>
            <MaterialIcons name="fact-check" size={22} color="#08776F" />
          </View>
          <View style={styles.menuTextCol}>
            <Text style={styles.menuTitle}>Detalhamento do RDO (Questionário / MCO)</Text>
            <Text style={styles.menuDesc}>
              Ver respostas salvas, editar campos, seriais, fotos e assinaturas
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#CBD5E0" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem} onPress={onOpenAttachments}>
          <View style={[styles.menuIconCircle, { backgroundColor: colors.infoSoft }]}>
            <MaterialIcons name="attach-file" size={22} color={colors.info} />
          </View>
          <View style={styles.menuTextCol}>
            <Text style={styles.menuTitle}>Anexar Arquivos & Vídeo</Text>
            <Text style={styles.menuDesc}>{attachments.length} anexo(s) no servidor</Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color={colors.iconMuted} />
        </TouchableOpacity>

        {!isClosed && currentStatus !== 'Cancelado' && (
          <TouchableOpacity
            style={styles.cancelMenuItem}
            onPress={() => {
              setCancelReason('');
              setCancelModalVisible(true);
            }}
            disabled={updatingStatus || cancelling}
          >
            <View style={[styles.menuIconCircle, { backgroundColor: colors.dangerSoft }]}>
              <MaterialIcons name="cancel" size={22} color={colors.danger} />
            </View>
            <View style={styles.menuTextCol}>
              <Text style={[styles.menuTitle, { color: colors.danger }]}>Cancelar RDO</Text>
              <Text style={styles.menuDesc}>
                Cancelar este RDO no servidor informando o motivo
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={colors.danger} />
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!cancelling) setCancelModalVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cancelar RDO #{rdo.number}</Text>
            <Text style={styles.modalSubtitle}>
              Informe o motivo do cancelamento para enviar ao servidor:
            </Text>
            <TextInput
              style={styles.modalInput}
              multiline
              numberOfLines={4}
              maxLength={4000}
              placeholder="Digite o motivo / observação do cancelamento..."
              placeholderTextColor={colors.placeholder}
              value={cancelReason}
              onChangeText={setCancelReason}
              textAlignVertical="top"
              editable={!cancelling}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalSecondaryBtn}
                onPress={() => setCancelModalVisible(false)}
                disabled={cancelling}
              >
                <Text style={styles.modalSecondaryText}>Voltar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalDangerBtn, cancelling && styles.btnDisabled]}
                onPress={handleConfirmCancelRdo}
                disabled={cancelling}
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Text style={styles.modalDangerText}>Confirmar Cancelamento</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <VideoPlayerModal
        visible={Boolean(activeVideo)}
        url={activeVideo?.url || null}
        title={activeVideo?.title}
        subtitle={activeVideo?.subtitle}
        onDelete={
          serverVideo && rdo.status !== 'Cancelado' && Number(serverVideo.id) > 0
            ? () => {
                Alert.alert(
                  'Remover vídeo do servidor',
                  `Deseja excluir "${serverVideo.nomeDocumento || 'este vídeo'}" do servidor?`,
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Excluir',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await removeRdoAttachmentAsync(session, rdo, serverVideo);
                          setActiveVideo(null);
                          Alert.alert('Sucesso', 'Vídeo removido do servidor.');
                          await checkAttachments();
                        } catch (err: any) {
                          Alert.alert(
                            'Erro ao remover',
                            err?.message || 'Não foi possível excluir o vídeo.'
                          );
                        }
                      },
                    },
                  ]
                );
              }
            : undefined
        }
        onClose={() => setActiveVideo(null)}
      />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7FAFC',
  },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  backBtn: {
    padding: 8,
    marginRight: 8,
  },
  appBarTitleBox: {
    flex: 1,
  },
  appBarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  appBarSubtitle: {
    fontSize: 12,
    color: '#718096',
  },
  statusBadge: {
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#08776F',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  detailHeroBtn: {
    backgroundColor: '#08776F',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  detailHeroIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailHeroTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  detailHeroTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  detailHeroSubtitle: {
    fontSize: 12,
    color: '#E6FFFA',
    marginTop: 2,
  },
  statusActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statusActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF2F7',
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusActionPrimary: {
    backgroundColor: '#E6F4F1',
    borderColor: '#81E6D9',
  },
  statusActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2D3748',
    marginLeft: 6,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC',
  },
  infoLabel: {
    fontSize: 13,
    color: '#718096',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A202C',
  },
  addressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
  },
  addressText: {
    fontSize: 12,
    color: '#4A5568',
    marginLeft: 6,
    flex: 1,
  },
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
  },
  noticeCardSuccess: {
    backgroundColor: '#F0FFF4',
    borderColor: '#9AE6B4',
  },
  noticeCardWarning: {
    backgroundColor: '#FFFAF0',
    borderColor: '#FBD38D',
  },
  noticeTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  noticeTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  noticeDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  watchVideoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2F855A',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  watchVideoBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryActionBtn: {
    backgroundColor: '#1A202C',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  primaryActionBtnDisabled: {
    backgroundColor: '#718096',
    opacity: 0.85,
  },
  primaryActionTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  primaryActionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  primaryActionSubtitle: {
    fontSize: 12,
    color: '#E2E8F0',
    marginTop: 2,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#718096',
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  menuIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTextCol: {
    flex: 1,
    marginLeft: 12,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2D3748',
  },
  menuDesc: {
    fontSize: 12,
    color: '#A0AEC0',
    marginTop: 1,
  },
  cancelMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 12,
    marginTop: 6,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FED7D7',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 18,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#718096',
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1A202C',
    minHeight: 100,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalSecondaryBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalSecondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
  },
  modalDangerBtn: {
    flex: 1.4,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDangerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  btnDisabled: {
    opacity: 0.65,
  },
});

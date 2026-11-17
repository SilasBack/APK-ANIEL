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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LoginSession, RdoSummary, Encerramento } from '../types';
import { getRdoEndingsAsync, baixarRdoAsync, isEndingHidden } from '../services/apiClient';
import { parseServerDate } from '../services/rdoProtocol';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

interface Props {
  session: LoginSession;
  rdo: RdoSummary;
  onBack: () => void;
  onSuccess: () => void;
}

function toHHMM(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseHHMMOnToday(text: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d;
}

export function BaixarAtividadeScreen({ session, rdo, onBack, onSuccess }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();

  const initialEnd = new Date();
  const initialStart =
    parseServerDate(rdo.raw?.horaInicio) || new Date(initialEnd.getTime() - 15 * 60 * 1000);

  const [endings, setEndings] = useState<Encerramento[]>([]);
  const [loadingEndings, setLoadingEndings] = useState(true);
  const [selectedEnding, setSelectedEnding] = useState<Encerramento | null>(null);
  const [startTimeText, setStartTimeText] = useState<string>(toHHMM(initialStart));
  const [endTimeText, setEndTimeText] = useState<string>(toHHMM(initialEnd));
  const [observation, setObservation] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    setLoadingEndings(true);
    try {
      const list = (await getRdoEndingsAsync(session, rdo)).filter((e) => !isEndingHidden(e));
      setEndings(list);
      if (list.length > 0) {
        setSelectedEnding(list[0]);
      }
    } catch {
      Alert.alert('Aviso', 'Não foi possível carregar os encerramentos reais do servidor.');
    } finally {
      setLoadingEndings(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConfirm() {
    if (!selectedEnding) {
      Alert.alert('Atenção', 'Selecione o motivo de encerramento.');
      return;
    }

    const startDate = parseHHMMOnToday(startTimeText);
    const endDate = parseHHMMOnToday(endTimeText);
    if (!startDate || !endDate) {
      Alert.alert('Horário inválido', 'Informe Hora Início e Hora Término no formato HH:mm (ex: 09:30).');
      return;
    }
    if (endDate.getTime() < startDate.getTime()) {
      Alert.alert('Horário inválido', 'A Hora Término precisa ser igual ou posterior à Hora Início.');
      return;
    }

    const requiresObs =
      rdo.raw?.obrigaObservacao === true || rdo.raw?.contrato?.isObrigaObservacao === true;
    if (requiresObs && !observation.trim()) {
      Alert.alert('Observação obrigatória', 'Este contrato exige preenchimento do campo de observação.');
      return;
    }

    Alert.alert(
      'Confirmar Baixa de Atividade',
      `Deseja realmente baixar e encerrar o RDO #${rdo.number} com o encerramento "${selectedEnding.descricao}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar e Baixar', style: 'default', onPress: () => void executeBaixa(startDate, endDate) },
      ]
    );
  }

  async function executeBaixa(startDate: Date, endDate: Date) {
    if (!selectedEnding) return;
    setSubmitting(true);
    try {
      const success = await baixarRdoAsync(session, rdo, {
        encerramento: selectedEnding,
        observacao: observation.trim(),
        startDate,
        endDate,
      });

      if (success) {
        Alert.alert(
          'Sucesso!',
          `O RDO #${rdo.number} foi baixado com sucesso no servidor.`,
          [{ text: 'OK', onPress: onSuccess }]
        );
      } else {
        throw new Error('O servidor recusou a baixa da atividade.');
      }
    } catch (err: any) {
      Alert.alert('Erro ao dar baixa', err?.message || 'Falha ao comunicar com o servidor.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} disabled={submitting}>
          <MaterialIcons name="arrow-back" size={24} color={colors.icon} />
        </TouchableOpacity>
        <View style={styles.appBarTitleBox}>
          <Text style={styles.appBarTitle}>Baixar Atividade</Text>
          <Text style={styles.appBarSubtitle}>
            RDO #{rdo.number} · Conta {session.login}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* RDO Summary */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Resumo da Atividade</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>INEP / Projeto:</Text>
              <Text style={styles.summaryValue}>{rdo.project}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tipo de Serviço:</Text>
              <Text style={styles.summaryValue}>{rdo.service}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Técnico Responsável:</Text>
              <Text style={styles.summaryValue}>{session.name}</Text>
            </View>
          </View>

          {/* Horários de Atendimento */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Horário de Execução</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <Text style={styles.timeLabel}>Hora Início (HH:mm)</Text>
                <TextInput
                  style={styles.timeInput}
                  value={startTimeText}
                  onChangeText={setStartTimeText}
                  placeholder="09:00"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  editable={!submitting}
                />
              </View>
              <View style={styles.timeCol}>
                <Text style={styles.timeLabel}>Hora Término (HH:mm)</Text>
                <TextInput
                  style={styles.timeInput}
                  value={endTimeText}
                  onChangeText={setEndTimeText}
                  placeholder="10:00"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  editable={!submitting}
                />
              </View>
            </View>
          </View>

          {/* Encerramento Selection */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Motivo de Encerramento *</Text>
            {loadingEndings ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 16 }} />
            ) : endings.length === 0 ? (
              <Text style={styles.emptyText}>Nenhum motivo de encerramento disponível.</Text>
            ) : (
              <View style={styles.endingsList}>
                {endings.map((enc) => {
                  const isSelected = String(selectedEnding?.codigo) === String(enc.codigo);
                  return (
                    <TouchableOpacity
                      key={String(enc.codigo)}
                      style={[styles.endingItem, isSelected && styles.endingItemSelected]}
                      onPress={() => setSelectedEnding(enc)}
                      disabled={submitting}
                    >
                      <MaterialIcons
                        name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={20}
                        color={isSelected ? colors.primarySoftText : colors.placeholder}
                      />
                      <Text
                        style={[
                          styles.endingText,
                          isSelected && styles.endingTextSelected,
                        ]}
                      >
                        {enc.descricao}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* Observation */}
          <View style={styles.card}>
            <Text style={styles.cardHeader}>Observações do Fechamento</Text>
            <TextInput
              style={styles.obsInput}
              placeholder="Digite detalhes da conclusão da atividade..."
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={4}
              value={observation}
              onChangeText={setObservation}
              textAlignVertical="top"
              editable={!submitting}
            />
          </View>
        </ScrollView>

        {/* Pinned Bottom Submit Bar — safely above Android nav bar */}
        <View
          style={[
            styles.footerBar,
            { paddingBottom: Math.max(insets.bottom, 14) + 10 },
          ]}
        >
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="check" size={24} color="#FFF" />
                <Text style={styles.submitBtnText}>Confirmar e Baixar RDO</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  content: {
    padding: 16,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F7FAFC',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#718096',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A202C',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timeCol: {
    flex: 1,
  },
  timeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 6,
  },
  timeInput: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 15,
    fontWeight: '600',
    color: '#1A202C',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#A0AEC0',
    textAlign: 'center',
    paddingVertical: 16,
  },
  endingsList: {
    gap: 8,
  },
  endingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F7FAFC',
  },
  endingItemSelected: {
    borderColor: '#08776F',
    backgroundColor: '#E6F4F1',
  },
  endingText: {
    fontSize: 14,
    color: '#4A5568',
    marginLeft: 10,
    flex: 1,
  },
  endingTextSelected: {
    color: '#08776F',
    fontWeight: 'bold',
  },
  obsInput: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: '#1A202C',
    minHeight: 96,
  },
  footerBar: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  submitBtn: {
    backgroundColor: '#08776F',
    height: 52,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#08776F',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.65,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

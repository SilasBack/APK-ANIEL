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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LoginSession, RdoSummary, Encerramento } from '../types';
import { getRdoEndingsAsync, baixarRdoAsync } from '../services/apiClient';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

interface Props {
  session: LoginSession;
  rdo: RdoSummary;
  onBack: () => void;
  onSuccess: () => void;
}

export function BaixarAtividadeScreen({ session, rdo, onBack, onSuccess }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(baseStyles);
  const [endings, setEndings] = useState<Encerramento[]>([]);
  const [loadingEndings, setLoadingEndings] = useState(true);
  const [selectedEnding, setSelectedEnding] = useState<Encerramento | null>(null);
  const [observation, setObservation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [locationStatus, setLocationStatus] = useState<string>('Obtendo GPS...');
  const [currentCoords, setCurrentCoords] = useState<{
    latitude: number;
    longitude: number;
    altitude: number;
  }>({ latitude: NaN, longitude: NaN, altitude: 0 });



  async function loadData() {
    setLoadingEndings(true);
    try {
      const list = await getRdoEndingsAsync(session, rdo);
      setEndings(list);
      if (list.length > 0) {
        setSelectedEnding(list[0]);
      }
    } catch (err: any) {
      Alert.alert('Aviso', 'Não foi possível carregar os encerramentos reais do servidor.');
    } finally {
      setLoadingEndings(false);
    }
  }

  async function requestLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationStatus('GPS desabilitado / permissão negada');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCurrentCoords({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        altitude: loc.coords.altitude || 0,
      });
      setLocationStatus(`GPS: ${loc.coords.latitude.toFixed(5)}, ${loc.coords.longitude.toFixed(5)}`);
    } catch {
      setLocationStatus('GPS não disponível');
    }
  }

  useEffect(() => {
    loadData();
    requestLocation();
  }, []);

  function handleConfirm() {
    if (!Number.isFinite(currentCoords.latitude) || !Number.isFinite(currentCoords.longitude)) {
      Alert.alert('Localização necessária', 'Aguarde uma localização válida antes de baixar a atividade.'); return;
    }
    if (!selectedEnding) {
      Alert.alert('Atenção', 'Selecione o motivo de encerramento.');
      return;
    }

    // Check if contract requires observation
    const requiresObs = rdo.raw?.obrigaObservacao === true || rdo.raw?.contrato?.isObrigaObservacao === true;
    if (requiresObs && !observation.trim()) {
      Alert.alert('Observação obrigatória', 'Este contrato exige preenchimento do campo de observação.');
      return;
    }

    Alert.alert(
      'Confirmar Baixa de Atividade',
      `Deseja realmente baixar e encerrar o RDO #${rdo.number} com o encerramento "${selectedEnding.descricao}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar e Baixar', style: 'default', onPress: executeBaixa },
      ]
    );
  }

  async function executeBaixa() {
    if (!selectedEnding) return;
    setSubmitting(true);
    try {
      const success = await baixarRdoAsync(session, rdo, {
        encerramento: selectedEnding,
        observacao: observation.trim(),
        latitude: currentCoords.latitude,
        longitude: currentCoords.longitude,
        altitude: currentCoords.altitude,
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
    <SafeAreaView style={styles.container}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} disabled={submitting}>
          <MaterialIcons name="arrow-back" size={24} color={colors.icon} />
        </TouchableOpacity>
        <View style={styles.appBarTitleBox}>
          <Text style={styles.appBarTitle}>Baixar Atividade</Text>
          <Text style={styles.appBarSubtitle}>RDO #{rdo.number}</Text>
        </View>
      </View>

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
          <View style={styles.gpsRow}>
            <MaterialIcons name="my-location" size={16} color={colors.primarySoftText} />
            <Text style={styles.gpsText}>{locationStatus}</Text>
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
                const isSelected = selectedEnding?.codigo === enc.codigo;
                return (
                  <TouchableOpacity
                    key={String(enc.codigo)}
                    style={[styles.endingItem, isSelected && styles.endingItemSelected]}
                    onPress={() => setSelectedEnding(enc)}
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
          />
        </View>

        {/* Submit Button */}
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
      </ScrollView>
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
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
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
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    backgroundColor: '#E6F4F1',
    padding: 8,
    borderRadius: 8,
  },
  gpsText: {
    fontSize: 12,
    color: '#08776F',
    fontWeight: '500',
    marginLeft: 6,
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
    height: 100,
  },
  submitBtn: {
    backgroundColor: '#08776F',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 52,
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});

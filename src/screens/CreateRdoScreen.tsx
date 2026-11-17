import * as Location from 'expo-location';
import React, { useRef, useState } from 'react';
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
import { LoginSession } from '../types';
import { lookupCepAsync, createRdoAsync } from '../services/apiClient';

interface Props {
  session: LoginSession;
  onBack: () => void;
  onCreated: () => void;
}

export function CreateRdoScreen({ session, onBack, onCreated }: Props) {
  const [contract, setContract] = useState('0002');
  const [project, setProject] = useState('');
  const [evento, setEvento] = useState('100-ESCOLA_CONECTADA');
  const [service, setService] = useState('ESCOLA CONECTADA');
  const [subType, setSubType] = useState('ACEITAÇÃO FINAL');

  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [complemento, setComplemento] = useState('');

  const cepRequest=useRef(0);
  const createBusy=useRef(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleCepChange(value: string) {
    const requestId=++cepRequest.current;
    setCep(value);
    setLoadingCep(false);
    const clean = value.replace(/\D/g, '');
    if (clean.length === 8) {
      setLoadingCep(true);
      try {
        const res = await lookupCepAsync(clean);
        if (res && requestId===cepRequest.current) {
          if (res.logradouro) setRua(res.logradouro);
          if (res.bairro) setBairro(res.bairro);
          if (res.localidade) setCidade(res.localidade);
          if (res.uf) setUf(res.uf);
        }
      } finally {
        if (requestId===cepRequest.current) setLoadingCep(false);
      }
    }
  }

  async function handleCreate() {
    if (createBusy.current) return;
    if (!project.trim()) {
      Alert.alert('Atenção', 'Informe o Projeto / INEP da obra.');
      return;
    }

    createBusy.current=true;
    setSubmitting(true);
    try {
      const created = await createRdoAsync(session,{ contract,project:project.trim(),event:evento,serviceName:service,subtypeName:subType,getPosition:async()=>{const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw new Error('Autorize a localização para criar neste contrato.');const loc=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});return {latitude:loc.coords.latitude,longitude:loc.coords.longitude,altitude:loc.coords.altitude};},address:{rua:rua.trim(),numero:numero.trim(),bairro:bairro.trim(),cidade:cidade.trim(),estado:uf.trim(),complemento:complemento.trim(),cep:cep.trim()} });
      const createdNumber = ` (${created.number})`;

      Alert.alert('Sucesso', `RDO criado com sucesso${createdNumber}!`, [
        { text: 'OK', onPress: onCreated },
      ]);
    } catch (err: any) {
      Alert.alert(
        'Resultado da criação',
        (err?.message || 'Não foi possível confirmar a criação no servidor.') +
          '\n\nConsulte a lista de RDOs abertos antes de tentar novamente para evitar duplicidade.'
      );
    } finally {
      createBusy.current=false;
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} disabled={submitting}>
          <MaterialIcons name="arrow-back" size={24} color="#1A202C" />
        </TouchableOpacity>
        <Text style={styles.appBarTitle}>Criar Novo RDO</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Defaults Section */}
        <View style={styles.card}>
          <Text style={styles.cardHeader}>Dados do Contrato</Text>

          <Text style={styles.label}>Contrato</Text>
          <TextInput style={styles.inputDisabled} value={contract} editable={false} />

          <Text style={styles.label}>Projeto / Código INEP *</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: 31002345"
            placeholderTextColor="#A0AEC0"
            value={project}
            onChangeText={setProject}
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Evento</Text>
          <TextInput style={styles.inputDisabled} value={evento} editable={false} />

          <Text style={styles.label}>Tipo de Serviço</Text>
          <TextInput style={styles.inputDisabled} value={service} editable={false} />

          <Text style={styles.label}>Subtipo de Serviço</Text>
          <TextInput style={styles.inputDisabled} value={subType} editable={false} />
        </View>

        {/* Address Section */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardHeader}>Endereço da Obra</Text>
            {loadingCep && <ActivityIndicator size="small" color="#08776F" />}
          </View>

          <Text style={styles.label}>CEP (busca automática)</Text>
          <TextInput
            style={styles.input}
            placeholder="00000-000"
            placeholderTextColor="#A0AEC0"
            keyboardType="numeric"
            value={cep}
            onChangeText={handleCepChange}
            maxLength={9}
          />

          <Text style={styles.label}>Logradouro / Rua</Text>
          <TextInput
            style={styles.input}
            placeholder="Rua, Avenida..."
            placeholderTextColor="#A0AEC0"
            value={rua}
            onChangeText={setRua}
          />

          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Número</Text>
              <TextInput
                style={styles.input}
                placeholder="Nº ou S/N"
                placeholderTextColor="#A0AEC0"
                value={numero}
                onChangeText={setNumero}
              />
            </View>
            <View style={{ flex: 1.5 }}>
              <Text style={styles.label}>Bairro</Text>
              <TextInput
                style={styles.input}
                placeholder="Bairro"
                placeholderTextColor="#A0AEC0"
                value={bairro}
                onChangeText={setBairro}
              />
            </View>
          </View>

          <View style={styles.row}>
            <View style={{ flex: 2, marginRight: 8 }}>
              <Text style={styles.label}>Cidade</Text>
              <TextInput
                style={styles.input}
                placeholder="Cidade"
                placeholderTextColor="#A0AEC0"
                value={cidade}
                onChangeText={setCidade}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>UF</Text>
              <TextInput
                style={styles.input}
                placeholder="UF"
                placeholderTextColor="#A0AEC0"
                value={uf}
                onChangeText={setUf}
                maxLength={2}
                autoCapitalize="characters"
              />
            </View>
          </View>

          <Text style={styles.label}>Complemento</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Sala 2, Bloco B"
            placeholderTextColor="#A0AEC0"
            value={complemento}
            onChangeText={setComplemento}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleCreate}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <MaterialIcons name="save" size={22} color="#FFF" />
              <Text style={styles.submitBtnText}>Criar RDO</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  appBarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A202C',
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#1A202C',
  },
  inputDisabled: {
    backgroundColor: '#EDF2F7',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#718096',
  },
  row: {
    flexDirection: 'row',
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

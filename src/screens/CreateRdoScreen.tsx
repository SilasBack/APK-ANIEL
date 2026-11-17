import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  FlatList,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { LoginSession } from '../types';
import {
  lookupCepAsync,
  createRdoAsync,
  getContractsAsync,
  getServiceTypesAsync,
  getServiceSubtypesAsync,
} from '../services/apiClient';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

interface Props {
  session: LoginSession;
  sessions?: LoginSession[];
  onBack: () => void;
  onCreated: () => void;
}

interface PickerOption {
  id: string;
  label: string;
  subtitle?: string;
  raw?: any;
}

type ActivePicker =
  | null
  | {
      field: 'contract' | 'project' | 'event' | 'service' | 'subtype';
      title: string;
      placeholder: string;
      options: PickerOption[];
      selectedValue: string;
    };

function normText(v: any): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function serviceLabel(item: any): string {
  return String(item?.descricao || item?.nome || item?.tipoServico || item?.id || '').trim();
}

export function CreateRdoScreen({ session: initialSession, sessions, onBack, onCreated }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 360;
  const horizontalPad = isCompact ? 12 : 16;

  const availableSessions = sessions && sessions.length > 0 ? sessions : [initialSession];
  const [selectedLogin, setSelectedLogin] = useState(initialSession.login);
  const session =
    availableSessions.find((s) => s.login.toLowerCase() === selectedLogin.toLowerCase()) ||
    initialSession;

  // Server catalogs
  const [contracts, setContracts] = useState<any[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(true);
  const [catalogError, setCatalogError] = useState('');

  const [services, setServices] = useState<any[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);

  const [subtypes, setSubtypes] = useState<any[]>([]);
  const [loadingSubtypes, setLoadingSubtypes] = useState(false);

  // Editable contract form state
  const [contract, setContract] = useState('');
  const [project, setProject] = useState('');
  const [evento, setEvento] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [subtypeId, setSubtypeId] = useState('');
  const [subtypeName, setSubtypeName] = useState('');
  const [obra, setObra] = useState('');

  // Address state
  const [cep, setCep] = useState('');
  const [rua, setRua] = useState('');
  const [numero, setNumero] = useState('');
  const [bairro, setBairro] = useState('');
  const [cidade, setCidade] = useState('');
  const [uf, setUf] = useState('');
  const [complemento, setComplemento] = useState('');

  // Picker modal state
  const [picker, setPicker] = useState<ActivePicker>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const cepRequest = useRef(0);
  const serviceRequest = useRef(0);
  const subtypeRequest = useRef(0);
  const createBusy = useRef(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedContractObj = useMemo(
    () => contracts.find((c) => String(c.codCt) === contract.trim()) || null,
    [contracts, contract]
  );

  const projectList: any[] = useMemo(() => {
    if (!selectedContractObj || !Array.isArray(selectedContractObj.projetos)) return [];
    return selectedContractObj.projetos;
  }, [selectedContractObj]);

  const selectedProjectObj = useMemo(
    () => projectList.find((p) => String(p.projeto) === project.trim()) || null,
    [projectList, project]
  );

  const eventList: any[] = useMemo(() => {
    if (!selectedProjectObj || !Array.isArray(selectedProjectObj.eventos)) return [];
    return selectedProjectObj.eventos;
  }, [selectedProjectObj]);

  const isSequential = selectedContractObj ? selectedContractObj.isRDOSequencial === true : true;
  const requiresGps = selectedContractObj?.isObrigaGPS === true;

  async function loadSubtypesForService(svc: any) {
    const reqId = ++subtypeRequest.current;
    const id = String(svc?.id ?? '').trim();
    if (!id || !/^\d+$/.test(id)) {
      const embedded = Array.isArray(svc?.subTipos) ? svc.subTipos : [];
      setSubtypes(embedded);
      setLoadingSubtypes(false);
      return;
    }
    setLoadingSubtypes(true);
    try {
      const list = await getServiceSubtypesAsync(session, id);
      if (reqId !== subtypeRequest.current) return;
      const effective = list.length > 0 ? list : Array.isArray(svc?.subTipos) ? svc.subTipos : [];
      setSubtypes(effective);
      if (effective.length === 1) {
        setSubtypeId(String(effective[0].id ?? ''));
        setSubtypeName(serviceLabel(effective[0]));
      }
    } catch {
      if (reqId !== subtypeRequest.current) return;
      const embedded = Array.isArray(svc?.subTipos) ? svc.subTipos : [];
      setSubtypes(embedded);
    } finally {
      if (reqId === subtypeRequest.current) setLoadingSubtypes(false);
    }
  }

  async function loadServicesForContract(contractCode: string, contractObj: any) {
    const reqId = ++serviceRequest.current;
    if (!contractCode.trim()) {
      setServices([]);
      setSubtypes([]);
      return;
    }
    setLoadingServices(true);
    try {
      const list = await getServiceTypesAsync(session, contractCode);
      if (reqId !== serviceRequest.current) return;
      const effective =
        list.length > 0 ? list : Array.isArray(contractObj?.tipoServico) ? contractObj.tipoServico : [];
      setServices(effective);
      if (effective.length === 1) {
        const only = effective[0];
        setServiceId(String(only.id ?? ''));
        setServiceName(serviceLabel(only));
        void loadSubtypesForService(only);
      }
    } catch {
      if (reqId !== serviceRequest.current) return;
      const embedded = Array.isArray(contractObj?.tipoServico) ? contractObj.tipoServico : [];
      setServices(embedded);
    } finally {
      if (reqId === serviceRequest.current) setLoadingServices(false);
    }
  }

  async function loadContracts() {
    setLoadingContracts(true);
    setCatalogError('');
    try {
      const list = await getContractsAsync(session);
      setContracts(list);
      if (list.length > 0) {
        const current = list.find((c) => String(c.codCt) === contract.trim()) || list[0];
        const code = String(current.codCt || '');
        setContract(code);
        const projs = Array.isArray(current.projetos) ? current.projetos : [];
        if (projs.length === 1) {
          const onlyProj = projs[0];
          setProject(String(onlyProj.projeto || ''));
          const evts = Array.isArray(onlyProj.eventos) ? onlyProj.eventos : [];
          if (evts.length === 1) {
            setEvento(String(evts[0].evento || ''));
          }
        }
        void loadServicesForContract(code, current);
      }
    } catch (err: any) {
      setCatalogError(err?.message || 'Não foi possível carregar os contratos do servidor.');
    } finally {
      setLoadingContracts(false);
    }
  }

  useEffect(() => {
    void loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.login]);

  function handleSelectContract(code: string, rawContract?: any) {
    const clean = code.trim();
    const matched = rawContract || contracts.find((c) => String(c.codCt) === clean) || null;
    setContract(clean);
    setProject('');
    setEvento('');
    setServiceId('');
    setServiceName('');
    setSubtypeId('');
    setSubtypeName('');
    setSubtypes([]);
    if (matched) {
      const projs = Array.isArray(matched.projetos) ? matched.projetos : [];
      if (projs.length === 1) {
        const onlyProj = projs[0];
        setProject(String(onlyProj.projeto || ''));
        const evts = Array.isArray(onlyProj.eventos) ? onlyProj.eventos : [];
        if (evts.length === 1) setEvento(String(evts[0].evento || ''));
      }
      void loadServicesForContract(clean, matched);
    }
  }

  function handleSelectProject(projCode: string, rawProject?: any) {
    const clean = projCode.trim();
    const matched = rawProject || projectList.find((p) => String(p.projeto) === clean) || null;
    setProject(clean);
    const evts = Array.isArray(matched?.eventos) ? matched.eventos : [];
    if (evts.length === 1) {
      setEvento(String(evts[0].evento || ''));
    } else if (evts.length > 0 && !evts.some((e: any) => String(e.evento) === evento.trim())) {
      setEvento('');
    }
  }

  function handleSelectService(name: string, rawService?: any) {
    const matched =
      rawService ||
      services.find((s) => normText(serviceLabel(s)) === normText(name)) ||
      null;
    setServiceName(matched ? serviceLabel(matched) : name);
    setServiceId(matched ? String(matched.id ?? '') : '');
    setSubtypeId('');
    setSubtypeName('');
    setSubtypes([]);
    if (matched) {
      void loadSubtypesForService(matched);
    }
  }

  function handleSelectSubtype(name: string, rawSubtype?: any) {
    const matched =
      rawSubtype ||
      subtypes.find((s) => normText(serviceLabel(s)) === normText(name)) ||
      null;
    setSubtypeName(matched ? serviceLabel(matched) : name);
    setSubtypeId(matched ? String(matched.id ?? '') : '');
  }

  function openPicker(field: 'contract' | 'project' | 'event' | 'service' | 'subtype') {
    setPickerSearch('');
    if (field === 'contract') {
      const options: PickerOption[] = contracts.map((c, idx) => ({
        id: String(c.codCt ?? idx),
        label: String(c.codCt || ''),
        subtitle:
          [
            c.descricao || c.nome || '',
            Array.isArray(c.projetos) ? `${c.projetos.length} projeto(s)` : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        raw: c,
      }));
      setPicker({
        field,
        title: 'Selecionar Contrato',
        placeholder: 'Buscar contrato...',
        options,
        selectedValue: contract,
      });
    } else if (field === 'project') {
      const options: PickerOption[] = projectList.map((p, idx) => ({
        id: String(p.projeto ?? idx),
        label: String(p.projeto || ''),
        subtitle:
          [
            p.descricao || p.nome || '',
            Array.isArray(p.eventos) ? `${p.eventos.length} evento(s)` : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined,
        raw: p,
      }));
      setPicker({
        field,
        title: 'Selecionar Projeto / INEP',
        placeholder: 'Buscar código INEP ou projeto...',
        options,
        selectedValue: project,
      });
    } else if (field === 'event') {
      const options: PickerOption[] = eventList.map((e, idx) => ({
        id: String(e.evento ?? idx),
        label: String(e.evento || ''),
        subtitle: e.unidadeCusto ? `Centro de custo: ${e.unidadeCusto}` : undefined,
        raw: e,
      }));
      setPicker({
        field,
        title: 'Selecionar Evento',
        placeholder: 'Buscar evento...',
        options,
        selectedValue: evento,
      });
    } else if (field === 'service') {
      const options: PickerOption[] = services.map((s, idx) => ({
        id: String(s.id ?? idx),
        label: serviceLabel(s),
        subtitle: s.id ? `Código: ${s.id}` : undefined,
        raw: s,
      }));
      setPicker({
        field,
        title: 'Selecionar Tipo de Serviço',
        placeholder: 'Buscar tipo de serviço...',
        options,
        selectedValue: serviceName,
      });
    } else if (field === 'subtype') {
      const options: PickerOption[] = subtypes.map((s, idx) => ({
        id: String(s.id ?? idx),
        label: serviceLabel(s),
        subtitle: s.id ? `Código: ${s.id}` : undefined,
        raw: s,
      }));
      setPicker({
        field,
        title: 'Selecionar Subtipo de Serviço',
        placeholder: 'Buscar subtipo...',
        options,
        selectedValue: subtypeName,
      });
    }
  }

  function handlePickerChoose(opt: PickerOption) {
    if (!picker) return;
    if (picker.field === 'contract') {
      handleSelectContract(opt.label, opt.raw);
    } else if (picker.field === 'project') {
      handleSelectProject(opt.label, opt.raw);
    } else if (picker.field === 'event') {
      setEvento(opt.label);
    } else if (picker.field === 'service') {
      handleSelectService(opt.label, opt.raw);
    } else if (picker.field === 'subtype') {
      handleSelectSubtype(opt.label, opt.raw);
    }
    setPicker(null);
  }

  const filteredPickerOptions = useMemo(() => {
    if (!picker) return [];
    const q = normText(pickerSearch);
    if (!q) return picker.options;
    return picker.options.filter(
      (o) => normText(o.label).includes(q) || normText(o.subtitle || '').includes(q)
    );
  }, [picker, pickerSearch]);

  async function handleCepChange(value: string) {
    const requestId = ++cepRequest.current;
    setCep(value);
    setLoadingCep(false);
    const clean = value.replace(/\D/g, '');
    if (clean.length === 8) {
      setLoadingCep(true);
      try {
        const res = await lookupCepAsync(clean);
        if (res && requestId === cepRequest.current) {
          if (res.logradouro) setRua(res.logradouro);
          if (res.bairro) setBairro(res.bairro);
          if (res.localidade) setCidade(res.localidade);
          if (res.uf) setUf(res.uf);
        }
      } finally {
        if (requestId === cepRequest.current) setLoadingCep(false);
      }
    }
  }

  async function handleCreate() {
    if (createBusy.current) return;
    if (!contract.trim()) {
      Alert.alert('Atenção', 'Selecione ou informe o Contrato.');
      return;
    }
    if (!project.trim()) {
      Alert.alert('Atenção', 'Selecione ou informe o Projeto / Código INEP.');
      return;
    }
    if (eventList.length > 0 && !evento.trim()) {
      Alert.alert('Atenção', 'Selecione ou informe o Evento.');
      return;
    }
    if (!serviceName.trim() && !serviceId.trim()) {
      Alert.alert('Atenção', 'Selecione ou informe o Tipo de Serviço.');
      return;
    }
    if (subtypes.length > 0 && !subtypeName.trim() && !subtypeId.trim()) {
      Alert.alert('Atenção', 'Selecione ou informe o Subtipo de Serviço.');
      return;
    }
    if (!isSequential && !obra.trim()) {
      Alert.alert('Atenção', 'Informe o Número do RDO para este contrato.');
      return;
    }

    createBusy.current = true;
    setSubmitting(true);
    try {
      const created = await createRdoAsync(session, {
        contract: contract.trim(),
        project: project.trim(),
        event: evento.trim(),
        serviceName: serviceName.trim(),
        subtypeName: subtypeName.trim(),
        serviceId: serviceId.trim() || undefined,
        subtypeId: subtypeId.trim() || undefined,
        obra: isSequential ? undefined : obra.trim(),
        getPosition: async () => {
          const permission = await Location.requestForegroundPermissionsAsync();
          if (!permission.granted) {
            throw new Error('Autorize a localização para criar neste contrato.');
          }
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          return {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            altitude: loc.coords.altitude,
          };
        },
        address: {
          rua: rua.trim(),
          numero: numero.trim(),
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          estado: uf.trim(),
          complemento: complemento.trim(),
          cep: cep.trim(),
        },
      });
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
      createBusy.current = false;
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
        <View style={styles.appBarTitleCol}>
          <Text style={styles.appBarTitle} numberOfLines={1}>
            Criar Novo RDO
          </Text>
          <Text style={styles.appBarSubtitle} numberOfLines={1}>
            Conta {session.login} · Equipe {session.team || session.login}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.reloadBtn}
          onPress={loadContracts}
          disabled={loadingContracts || submitting}
        >
          {loadingContracts ? (
            <ActivityIndicator size="small" color={colors.primarySoftText} />
          ) : (
            <MaterialIcons name="refresh" size={22} color={colors.primarySoftText} />
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 12}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: horizontalPad },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formInner}>
            {catalogError.length > 0 && (
              <View style={styles.errorBanner}>
                <MaterialIcons name="error-outline" size={18} color="#C53030" />
                <Text style={styles.errorBannerText}>{catalogError}</Text>
              </View>
            )}

            {availableSessions.length > 1 && (
              <View style={[styles.card, isCompact && styles.cardCompact]}>
                <Text style={styles.cardHeader}>Conta que vai criar o RDO</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8 }}
                >
                  {availableSessions.map((acc) => {
                    const active = acc.login.toLowerCase() === session.login.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={acc.login}
                        style={[styles.accountPill, active && styles.accountPillActive]}
                        onPress={() => {
                          if (!active) {
                            setSelectedLogin(acc.login);
                            setContract('');
                            setProject('');
                            setEvento('');
                            setServiceId('');
                            setServiceName('');
                            setSubtypeId('');
                            setSubtypeName('');
                            setServices([]);
                            setSubtypes([]);
                          }
                        }}
                        disabled={submitting}
                      >
                        <MaterialIcons
                          name="person"
                          size={15}
                          color={active ? '#FFF' : colors.textSecondary}
                        />
                        <Text
                          style={[
                            styles.accountPillText,
                            active && styles.accountPillTextActive,
                          ]}
                        >
                          {acc.login}
                          {acc.team ? ` · ${acc.team}` : ''}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Contract & Catalog Section */}
            <View style={[styles.card, isCompact && styles.cardCompact]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeader}>Dados do Contrato</Text>
                {loadingContracts && <ActivityIndicator size="small" color={colors.primarySoftText} />}
              </View>

              {/* Contrato */}
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Contrato *</Text>
                {contracts.length > 0 && (
                  <Text style={styles.countHint}>{contracts.length} opção(ões)</Text>
                )}
              </View>
              <View style={styles.comboRow}>
                <TextInput
                  style={[styles.input, styles.comboInput]}
                  placeholder="Ex: 0002"
                  placeholderTextColor={colors.placeholder}
                  value={contract}
                  onChangeText={(txt) => handleSelectContract(txt)}
                  autoCapitalize="characters"
                  editable={!submitting}
                />
                <TouchableOpacity
                  style={styles.selectBtn}
                  onPress={() => openPicker('contract')}
                  disabled={loadingContracts || submitting}
                >
                  <MaterialIcons name="arrow-drop-down" size={22} color={colors.primarySoftText} />
                  <Text style={styles.selectBtnText}>Opções</Text>
                </TouchableOpacity>
              </View>

              {/* Projeto / Código INEP */}
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Projeto / Código INEP *</Text>
                {projectList.length > 0 && (
                  <Text style={styles.countHint}>{projectList.length} disponível(is)</Text>
                )}
              </View>
              <View style={styles.comboRow}>
                <TextInput
                  style={[styles.input, styles.comboInput]}
                  placeholder="Digite ou selecione o INEP"
                  placeholderTextColor={colors.placeholder}
                  value={project}
                  onChangeText={(txt) => handleSelectProject(txt)}
                  autoCapitalize="characters"
                  editable={!submitting}
                />
                <TouchableOpacity
                  style={[styles.selectBtn, projectList.length === 0 && styles.selectBtnMuted]}
                  onPress={() => openPicker('project')}
                  disabled={projectList.length === 0 || submitting}
                >
                  <MaterialIcons
                    name="arrow-drop-down"
                    size={22}
                    color={projectList.length > 0 ? colors.primarySoftText : colors.placeholder}
                  />
                  <Text
                    style={[
                      styles.selectBtnText,
                      projectList.length === 0 && styles.selectBtnTextMuted,
                    ]}
                  >
                    Opções
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Evento */}
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>
                  Evento {eventList.length > 0 ? '*' : '(opcional)'}
                </Text>
                {eventList.length > 0 && (
                  <Text style={styles.countHint}>{eventList.length} opção(ões)</Text>
                )}
              </View>
              <View style={styles.comboRow}>
                <TextInput
                  style={[styles.input, styles.comboInput]}
                  placeholder="Ex: 100-ESCOLA_CONECTADA"
                  placeholderTextColor={colors.placeholder}
                  value={evento}
                  onChangeText={setEvento}
                  autoCapitalize="characters"
                  editable={!submitting}
                />
                <TouchableOpacity
                  style={[styles.selectBtn, eventList.length === 0 && styles.selectBtnMuted]}
                  onPress={() => openPicker('event')}
                  disabled={eventList.length === 0 || submitting}
                >
                  <MaterialIcons
                    name="arrow-drop-down"
                    size={22}
                    color={eventList.length > 0 ? colors.primarySoftText : colors.placeholder}
                  />
                  <Text
                    style={[
                      styles.selectBtnText,
                      eventList.length === 0 && styles.selectBtnTextMuted,
                    ]}
                  >
                    Opções
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Tipo de Serviço */}
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>Tipo de Serviço *</Text>
                {loadingServices ? (
                  <ActivityIndicator size="small" color={colors.primarySoftText} />
                ) : services.length > 0 ? (
                  <Text style={styles.countHint}>{services.length} opção(ões)</Text>
                ) : null}
              </View>
              <View style={styles.comboRow}>
                <TextInput
                  style={[styles.input, styles.comboInput]}
                  placeholder="Selecione ou digite o serviço"
                  placeholderTextColor={colors.placeholder}
                  value={serviceName}
                  onChangeText={(txt) => handleSelectService(txt)}
                  editable={!submitting}
                />
                <TouchableOpacity
                  style={[styles.selectBtn, services.length === 0 && styles.selectBtnMuted]}
                  onPress={() => openPicker('service')}
                  disabled={services.length === 0 || submitting}
                >
                  <MaterialIcons
                    name="arrow-drop-down"
                    size={22}
                    color={services.length > 0 ? colors.primarySoftText : colors.placeholder}
                  />
                  <Text
                    style={[
                      styles.selectBtnText,
                      services.length === 0 && styles.selectBtnTextMuted,
                    ]}
                  >
                    Opções
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Subtipo de Serviço */}
              <View style={styles.labelRow}>
                <Text style={styles.labelInline}>
                  Subtipo de Serviço {subtypes.length > 0 ? '*' : '(opcional)'}
                </Text>
                {loadingSubtypes ? (
                  <ActivityIndicator size="small" color={colors.primarySoftText} />
                ) : subtypes.length > 0 ? (
                  <Text style={styles.countHint}>{subtypes.length} opção(ões)</Text>
                ) : null}
              </View>
              <View style={styles.comboRow}>
                <TextInput
                  style={[styles.input, styles.comboInput]}
                  placeholder="Selecione ou digite o subtipo"
                  placeholderTextColor={colors.placeholder}
                  value={subtypeName}
                  onChangeText={(txt) => handleSelectSubtype(txt)}
                  editable={!submitting}
                />
                <TouchableOpacity
                  style={[styles.selectBtn, subtypes.length === 0 && styles.selectBtnMuted]}
                  onPress={() => openPicker('subtype')}
                  disabled={subtypes.length === 0 || submitting}
                >
                  <MaterialIcons
                    name="arrow-drop-down"
                    size={22}
                    color={subtypes.length > 0 ? colors.primarySoftText : colors.placeholder}
                  />
                  <Text
                    style={[
                      styles.selectBtnText,
                      subtypes.length === 0 && styles.selectBtnTextMuted,
                    ]}
                  >
                    Opções
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Número do RDO (apenas se não sequencial) */}
              {!isSequential ? (
                <>
                  <Text style={styles.label}>Número do RDO / Obra *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Informe o número do RDO"
                    placeholderTextColor={colors.placeholder}
                    value={obra}
                    onChangeText={setObra}
                    editable={!submitting}
                  />
                </>
              ) : selectedContractObj ? (
                <View style={styles.metaPillsRow}>
                  <View style={styles.metaPill}>
                    <MaterialIcons name="tag" size={14} color={colors.primarySoftText} />
                    <Text style={styles.metaPillText}>Numeração automática pelo servidor</Text>
                  </View>
                  {requiresGps && (
                    <View style={styles.metaPillWarn}>
                      <MaterialIcons name="my-location" size={14} color="#B7791F" />
                      <Text style={styles.metaPillWarnText}>Exige GPS ao criar</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </View>

            {/* Address Section */}
            <View style={[styles.card, isCompact && styles.cardCompact]}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardHeader}>Endereço da Obra</Text>
                {loadingCep && <ActivityIndicator size="small" color={colors.primarySoftText} />}
              </View>

              <Text style={styles.label}>CEP (busca automática)</Text>
              <TextInput
                style={styles.input}
                placeholder="00000-000"
                placeholderTextColor={colors.placeholder}
                keyboardType="numeric"
                value={cep}
                onChangeText={handleCepChange}
                maxLength={9}
                editable={!submitting}
              />

              <Text style={styles.label}>Logradouro / Rua</Text>
              <TextInput
                style={styles.input}
                placeholder="Rua, Avenida..."
                placeholderTextColor={colors.placeholder}
                value={rua}
                onChangeText={setRua}
                editable={!submitting}
              />

              <View style={isCompact ? styles.stackCol : styles.row}>
                <View style={isCompact ? undefined : { flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Número</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Nº ou S/N"
                    placeholderTextColor={colors.placeholder}
                    value={numero}
                    onChangeText={setNumero}
                    editable={!submitting}
                  />
                </View>
                <View style={isCompact ? undefined : { flex: 1.5 }}>
                  <Text style={styles.label}>Bairro</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Bairro"
                    placeholderTextColor={colors.placeholder}
                    value={bairro}
                    onChangeText={setBairro}
                    editable={!submitting}
                  />
                </View>
              </View>

              <View style={isCompact ? styles.stackCol : styles.row}>
                <View style={isCompact ? undefined : { flex: 2, marginRight: 8 }}>
                  <Text style={styles.label}>Cidade</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Cidade"
                    placeholderTextColor={colors.placeholder}
                    value={cidade}
                    onChangeText={setCidade}
                    editable={!submitting}
                  />
                </View>
                <View style={isCompact ? undefined : { flex: 1 }}>
                  <Text style={styles.label}>UF</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="UF"
                    placeholderTextColor={colors.placeholder}
                    value={uf}
                    onChangeText={setUf}
                    maxLength={2}
                    autoCapitalize="characters"
                    editable={!submitting}
                  />
                </View>
              </View>

              <Text style={styles.label}>Complemento</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Sala 2, Bloco B"
                placeholderTextColor={colors.placeholder}
                value={complemento}
                onChangeText={setComplemento}
                editable={!submitting}
              />
            </View>
          </View>
        </ScrollView>

        {/* Pinned Bottom Action Bar — always safely above Android nav bar */}
        <View
          style={[
            styles.footerBar,
            {
              paddingHorizontal: horizontalPad,
              paddingBottom: Math.max(insets.bottom, 14) + 10,
            },
          ]}
        >
          <View style={styles.formInner}>
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
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Searchable Selector Modal */}
      <Modal
        visible={Boolean(picker)}
        transparent
        animationType="slide"
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              {
                maxHeight: Math.round(height * 0.78),
                paddingBottom: Math.max(insets.bottom, 16) + 12,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{picker?.title}</Text>
              <TouchableOpacity onPress={() => setPicker(null)} style={styles.modalCloseBtn}>
                <MaterialIcons name="close" size={24} color="#4A5568" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <MaterialIcons name="search" size={20} color="#718096" />
              <TextInput
                style={styles.searchInput}
                placeholder={picker?.placeholder || 'Buscar...'}
                placeholderTextColor={colors.placeholder}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                autoFocus={false}
              />
              {pickerSearch.length > 0 && (
                <TouchableOpacity onPress={() => setPickerSearch('')}>
                  <MaterialIcons name="clear" size={18} color="#A0AEC0" />
                </TouchableOpacity>
              )}
            </View>

            <FlatList
              data={filteredPickerOptions}
              keyExtractor={(item, idx) => `${item.id}-${idx}`}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={styles.modalEmpty}>
                  <Text style={styles.modalEmptyText}>Nenhuma opção encontrada.</Text>
                </View>
              }
              renderItem={({ item }) => {
                const isSelected =
                  normText(item.label) === normText(picker?.selectedValue || '');
                return (
                  <TouchableOpacity
                    style={[styles.optionRow, isSelected && styles.optionRowSelected]}
                    onPress={() => handlePickerChoose(item)}
                  >
                    <View style={styles.optionTextCol}>
                      <Text
                        style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}
                      >
                        {item.label}
                      </Text>
                      {item.subtitle ? (
                        <Text style={styles.optionSub}>{item.subtitle}</Text>
                      ) : null}
                    </View>
                    {isSelected && <MaterialIcons name="check-circle" size={20} color={colors.primarySoftText} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  backBtn: {
    padding: 8,
    marginRight: 4,
  },
  appBarTitleCol: {
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
  reloadBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#E6F4F1',
  },
  content: {
    paddingTop: 14,
    paddingBottom: 24,
  },
  formInner: {
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  accountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  accountPillActive: {
    backgroundColor: '#08776F',
  },
  accountPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D3748',
  },
  accountPillTextActive: {
    color: '#FFF',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEB2B2',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 13,
    color: '#C53030',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  cardCompact: {
    padding: 12,
  },
  cardHeader: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 6,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
    marginTop: 8,
    marginBottom: 4,
  },
  labelInline: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A5568',
  },
  countHint: {
    fontSize: 11,
    color: '#718096',
  },
  comboRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  comboInput: {
    flex: 1,
  },
  selectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#E6F4F1',
    borderWidth: 1,
    borderColor: '#B2DFDB',
  },
  selectBtnMuted: {
    backgroundColor: '#EDF2F7',
    borderColor: '#E2E8F0',
  },
  selectBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#08776F',
    marginRight: 2,
  },
  selectBtnTextMuted: {
    color: '#A0AEC0',
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
  metaPillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#08776F',
  },
  metaPillWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FEFCBF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  metaPillWarnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#975A16',
  },
  row: {
    flexDirection: 'row',
  },
  stackCol: {
    flexDirection: 'column',
  },
  footerBar: {
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
    paddingVertical: 12,
  },
  submitBtn: {
    backgroundColor: '#08776F',
    height: 50,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A202C',
  },
  modalCloseBtn: {
    padding: 4,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    margin: 12,
    paddingHorizontal: 10,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1A202C',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionRowSelected: {
    backgroundColor: '#E6F4F1',
  },
  optionTextCol: {
    flex: 1,
    marginRight: 8,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A202C',
  },
  optionLabelSelected: {
    color: '#08776F',
  },
  optionSub: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  modalEmpty: {
    padding: 28,
    alignItems: 'center',
  },
  modalEmptyText: {
    fontSize: 14,
    color: '#718096',
  },
});

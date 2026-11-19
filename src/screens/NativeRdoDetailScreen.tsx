import { ApiError } from '../services/apiClient';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LoginSession, RdoSummary } from '../types';
import { getClientDevice } from '../services/storage';
import {
  getText,
  getArray,
  getBool,
  questionType,
  isRequiredQuestion,
  isSignatureQuestion,
  detailAnswerText,
  detailImageSource,
  signatureImageSource,
  fetchRdoDetailFullAsync,
  canEditSavedAnswer,
  updateSavedAnswerOnServerAsync,
  buildSavedSignatureAnswer,
  buildSavedPhotoAnswer,
  buildNewDetailAnswer,
  saveRdoDetailMultipartAsync,
  photoFormat,
  DetailDraft,
  QuestionDraftItem,
  isScannerOrSerialQuestion,
  resolveQuestionOptions,
} from '../services/detailWorkflow';
import { EquipmentAuditPanel } from '../components/EquipmentAuditPanel';
import { SignaturePad } from '../components/SignaturePad';
import { PhotoViewerModal } from '../components/PhotoViewerModal';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

interface Props {
  session: LoginSession;
  rdo: RdoSummary;
  closed?: boolean;
  onBack: () => void;
}

interface GalleryEntry {
  answer: any;
  row: any;
  photo: any;
  url: string;
}

export function NativeRdoDetailScreen({ session, rdo, closed = false, onBack }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(baseStyles, ['signaturePreviewBox', 'signatureImage']);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [cached, setCached] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string>('');
  const [detailData, setDetailData] = useState<any>(null);
  const [diagnostic, setDiagnostic] = useState('');
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Accordion states for saved questionnaires ("Respostas e fotos salvas / Abrir detalhamento")
  const [expandedSavedIds, setExpandedSavedIds] = useState<Record<string, boolean>>({});

  // Questionnaire editing state
  const [draftsByQuizId, setDraftsState] = useState<Record<string, DetailDraft>>({});
  const draftsRef = useRef<Record<string, DetailDraft>>({});
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const sendingRef = useRef(false);
  function setDraftsByQuizId(next: Record<string, DetailDraft>) { draftsRef.current = next; setDraftsState(next); }
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);
  const [viewServerWhileEditing, setViewServerWhileEditing] = useState(false);
  const [confirmSendNewModal, setConfirmSendNewModal] = useState(false);
  const [newListTemplate, setNewListTemplate] = useState<any>(null);
  const [newListName, setNewListName] = useState('');
  const creatingListRef = useRef(false);

  // Barcode Scanner Modal state
  const [scannerModal, setScannerModal] = useState<{
    visible: boolean;
    title: string;
    target: 'draft' | 'saved';
    qIdx?: number;
  } | null>(null);
  const [optionFilterText, setOptionFilterText] = useState('');

  // Saved Answer Editor Modal state
  const [answerEditModal, setAnswerEditModal] = useState<{
    visible: boolean;
    answer: any;
    row: any;
    value: string;
    review: boolean;
    selectedOptionId?: number | null;
  } | null>(null);

  // Saved Signature Editor Modal state
  const [signatureEditModal, setSignatureEditModal] = useState<{
    visible: boolean;
    answer: any;
    row: any;
    pngDataUrl: string;
    review: boolean;
  } | null>(null);

  // Saved Photo Editor Modal state (Add / Delete photos on saved questionnaire)
  const [photoEditModal, setPhotoEditModal] = useState<{
    visible: boolean;
    operation: 'Incluir' | 'Excluir';
    answer: any;
    row: any;
    serverPhotoId: string;
    localPhotos: { id: string; uri: string; type: string; ext: string }[];
  } | null>(null);

  // Photo Viewer / Gallery Modal state
  const [viewerState, setViewerState] = useState<{
    visible: boolean;
    source: string | null;
    title: string;
    gallery: GalleryEntry[];
    index: number;
  }>({
    visible: false,
    source: null,
    title: '',
    gallery: [],
    index: -1,
  });

  const storageDraftKey = `@aniel_detail_draft_${session.login}_${rdo.contract}_${rdo.project}_${rdo.number}_${rdo.raw?.contrato ?? ''}`;



  async function initializeScreen() {
    try {
      const savedRaw = await AsyncStorage.getItem(storageDraftKey);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw);
        if (parsed.draftsByQuizId) {
          const restored = Object.fromEntries(Object.entries(parsed.draftsByQuizId).map(([k,v]: [string,any]) => [k,{...v,state:v.state==='sending'?'unknown':v.state}]));
          setDraftsByQuizId(restored);
        }
        if (parsed.snapshot) {
          setDetailData(parsed.snapshot);
          setLoaded(true);
          setCached(true);
          setLoadedAt(parsed.loadedAt || '');
        }
      }
    } catch {
      // Ignore cache read error
    }
    await loadFromServer();
  }

  async function persistLocalState(
    nextDrafts: Record<string, DetailDraft>,
    snapshot: any = detailData,
    snapshotTime: string = loadedAt
  ) {
    try {
      const value=JSON.stringify({draftsByQuizId:nextDrafts,snapshot,loadedAt:snapshotTime});
      const pending=writeQueue.current.catch(() => {}).then(() => AsyncStorage.setItem(storageDraftKey,value));
      writeQueue.current=pending;
      await pending;
      return true;
    } catch {
      setError('Não foi possível salvar os dados neste celular. Seu preenchimento continua na tela.');
      return false;
    }
  }

  async function loadFromServer() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetchRdoDetailFullAsync(session, rdo);
      const nowStr = new Date().toLocaleString('pt-BR');
      setDetailData(res.data);
      setDiagnostic(res.diagnostic);
      setLoaded(true);
      setCached(false);
      setLoadedAt(nowStr);

      // Auto-expand first saved questionnaire if any
      const doneList = getArray(res.data, 'questionariosFeitos');
      if (doneList.length > 0) {
        const firstKey = getText(doneList[0], 'id') || getText(doneList[0], 'protocolo') || '0';
        setExpandedSavedIds((prev) => ({ ...prev, [firstKey]: true }));
      }

      await persistLocalState(draftsRef.current, res.data, nowStr);
    } catch (err: any) {
      // Preserve the restored cache indicator if the server is unavailable.
      setError(err?.message || 'Não foi possível consultar o detalhamento original deste RDO.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    initializeScreen();
  }, [storageDraftKey]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editingQuizId) {
        setEditingQuizId(null);
        setViewServerWhileEditing(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [editingQuizId]);

  async function handleRefreshFromServer() {
    if (busy || refreshing) return;
    setRefreshing(true);
    setError('');
    try {
      await loadFromServer();
      if (editingQuizId) {
        setViewServerWhileEditing(true);
        setMessage(
          'Dados do servidor atualizados. Seu preenchimento foi preservado; use "Voltar ao preenchimento" para continuar.'
        );
      } else {
        setMessage('Respostas, fotos e assinaturas atualizadas do servidor.');
      }
    } finally {
      setRefreshing(false);
    }
  }

  const templates = getArray(detailData, 'questionarios');
  const doneList = getArray(detailData, 'questionariosFeitos');
  const activeDraft = editingQuizId ? draftsByQuizId[editingQuizId] || null : null;

  // Helpers for Saved Photos Continuous Numbering (Foto X de Y across all questions in a questionnaire)
  function getSavedPhotoTotal(answer: any): number {
    return getArray(answer, 'respostas')
      .filter((r) => questionType(r) === 'Foto')
      .reduce(
        (sum, r) =>
          sum + getArray(r, 'multi').filter((p) => getText(p, 'urlfoto').length > 0).length,
        0
      );
  }

  function getSavedPhotoStart(answer: any, targetRow: any): number {
    const sorted = [...getArray(answer, 'respostas')].sort(
      (a, b) => (parseInt(getText(a, 'ordem'), 10) || 0) - (parseInt(getText(b, 'ordem'), 10) || 0)
    );
    let count = 1;
    for (const r of sorted) {
      if (getText(r, 'id') === getText(targetRow, 'id')) break;
      if (questionType(r) === 'Foto') {
        count += getArray(r, 'multi').filter((p) => getText(p, 'urlfoto').length > 0).length;
      }
    }
    return count;
  }

  function buildQuestionnaireGallery(answer: any): GalleryEntry[] {
    const sorted = [...getArray(answer, 'respostas')].sort(
      (a, b) => (parseInt(getText(a, 'ordem'), 10) || 0) - (parseInt(getText(b, 'ordem'), 10) || 0)
    );
    const list: GalleryEntry[] = [];
    for (const row of sorted) {
      if (questionType(row) !== 'Foto') continue;
      const photos = getArray(row, 'multi').filter((p) => getText(p, 'urlfoto').length > 0);
      for (const photo of photos) {
        const url = detailImageSource(getText(photo, 'urlfoto'));
        if (url) {
          list.push({ answer, row, photo, url });
        }
      }
    }
    return list;
  }

  function openSavedPhotoInGallery(answer: any, row: any, photo: any) {
    const gallery = buildQuestionnaireGallery(answer);
    const idx = gallery.findIndex(
      (g) =>
        getText(g.row, 'id') === getText(row, 'id') &&
        getText(g.photo, 'id') === getText(photo, 'id') &&
        getText(g.photo, 'urlfoto') === getText(photo, 'urlfoto')
    );
    if (idx >= 0) {
      const entry = gallery[idx];
      setViewerState({
        visible: true,
        source: entry.url,
        title: getText(entry.row, 'pergunta'),
        gallery,
        index: idx,
      });
    }
  }

  function moveGallery(delta: number) {
    setViewerState((prev) => {
      if (prev.gallery.length === 0 || prev.index < 0) return prev;
      const nextIdx = Math.max(0, Math.min(prev.gallery.length - 1, prev.index + delta));
      const entry = prev.gallery[nextIdx];
      return {
        ...prev,
        index: nextIdx,
        source: entry.url,
        title: getText(entry.row, 'pergunta'),
      };
    });
  }

  // Open questionnaire for filling
  async function handleOpenTemplate(quiz: any, listName?: string) {
    const quizId = getText(quiz, 'id') || 'default';
    setViewServerWhileEditing(false);
    setError('');
    setMessage('');

    if (!draftsRef.current[quizId]) {
      if (!listName?.trim()) {
        setNewListName('');
        setNewListTemplate(quiz);
        return;
      }
      const rawQuestions =
        getArray(quiz, 'questoesDisponiveis').length > 0
          ? getArray(quiz, 'questoesDisponiveis')
          : getArray(quiz, 'questoes');
      if (rawQuestions.length === 0) {
        setError('Este modelo veio sem perguntas. Atualize os dados do servidor.');
        return;
      }
      const questions = [...rawQuestions]
        .sort(
          (a, b) =>
            (parseInt(getText(a, 'ordem'), 10) || 0) -
            (parseInt(getText(b, 'ordem'), 10) || 0)
        )
        .map((q) => ({
          question: q,
          value: '',
          choices: [],
          images: [],
        }));
      const newDraft: DetailDraft = {
        template: quiz,
        protocol: listName.trim(),
        questions,
        state: 'pending',
        savedAt: new Date().toLocaleTimeString('pt-BR'),
      };

      try {
        const device = await getClientDevice();
        const { answerPayload } = buildNewDetailAnswer(
          rdo,
          session,
          device,
          newDraft,
          { allowIncomplete: true }
        );
        const created = await saveRdoDetailMultipartAsync(session, answerPayload, []);
        setNewListTemplate(null);
        setEditingQuizId(null);
        setMessage(`Questionário "${newDraft.protocol}" criado e salvo no servidor.`);
        await loadFromServer();
        const createdKey =
          getText(created, 'id') || getText(created, 'protocolo') || newDraft.protocol;
        if (createdKey) {
          setExpandedSavedIds((prev) => ({ ...prev, [createdKey]: true }));
        }
        return;
      } catch (err: any) {
        const next = { ...draftsRef.current, [quizId]: newDraft };
        if (!await persistLocalState(next)) return;
        setDraftsByQuizId(next);
        setError(
          err?.message
            ? `Não foi possível salvar imediatamente no servidor (${err.message}). Rascunho aberto no aparelho.`
            : 'Não foi possível salvar imediatamente no servidor. Rascunho aberto no aparelho.'
        );
      }
    }
    setNewListTemplate(null);
    setEditingQuizId(quizId);
  }

  async function updateActiveDraftQuestion(
    qIdx: number,
    updater: (item: QuestionDraftItem) => QuestionDraftItem
  ) {
    if (!editingQuizId || !activeDraft) return;
    const updatedQuestions = activeDraft.questions.map((q, idx) => (idx === qIdx ? updater(q) : q));
    const updatedDraft: DetailDraft = {
      ...activeDraft,
      questions: updatedQuestions,
      savedAt: new Date().toLocaleTimeString('pt-BR'),
    };
    const next = { ...draftsRef.current, [editingQuizId]: updatedDraft };
    setDraftsByQuizId(next);
    await persistLocalState(next);
  }

  async function handleAddDraftPhotos(qIdx: number, fromCamera: boolean) {
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permissão necessária', 'Permita o acesso à câmera.');
          return;
        }
        const res = await ImagePicker.launchCameraAsync({ mediaTypes:['images'], quality: 0.8 });
        if (!res.canceled && res.assets?.length) {
          const asset = res.assets[0];
          await updateActiveDraftQuestion(qIdx, (item) => ({
            ...item,
            images: [
              ...item.images,
              { id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, uri: asset.uri, mimeType:asset.mimeType },
            ],
          }));
        }
      } else {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Permissão necessária', 'Permita o acesso à galeria.');
          return;
        }
        const res = await ImagePicker.launchImageLibraryAsync({
          mediaTypes:['images'],
          allowsMultipleSelection: true,
          quality: 0.8,
        });
        if (!res.canceled && res.assets?.length) {
          const newImgs = res.assets.map((a, idx) => ({
            id: `img_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            uri: a.uri,
            mimeType:a.mimeType ?? undefined,
          }));
          await updateActiveDraftQuestion(qIdx, (item) => ({
            ...item,
            images: [...item.images, ...newImgs],
          }));
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível adicionar a foto.');
    }
  }

  async function handleLocateDraftQuestion(qIdx: number) {
    try {
      setBusy(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        throw new Error('Permissão de localização negada.');
      }
      const loc = await Location.getCurrentPositionAsync({});
      const val = `${loc.coords.latitude}/${loc.coords.longitude}`;
      await updateActiveDraftQuestion(qIdx, (item) => ({ ...item, value: val }));
      setMessage('Localização capturada com sucesso.');
    } catch (err: any) {
      setError(err?.message || 'Não foi possível obter a localização.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSendNewDetail() {
    if (!activeDraft || !editingQuizId || busy || sendingRef.current) return;
    if (activeDraft.state==='unknown' || activeDraft.state==='sending') { setError('O envio anterior não foi confirmado. Consulte os dados do servidor antes de tentar novamente.'); return; }
    sendingRef.current=true;
    let attempted=false;
    setBusy(true);
    setError('');
    try {
      const device = await getClientDevice();
      const { answerPayload, uploadFiles } = buildNewDetailAnswer(
        rdo,
        session,
        device,
        activeDraft
      );
      const sending={...draftsRef.current,[editingQuizId]:{...activeDraft,state:'sending' as const}};
      setDraftsByQuizId(sending);
      if (!await persistLocalState(sending)) { setDraftsByQuizId({...draftsRef.current,[editingQuizId]:activeDraft}); throw new Error('Não foi possível guardar o estado do envio. Tente novamente após liberar espaço.'); }
      attempted=true;
      await saveRdoDetailMultipartAsync(session, answerPayload, uploadFiles);

      const next = { ...draftsRef.current };
      delete next[editingQuizId];
      setDraftsByQuizId(next);
      await persistLocalState(next);

      setConfirmSendNewModal(false);
      setEditingQuizId(null);
      setMessage('Detalhamento confirmado pelo servidor.');
      await loadFromServer();
    } catch (err: any) {
      setConfirmSendNewModal(false);
      if (attempted) {
        const next={...draftsRef.current,[editingQuizId]:{...activeDraft,state:err instanceof ApiError && err.rejected ? 'pending' as const : 'unknown' as const}};
        setDraftsByQuizId(next); await persistLocalState(next);
      }
      setError(err?.message || 'Não foi possível enviar o detalhamento. Consulte o servidor antes de reenviar.');
    } finally {
      sendingRef.current=false;
      setBusy(false);
    }
  }

  // Saved Answer Edit handlers
  async function handleConfirmSavedAnswerEdit() {
    if (!answerEditModal || busy) return;
    setBusy(true);
    setError('');
    try {
      await updateSavedAnswerOnServerAsync(
        session,
        answerEditModal.answer,
        answerEditModal.row,
        answerEditModal.value,
        answerEditModal.selectedOptionId
      );
      setAnswerEditModal(null);
      setMessage('O servidor confirmou a alteração da resposta existente.');
      await loadFromServer();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível salvar a alteração da resposta.');
    } finally {
      setBusy(false);
    }
  }

  // Saved Signature Edit handlers
  async function handleConfirmSavedSignatureEdit() {
    if (!signatureEditModal || busy) return;
    setBusy(true);
    setError('');
    try {
      const device = await getClientDevice();
      const updatedPayload = buildSavedSignatureAnswer(
        rdo,
        signatureEditModal.answer,
        signatureEditModal.row,
        signatureEditModal.pngDataUrl,
        session,
        device
      );
      await saveRdoDetailMultipartAsync(session, updatedPayload, []);
      setSignatureEditModal(null);
      setMessage('Assinatura confirmada na consulta ao servidor.');
      await loadFromServer();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir a alteração da assinatura.');
    } finally {
      setBusy(false);
    }
  }

  // Saved Photo Edit handlers (Add / Delete on saved questionnaire)
  async function handlePickSavedPhotosToAdd() {
    if (!photoEditModal || busy) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permissão necessária', 'Permita o acesso à galeria.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes:['images'],
          allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!res.canceled && res.assets?.length) {
        const added = res.assets.map((a, idx) => {
          const format=photoFormat(a.uri,a.mimeType ?? undefined);
          return {
            id: `saved_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            uri: a.uri,
            type: format.type,
            ext: format.ext,
          };
        });
        setPhotoEditModal((prev) =>
          prev ? { ...prev, localPhotos: [...prev.localPhotos, ...added] } : null
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Não foi possível selecionar as imagens.');
    }
  }

  async function handleConfirmSavedPhotoChange() {
    if (!photoEditModal || busy) return;
    setBusy(true);
    setError('');
    try {
      const device = await getClientDevice();
      const files =
        photoEditModal.operation === 'Incluir'
          ? photoEditModal.localPhotos.map((p) => ({
              name: `${p.id}.${p.ext}`,
              uri: p.uri,
              type: p.type,
            }))
          : [];

      const updatedPayload = buildSavedPhotoAnswer(
        rdo,
        photoEditModal.answer,
        photoEditModal.row,
        photoEditModal.operation,
        photoEditModal.serverPhotoId,
        files.map((f) => f.name),
        session,
        device
      );

      await saveRdoDetailMultipartAsync(session, updatedPayload, files);
      const op = photoEditModal.operation;
      setPhotoEditModal(null);
      setViewerState((prev) => ({ ...prev, visible: false }));
      setMessage(
        op === 'Excluir'
          ? 'A consulta confirmou a exclusão desta foto do servidor.'
          : 'A consulta confirmou a inclusão das fotos no detalhamento.'
      );
      await loadFromServer();
    } catch (err: any) {
      setError(err?.message || 'Não foi possível concluir a alteração das fotos.');
    } finally {
      setBusy(false);
    }
  }

  const draftTotalPhotos = activeDraft
    ? activeDraft.questions
        .filter((q) => questionType(q.question) === 'Foto')
        .reduce((sum, q) => sum + q.images.length, 0)
    : 0;

  function getDraftPhotoStart(targetIdx: number): number {
    if (!activeDraft) return 1;
    let count = 1;
    for (let i = 0; i < targetIdx; i++) {
      const q = activeDraft.questions[i];
      if (questionType(q.question) === 'Foto') {
        count += q.images.length;
      }
    }
    return count;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* App Bar */}
      <View style={styles.appBar}>
        <TouchableOpacity
          onPress={() => {
            if (editingQuizId && !viewServerWhileEditing) {
              setEditingQuizId(null);
            } else {
              onBack();
            }
          }}
          style={styles.backBtn}
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.icon} />
        </TouchableOpacity>
        <View style={styles.appBarTitleBox}>
          <Text style={styles.appBarTitle}>Detalhamento do RDO</Text>
          <Text style={styles.appBarSubtitle}>
            RDO #{rdo.number} · Projeto {rdo.project}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, (busy || refreshing) && styles.btnDisabled]}
          onPress={handleRefreshFromServer}
          disabled={busy || refreshing}
        >
          {busy || refreshing ? (
            <ActivityIndicator size="small" color={colors.primarySoftText} />
          ) : (
            <>
              <MaterialIcons name="sync" size={18} color={colors.primarySoftText} />
              <Text style={styles.refreshBtnText}>Puxar dados</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Top helper notice */}
        <View style={styles.refreshNoticeBox}>
          <MaterialIcons name="cloud-download" size={16} color={colors.primarySoftText} />
          <Text style={styles.refreshNoticeText}>
            Respostas, fotos e assinaturas sincronizadas com o servidor.
          </Text>
        </View>

        {/* Error & Status Banners */}
        {error.length > 0 && (
          <View style={styles.errorBanner}>
            <MaterialIcons name="error-outline" size={20} color={colors.danger} />
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        )}
        {message.length > 0 && (
          <View style={styles.infoBanner}>
            <MaterialIcons name="check-circle-outline" size={20} color={colors.primarySoftText} />
            <Text style={styles.infoBannerText}>{message}</Text>
          </View>
        )}

        {/* Diagnostic Accordion */}
        {diagnostic.length > 0 && (
          <View style={styles.diagnosticCard}>
            <TouchableOpacity
              style={styles.diagnosticHeader}
              onPress={() => setShowDiagnostic(!showDiagnostic)}
            >
              <Text style={styles.diagnosticTitle}>Diagnóstico da consulta</Text>
              <MaterialIcons
                name={showDiagnostic ? 'expand-less' : 'expand-more'}
                size={20}
                color={colors.textSecondary}
              />
            </TouchableOpacity>
            {showDiagnostic && <Text style={styles.diagnosticPre}>{diagnostic}</Text>}
          </View>
        )}

        {/* Equipment Audit Panel */}
        {!activeDraft ? (
          doneList.map((saved, sIdx) => (
            <EquipmentAuditPanel
              key={`audit-saved-${sIdx}`}
              rows={getArray(saved, 'respostas')}
            />
          ))
        ) : (
          <EquipmentAuditPanel
            rows={activeDraft.questions.map((q) => ({
              ...q.question,
              resposta: q.value,
            }))}
          />
        )}

        {/* VIEW 1: Saved Details on Server + Available Templates */}
        {!activeDraft ? (
          <>
            {loaded && (
              <Text style={styles.loadedStatusText}>
                {cached ? 'Cópia local da última consulta' : 'Consulta ao servidor concluída'} ·{' '}
                {doneList.length} detalhamento(s) salvo(s)
                {loadedAt ? ` · ${loadedAt}` : ''}
              </Text>
            )}

            <Text style={styles.sectionHeading}>Detalhamentos salvos no servidor</Text>

            {loaded && doneList.length === 0 && (
              <View style={styles.emptyCard}>
                <MaterialIcons name="assignment-late" size={36} color={colors.borderStrong} />
                <Text style={styles.emptyCardText}>
                  Nenhum detalhamento salvo foi retornado por esta consulta para o RDO #{rdo.number}
                  , projeto {rdo.project}.
                </Text>
              </View>
            )}

            {doneList.map((answer, aIdx) => {
              const answerKey =
                getText(answer, 'id') || getText(answer, 'protocolo') || String(aIdx);
              const isExpanded = Boolean(expandedSavedIds[answerKey]);
              const allRows = [...getArray(answer, 'respostas')].sort(
                (a, b) =>
                  (parseInt(getText(a, 'ordem'), 10) || 0) -
                  (parseInt(getText(b, 'ordem'), 10) || 0)
              );
              const signatureRows = allRows.filter(isSignatureQuestion);
              const totalPhotos = getSavedPhotoTotal(answer);

              return (
                <View key={answerKey} style={styles.savedDetailCard}>
                  <Text style={styles.savedCardTitle}>{getText(answer, 'titulo')}</Text>
                  <Text style={styles.savedCardProtocol}>
                    Protocolo: {getText(answer, 'protocolo')}
                  </Text>

                  {/* Signatures Section */}
                  {signatureRows.length > 0 && (
                    <View style={styles.signaturesSection}>
                      <Text style={styles.subHeading}>Assinaturas deste detalhamento</Text>
                      {signatureRows.map((sigRow, sigIdx) => {
                        const sigSrc = signatureImageSource(getText(sigRow, 'resposta'));
                        return (
                          <View
                            key={getText(sigRow, 'id') || String(sigIdx)}
                            style={styles.signatureCard}
                          >
                            <Text style={styles.questionTitle}>
                              {getText(sigRow, 'pergunta')}
                            </Text>
                            {sigSrc ? (
                              <TouchableOpacity
                                style={styles.signaturePreviewBox}
                                onPress={() =>
                                  setViewerState({
                                    visible: true,
                                    source: sigSrc,
                                    title: getText(sigRow, 'pergunta'),
                                    gallery: [],
                                    index: -1,
                                  })
                                }
                              >
                                <Image
                                  source={{ uri: sigSrc }}
                                  style={styles.signatureImage}
                                  resizeMode="contain"
                                />
                              </TouchableOpacity>
                            ) : (
                              <Text style={styles.mutedText}>
                                {getText(sigRow, 'resposta').length === 0
                                  ? 'Assinatura ainda não preenchida.'
                                  : 'Assinatura informada pelo servidor.'}
                              </Text>
                            )}

                            {rdo.status !== 'Cancelado' && (
                              <TouchableOpacity
                                style={styles.secondaryActionBtn}
                                onPress={() =>
                                  setSignatureEditModal({
                                    visible: true,
                                    answer,
                                    row: sigRow,
                                    pngDataUrl: '',
                                    review: false,
                                  })
                                }
                              >
                                <MaterialIcons name="draw" size={16} color={colors.textSecondary} />
                                <Text style={styles.secondaryActionBtnText}>
                                  {getText(sigRow, 'resposta').length > 0
                                    ? 'Alterar assinatura salva…'
                                    : 'Preencher assinatura…'}
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Green Bar: Respostas e fotos salvas / Abrir detalhamento */}
                  <TouchableOpacity
                    style={styles.greenSummaryBar}
                    activeOpacity={0.85}
                    onPress={() =>
                      setExpandedSavedIds((prev) => ({
                        ...prev,
                        [answerKey]: !prev[answerKey],
                      }))
                    }
                  >
                    <View style={styles.greenBarTopRow}>
                      <Text style={styles.greenBarTitle}>📋 Respostas e fotos salvas</Text>
                      <Text style={styles.greenBarAction}>
                        {isExpanded ? 'Recolher ▲' : 'Abrir detalhamento →'}
                      </Text>
                    </View>
                    <Text style={styles.greenBarCounts}>
                      {allRows.length} respostas · {totalPhotos} fotos · {signatureRows.length}{' '}
                      campos de assinatura
                    </Text>
                  </TouchableOpacity>

                  {/* Expanded Questions List */}
                  {isExpanded && (
                    <View style={styles.questionsListContainer}>
                      {allRows.map((row, rIdx) => {
                        const qType = questionType(row);
                        const rowPhotos = getArray(row, 'multi').filter(
                          (p) => getText(p, 'urlfoto').length > 0
                        );
                        const startNum = qType === 'Foto' ? getSavedPhotoStart(answer, row) : 1;

                        return (
                          <View
                            key={getText(row, 'id') || String(rIdx)}
                            style={styles.savedQuestionBlock}
                          >
                            <Text style={styles.questionTitle}>{getText(row, 'pergunta')}</Text>
                            <Text style={styles.answerValueText}>{detailAnswerText(row)}</Text>

                            {/* Edit Saved Answer */}
                            {canEditSavedAnswer(row) && rdo.status !== 'Cancelado' && (
                              <TouchableOpacity
                                style={styles.secondaryActionBtn}
                                onPress={() =>
                                  setAnswerEditModal({
                                    visible: true,
                                    answer,
                                    row,
                                    value: getText(row, 'resposta'),
                                    review: false,
                                  })
                                }
                              >
                                <MaterialIcons
                                  name={
                                    isScannerOrSerialQuestion(getText(row, 'pergunta'), qType)
                                      ? 'qr-code-scanner'
                                      : qType === 'UnicaEscolha'
                                      ? 'tune'
                                      : 'edit'
                                  }
                                  size={16}
                                  color={colors.textSecondary}
                                />
                                <Text style={styles.secondaryActionBtnText}>
                                  {isScannerOrSerialQuestion(getText(row, 'pergunta'), qType)
                                    ? 'Alterar seriais / Escanear…'
                                    : qType === 'UnicaEscolha'
                                    ? 'Alterar opção selecionada…'
                                    : 'Editar resposta salva'}
                                </Text>
                              </TouchableOpacity>
                            )}

                            {/* Saved Photos Grid & Actions */}
                            {qType === 'Foto' && (
                              <View style={styles.savedPhotoSection}>
                                <View style={styles.photoGrid}>
                                  {rowPhotos.map((photo, pIdx) => {
                                    const src = detailImageSource(getText(photo, 'urlfoto'));
                                    const photoNum = startNum + pIdx;
                                    return (
                                      <View
                                        key={getText(photo, 'id') || String(pIdx)}
                                        style={styles.photoCard}
                                      >
                                        <Text style={styles.photoCaption}>
                                          Foto {photoNum} de {totalPhotos}
                                        </Text>
                                        {src ? (
                                          <TouchableOpacity
                                            onPress={() =>
                                              openSavedPhotoInGallery(answer, row, photo)
                                            }
                                          >
                                            <Image
                                              source={{ uri: src }}
                                              style={styles.photoThumb}
                                              resizeMode="cover"
                                            />
                                          </TouchableOpacity>
                                        ) : (
                                          <View style={styles.photoUnavailable}>
                                            <Text style={styles.mutedText}>Indisponível</Text>
                                          </View>
                                        )}

                                        {rdo.status !== 'Cancelado' && (
                                          <TouchableOpacity
                                            style={styles.deleteSmallBtn}
                                            onPress={() =>
                                              setPhotoEditModal({
                                                visible: true,
                                                operation: 'Excluir',
                                                answer,
                                                row,
                                                serverPhotoId: getText(photo, 'id'),
                                                localPhotos: [],
                                              })
                                            }
                                          >
                                            <Text style={styles.deleteSmallBtnText}>
                                              Excluir do servidor…
                                            </Text>
                                          </TouchableOpacity>
                                        )}
                                      </View>
                                    );
                                  })}
                                </View>

                                {rdo.status !== 'Cancelado' && (
                                  <TouchableOpacity
                                    style={styles.secondaryActionBtn}
                                    onPress={() =>
                                      setPhotoEditModal({
                                        visible: true,
                                        operation: 'Incluir',
                                        answer,
                                        row,
                                        serverPhotoId: '',
                                        localPhotos: [],
                                      })
                                    }
                                  >
                                    <MaterialIcons
                                      name="add-photo-alternate"
                                      size={18}
                                      color={colors.textSecondary}
                                    />
                                    <Text style={styles.secondaryActionBtnText}>
                                      Adicionar fotos ao detalhamento salvo
                                    </Text>
                                  </TouchableOpacity>
                                )}
                              </View>
                            )}

                            {isSignatureQuestion(row) && (
                              <Text style={styles.mutedHint}>
                                Veja ou preencha esta assinatura no quadro de assinaturas acima.
                              </Text>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}

            {/* Available templates remain visible even when a previous list is saved. */}
            {!activeDraft && !closed && templates.length > 0 && (
              <>
                <Text style={styles.sectionHeading}>Adicionar questionário</Text>
                {templates.map((quiz, tIdx) => {
                  const quizId = getText(quiz, 'id') || String(tIdx);
                  const hasLocalDraft = Boolean(draftsByQuizId[quizId]);

                  return (
                    <View key={quizId} style={styles.templateCard}>
                      <Text style={styles.templateTitle}>{getText(quiz, 'titulo')}</Text>
                      <Text style={styles.templateDesc}>
                        Questionário disponível para preenchimento neste RDO.
                      </Text>
                      {!closed && (
                        <TouchableOpacity
                          style={styles.primaryBtn}
                          onPress={() => handleOpenTemplate(quiz)}
                          disabled={busy}
                        >
                          <MaterialIcons name="edit-note" size={20} color="#FFF" />
                          <Text style={styles.primaryBtnText}>
                            {hasLocalDraft
                              ? 'Continuar preenchimento'
                              : 'Adicionar lista'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </>
            )}
          </>
        ) : (
          /* VIEW 2: Active Draft Questionnaire Editor */
          <View style={styles.editorContainer}>
            <Text style={styles.editorQuizTitle}>
              {getText(activeDraft.template, 'titulo')}
            </Text>
            <Text style={styles.templateDesc}>Lista: {activeDraft.protocol} · Rascunho neste aparelho</Text>

            {activeDraft.questions.map((item, qIdx) => {
              const q = item.question;
              const type = questionType(q);
              const req = isRequiredQuestion(q);
              const options = resolveQuestionOptions(q, templates);
              const startPhotoNum = type === 'Foto' ? getDraftPhotoStart(qIdx) : 1;

              return (
                <View key={getText(q, 'id') || String(qIdx)} style={styles.editorQuestionCard}>
                  <Text style={styles.questionTitle}>
                    {getText(q, 'pergunta')} {req ? <Text style={styles.reqStar}>*</Text> : null}
                  </Text>

                  {type === 'UnicaEscolha' ? (
                    <View style={styles.choicesGroup}>
                      {options.length > 6 && (
                        <TextInput
                          style={styles.optionFilterInput}
                          placeholder="Buscar opção…"
                          placeholderTextColor={colors.placeholder}
                          value={optionFilterText}
                          onChangeText={setOptionFilterText}
                        />
                      )}
                      {options
                        .filter((opt) =>
                          !optionFilterText.trim()
                            ? true
                            : getText(opt, 'resposta')
                                .toLowerCase()
                                .includes(optionFilterText.toLowerCase())
                        )
                        .map((opt, oIdx) => {
                          const optId = getText(opt, 'id') || getText(opt, 'resposta');
                          const optText = getText(opt, 'resposta');
                          const selected =
                            item.value === optId ||
                            item.value.trim().toUpperCase() === optText.trim().toUpperCase();
                          return (
                            <TouchableOpacity
                              key={optId || String(oIdx)}
                              style={[styles.choiceItem, selected && styles.choiceItemSelected]}
                              onPress={() =>
                                updateActiveDraftQuestion(qIdx, (prev) => ({
                                  ...prev,
                                  value: selected ? '' : optText,
                                }))
                              }
                            >
                              <MaterialIcons
                                name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                                size={20}
                                color={selected ? colors.primarySoftText : colors.placeholder}
                              />
                              <Text
                                style={[
                                  styles.choiceText,
                                  selected && styles.choiceTextSelected,
                                ]}
                              >
                                {optText}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      <TextInput
                        style={[styles.singleInput, { marginTop: 8 }]}
                        placeholder="Ou digite o valor personalizado"
                        placeholderTextColor={colors.placeholder}
                        value={
                          options.some(
                            (o) =>
                              getText(o, 'resposta').trim().toUpperCase() ===
                              item.value.trim().toUpperCase()
                          )
                            ? ''
                            : item.value
                        }
                        onChangeText={(txt) =>
                          updateActiveDraftQuestion(qIdx, (prev) => ({ ...prev, value: txt }))
                        }
                      />
                    </View>
                  ) : type === 'MultiplaEscolha' ? (
                    <View style={styles.choicesGroup}>
                      {options.map((opt, oIdx) => {
                        const optId = getText(opt, 'id');
                        const checked = item.choices.includes(optId);
                        return (
                          <TouchableOpacity
                            key={optId || String(oIdx)}
                            style={[styles.choiceItem, checked && styles.choiceItemSelected]}
                            onPress={() =>
                              updateActiveDraftQuestion(qIdx, (prev) => {
                                const nextChoices = checked
                                  ? prev.choices.filter((c) => c !== optId)
                                  : [...prev.choices, optId];
                                return { ...prev, choices: nextChoices };
                              })
                            }
                          >
                            <MaterialIcons
                              name={checked ? 'check-box' : 'check-box-outline-blank'}
                              size={20}
                              color={checked ? colors.primarySoftText : colors.placeholder}
                            />
                            <Text
                              style={[styles.choiceText, checked && styles.choiceTextSelected]}
                            >
                              {getText(opt, 'resposta')}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : type === 'Assinatura' || type === 'AssinaturaCliente' ? (
                    <View>
                      <SignaturePad
                        disabled={busy}
                        onSaved={(pngDataUrl) =>
                          updateActiveDraftQuestion(qIdx, (prev) => ({
                            ...prev,
                            value: pngDataUrl,
                            images: [{ id: `sig_${Date.now()}`, uri: pngDataUrl, base64: pngDataUrl }],
                          }))
                        }
                        onCleared={() =>
                          updateActiveDraftQuestion(qIdx, (prev) => ({
                            ...prev,
                            value: '',
                            images: [],
                          }))
                        }
                      />
                      {item.value.length > 0 && (
                        <View style={styles.signaturePreviewBox}>
                          <Image
                            source={{ uri: item.value }}
                            style={styles.signatureImage}
                            resizeMode="contain"
                          />
                          <Text style={styles.savedSignatureCaption}>
                            Assinatura capturada.
                          </Text>
                        </View>
                      )}
                    </View>
                  ) : type === 'Foto' ? (
                    <View>
                      <View style={styles.photoPickerButtonsRow}>
                        <TouchableOpacity
                          style={styles.secondaryActionBtn}
                          onPress={() => handleAddDraftPhotos(qIdx, true)}
                        >
                          <MaterialIcons name="photo-camera" size={18} color={colors.textSecondary} />
                          <Text style={styles.secondaryActionBtnText}>Capturar foto</Text>
                        </TouchableOpacity>

                        {getBool(q, 'liberaGaleria') && (
                          <TouchableOpacity
                            style={styles.secondaryActionBtn}
                            onPress={() => handleAddDraftPhotos(qIdx, false)}
                          >
                            <MaterialIcons name="photo-library" size={18} color={colors.textSecondary} />
                            <Text style={styles.secondaryActionBtnText}>Várias da galeria</Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <Text style={styles.mutedText}>
                        {item.images.length} foto(s) adicionada(s) nesta pergunta.
                      </Text>

                      <View style={styles.photoGrid}>
                        {item.images.map((img, iIdx) => (
                          <View key={img.id} style={styles.photoCard}>
                            <Text style={styles.photoCaption}>
                              Foto {startPhotoNum + iIdx} de {draftTotalPhotos}
                            </Text>
                            <TouchableOpacity
                              onPress={() =>
                                setViewerState({
                                  visible: true,
                                  source: img.uri,
                                  title: `Foto ${startPhotoNum + iIdx} de ${draftTotalPhotos}`,
                                  gallery: [],
                                  index: -1,
                                })
                              }
                            >
                              <Image source={{ uri: img.uri }} style={styles.photoThumb} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.deleteSmallBtn}
                              onPress={() =>
                                updateActiveDraftQuestion(qIdx, (prev) => ({
                                  ...prev,
                                  images: prev.images.filter((p) => p.id !== img.id),
                                }))
                              }
                            >
                              <Text style={styles.deleteSmallBtnText}>Remover foto</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : type === 'Geolocalizacao' ? (
                    <View style={styles.geoRow}>
                      <TouchableOpacity
                        style={styles.secondaryActionBtn}
                        onPress={() => handleLocateDraftQuestion(qIdx)}
                      >
                        <MaterialIcons name="my-location" size={18} color={colors.textSecondary} />
                        <Text style={styles.secondaryActionBtnText}>Obter localização</Text>
                      </TouchableOpacity>
                      <Text style={styles.geoValueText}>
                        {item.value || 'Coordenada ainda não capturada'}
                      </Text>
                    </View>
                  ) : type === 'CodBarra' || isScannerOrSerialQuestion(getText(q, 'pergunta'), type) ? (
                    <View style={styles.serialInputContainer}>
                      <TouchableOpacity
                        style={styles.barcodeScanBtn}
                        onPress={() =>
                          setScannerModal({
                            visible: true,
                            title: getText(q, 'pergunta'),
                            target: 'draft',
                            qIdx,
                          })
                        }
                      >
                        <MaterialIcons name="qr-code-scanner" size={20} color="#FFF" />
                        <Text style={styles.barcodeScanBtnText}>
                          Escanear código de barras com a câmera
                        </Text>
                      </TouchableOpacity>

                      <TextInput
                        style={styles.multilineInput}
                        multiline
                        numberOfLines={4}
                        placeholder="Digite os seriais ou use o scanner da câmera acima (um por linha ou com ;)"
                        placeholderTextColor={colors.placeholder}
                        value={item.value}
                        onChangeText={(txt) =>
                          updateActiveDraftQuestion(qIdx, (prev) => ({ ...prev, value: txt }))
                        }
                        textAlignVertical="top"
                        autoCapitalize="characters"
                      />

                      {item.value.trim().length > 0 && (
                        <View style={styles.serialHelperRow}>
                          <Text style={styles.serialHelperCount}>
                            {item.value.split(/[\r\n;]+/).filter(Boolean).length} serial(is) informado(s)
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              updateActiveDraftQuestion(qIdx, (prev) => ({ ...prev, value: '' }))
                            }
                          >
                            <Text style={styles.serialClearText}>Limpar seriais</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ) : (
                    <TextInput
                      style={styles.singleInput}
                      placeholder={
                        type === 'Data'
                          ? 'dd/mm/aaaa'
                          : type === 'Valor'
                          ? 'Informe o valor numérico'
                          : 'Digite sua resposta'
                      }
                      placeholderTextColor={colors.placeholder}
                      keyboardType={type === 'Valor' ? 'numeric' : 'default'}
                      value={item.value}
                      onChangeText={(txt) =>
                        updateActiveDraftQuestion(qIdx, (prev) => ({ ...prev, value: txt }))
                      }
                    />
                  )}
                </View>
              );
            })}

            <View style={styles.editorFooterActions}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => setConfirmSendNewModal(true)}
                disabled={busy}
              >
                <MaterialIcons name="cloud-upload" size={20} color="#FFF" />
                <Text style={styles.primaryBtnText}>Enviar detalhamento para o servidor…</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtnLarge}
                onPress={() => setEditingQuizId(null)}
                disabled={busy}
              >
                <Text style={styles.secondaryBtnLargeText}>Voltar aos detalhamentos</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* MODAL 1: Confirm New Detail Submission */}
      <Modal
        visible={confirmSendNewModal}
        transparent
        animationType="slide"
        onRequestClose={() => setConfirmSendNewModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>Enviar detalhamento para o servidor</Text>
            <Text style={styles.modalSubtitle}>
              RDO #{rdo.number} · Projeto {rdo.project} ·{' '}
              {activeDraft ? getText(activeDraft.template, 'titulo') : ''}
            </Text>
            <Text style={styles.modalBodyText}>
              As respostas, imagens e assinaturas deste questionário serão enviadas ao servidor
              original.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleSendNewDetail}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.primaryBtnText}>Enviar agora para o servidor</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtnLarge}
              onPress={() => setConfirmSendNewModal(false)}
              disabled={busy}
            >
              <Text style={styles.secondaryBtnLargeText}>Continuar preenchendo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(newListTemplate)} transparent animationType="slide"
        onRequestClose={() => { if (!creatingListRef.current) setNewListTemplate(null); }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <Text style={styles.modalTitle}>{getText(newListTemplate, 'titulo')}</Text>
            <Text style={styles.questionTitle}>Nome do questionário</Text>
            <TextInput value={newListName} onChangeText={setNewListName}
              placeholder="Digite o nome da lista" placeholderTextColor={colors.textSecondary}
              style={{ color: colors.text, borderWidth: 1, borderColor: colors.textSecondary, borderRadius: 8, padding: 12 }} />
            <Text style={styles.templateDesc}>Ao criar, o questionário será salvo imediatamente no servidor para preenchimento.</Text>
            <TouchableOpacity style={styles.primaryBtn} disabled={busy || !newListName.trim()}
              onPress={async () => {
                if (creatingListRef.current || !newListTemplate || !newListName.trim()) return;
                creatingListRef.current = true;
                setBusy(true);
                try { await handleOpenTemplate(newListTemplate, newListName); }
                finally { creatingListRef.current = false; setBusy(false); }
              }}>
              <Text style={styles.primaryBtnText}>{busy ? 'Salvando no servidor…' : 'Criar e salvar no servidor'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtnLarge} disabled={busy} onPress={() => setNewListTemplate(null)}>
              <Text style={styles.secondaryBtnLargeText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Saved Answer Editor (Texto / Valor) */}
      <Modal
        visible={Boolean(answerEditModal?.visible)}
        transparent
        animationType="slide"
        onRequestClose={() => setAnswerEditModal(null)}
      >
        <View style={styles.modalBackdrop}>
          {answerEditModal && (
            <View style={styles.modalPanel}>
              <Text style={styles.modalTitle}>
                {answerEditModal.review
                  ? 'Revisar alteração no servidor'
                  : 'Editar resposta salva'}
              </Text>
              <Text style={styles.modalSubtitle}>
                RDO #{rdo.number} · Projeto {rdo.project} · Conta: {session.login}
              </Text>
              <Text style={styles.questionTitle}>
                {getText(answerEditModal.row, 'pergunta')}
              </Text>

              <View style={styles.comparisonBox}>
                <Text style={styles.comparisonLabel}>Valor atual consultado:</Text>
                <Text style={styles.comparisonValue}>
                  {getText(answerEditModal.row, 'resposta') || '(vazio)'}
                </Text>
              </View>

              {answerEditModal.review ? (
                <View style={styles.comparisonBox}>
                  <Text style={styles.comparisonLabel}>Novo valor:</Text>
                  <Text style={styles.comparisonValue}>{answerEditModal.value}</Text>
                </View>
              ) : isScannerOrSerialQuestion(
                  getText(answerEditModal.row, 'pergunta'),
                  questionType(answerEditModal.row)
                ) ? (
                <View style={styles.serialInputContainer}>
                  <TouchableOpacity
                    style={styles.barcodeScanBtn}
                    onPress={() =>
                      setScannerModal({
                        visible: true,
                        title: getText(answerEditModal.row, 'pergunta'),
                        target: 'saved',
                      })
                    }
                  >
                    <MaterialIcons name="qr-code-scanner" size={20} color="#FFF" />
                    <Text style={styles.barcodeScanBtnText}>
                      Escanear código de barras com a câmera
                    </Text>
                  </TouchableOpacity>

                  <TextInput
                    style={styles.multilineInput}
                    multiline
                    numberOfLines={4}
                    placeholder="Edite os seriais ou leia novos com a câmera acima"
                    placeholderTextColor={colors.placeholder}
                    value={answerEditModal.value}
                    onChangeText={(txt) =>
                      setAnswerEditModal((prev) => (prev ? { ...prev, value: txt } : null))
                    }
                    textAlignVertical="top"
                    autoCapitalize="characters"
                  />

                  {answerEditModal.value.trim().length > 0 && (
                    <View style={styles.serialHelperRow}>
                      <Text style={styles.serialHelperCount}>
                        {answerEditModal.value.split(/[\r\n;]+/).filter(Boolean).length} serial(is) informado(s)
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setAnswerEditModal((prev) => (prev ? { ...prev, value: '' } : null))
                        }
                      >
                        <Text style={styles.serialClearText}>Limpar seriais</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              ) : questionType(answerEditModal.row) === 'UnicaEscolha' ? (
                <View style={styles.savedOptionChoices}>
                  <Text style={styles.fieldLabel}>Selecione a opção desejada:</Text>
                  {resolveQuestionOptions(answerEditModal.row, templates).length > 6 && (
                    <TextInput
                      style={styles.optionFilterInput}
                      placeholder="Filtrar opções…"
                      placeholderTextColor={colors.placeholder}
                      value={optionFilterText}
                      onChangeText={setOptionFilterText}
                    />
                  )}
                  <ScrollView style={{ maxHeight: 200 }}>
                    {resolveQuestionOptions(answerEditModal.row, templates)
                      .filter((opt) =>
                        !optionFilterText.trim()
                          ? true
                          : getText(opt, 'resposta')
                              .toLowerCase()
                              .includes(optionFilterText.toLowerCase())
                      )
                      .map((opt, oIdx) => {
                        const optText = getText(opt, 'resposta');
                        const optId = opt.id;
                        const selected =
                          answerEditModal.value.trim().toUpperCase() ===
                          optText.trim().toUpperCase();
                        return (
                          <TouchableOpacity
                            key={optId || String(oIdx)}
                            style={[styles.choiceItem, selected && styles.choiceItemSelected]}
                            onPress={() =>
                              setAnswerEditModal((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      value: optText,
                                      selectedOptionId: optId ?? null,
                                    }
                                  : null
                              )
                            }
                          >
                            <MaterialIcons
                              name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                              size={20}
                              color={selected ? colors.primarySoftText : colors.placeholder}
                            />
                            <Text
                              style={[
                                styles.choiceText,
                                selected && styles.choiceTextSelected,
                              ]}
                            >
                              {optText}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                  <Text style={[styles.fieldLabel, { marginTop: 10 }]}>
                    Ou digite um valor personalizado:
                  </Text>
                  <TextInput
                    style={styles.singleInput}
                    placeholder="Digite o valor personalizado"
                    placeholderTextColor={colors.placeholder}
                    value={answerEditModal.value}
                    onChangeText={(txt) =>
                      setAnswerEditModal((prev) => (prev ? { ...prev, value: txt } : null))
                    }
                  />
                </View>
              ) : (
                <TextInput
                  style={styles.multilineInput}
                  multiline
                  numberOfLines={4}
                  value={answerEditModal.value}
                  onChangeText={(txt) =>
                    setAnswerEditModal((prev) => (prev ? { ...prev, value: txt } : null))
                  }
                  textAlignVertical="top"
                />
              )}

              {answerEditModal.review ? (
                <>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleConfirmSavedAnswerEdit}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Confirmar alteração no servidor</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryBtnLarge}
                    onPress={() =>
                      setAnswerEditModal((prev) => (prev ? { ...prev, review: false } : null))
                    }
                    disabled={busy}
                  >
                    <Text style={styles.secondaryBtnLargeText}>Voltar à edição</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    answerEditModal.value === getText(answerEditModal.row, 'resposta') &&
                      styles.btnDisabled,
                  ]}
                  onPress={() =>
                    setAnswerEditModal((prev) => (prev ? { ...prev, review: true } : null))
                  }
                  disabled={
                    busy || answerEditModal.value === getText(answerEditModal.row, 'resposta')
                  }
                >
                  <Text style={styles.primaryBtnText}>Revisar alteração…</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.secondaryBtnLarge}
                onPress={() => setAnswerEditModal(null)}
                disabled={busy}
              >
                <Text style={styles.secondaryBtnLargeText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* MODAL 3: Saved Signature Editor */}
      <Modal
        visible={Boolean(signatureEditModal?.visible)}
        transparent
        animationType="slide"
        onRequestClose={() => setSignatureEditModal(null)}
      >
        <View style={styles.modalBackdrop}>
          {signatureEditModal && (
            <View style={styles.modalPanel}>
              <Text style={styles.modalTitle}>
                {getText(signatureEditModal.row, 'pergunta')}
              </Text>
              <Text style={styles.modalSubtitle}>
                RDO #{rdo.number} · Projeto {rdo.project}
              </Text>

              {!signatureEditModal.review && (
                <SignaturePad
                  disabled={busy}
                  onSaved={(pngDataUrl) =>
                    setSignatureEditModal((prev) =>
                      prev ? { ...prev, pngDataUrl } : null
                    )
                  }
                  onCleared={() =>
                    setSignatureEditModal((prev) =>
                      prev ? { ...prev, pngDataUrl: '', review: false } : null
                    )
                  }
                />
              )}

              {signatureEditModal.pngDataUrl.length > 0 && (
                <View style={styles.signaturePreviewBox}>
                  <Text style={styles.comparisonLabel}>Nova assinatura capturada:</Text>
                  <Image
                    source={{ uri: signatureEditModal.pngDataUrl }}
                    style={styles.signatureImage}
                    resizeMode="contain"
                  />
                </View>
              )}

              {signatureEditModal.review ? (
                <>
                  <Text style={styles.modalBodyText}>
                    A confirmação substitui apenas esta assinatura no detalhamento existente.
                  </Text>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleConfirmSavedSignatureEdit}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.primaryBtnText}>
                        Confirmar e enviar assinatura ao servidor
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryBtnLarge}
                    onPress={() =>
                      setSignatureEditModal((prev) =>
                        prev ? { ...prev, review: false } : null
                      )
                    }
                    disabled={busy}
                  >
                    <Text style={styles.secondaryBtnLargeText}>Voltar à assinatura</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    !signatureEditModal.pngDataUrl && styles.btnDisabled,
                  ]}
                  onPress={() =>
                    setSignatureEditModal((prev) =>
                      prev ? { ...prev, review: true } : null
                    )
                  }
                  disabled={busy || !signatureEditModal.pngDataUrl}
                >
                  <Text style={styles.primaryBtnText}>Revisar envio da assinatura</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.secondaryBtnLarge}
                onPress={() => setSignatureEditModal(null)}
                disabled={busy}
              >
                <Text style={styles.secondaryBtnLargeText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* MODAL 4: Saved Photo Editor (Incluir / Excluir) */}
      <Modal
        visible={Boolean(photoEditModal?.visible)}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoEditModal(null)}
      >
        <View style={styles.modalBackdrop}>
          {photoEditModal && (
            <View style={styles.modalPanel}>
              <Text style={styles.modalTitle}>
                {photoEditModal.operation === 'Excluir'
                  ? 'Excluir foto do servidor'
                  : 'Adicionar fotos ao detalhamento salvo'}
              </Text>
              <Text style={styles.modalSubtitle}>
                RDO #{rdo.number} · Projeto {rdo.project} · Conta: {session.login}
              </Text>
              <Text style={styles.questionTitle}>{getText(photoEditModal.row, 'pergunta')}</Text>

              {error.length > 0 && (
                <View style={styles.errorBanner}>
                  <MaterialIcons name="error-outline" size={18} color={colors.danger} />
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
              )}

              {photoEditModal.operation === 'Excluir' ? (
                <Text style={styles.modalBodyText}>
                  A confirmação exclui somente a foto selecionada deste detalhamento no servidor. O
                  status do RDO não será alterado.
                </Text>
              ) : (
                <View>
                  <TouchableOpacity
                    style={styles.secondaryActionBtn}
                    onPress={handlePickSavedPhotosToAdd}
                    disabled={busy}
                  >
                    <MaterialIcons name="photo-library" size={18} color={colors.textSecondary} />
                    <Text style={styles.secondaryActionBtnText}>Selecionar várias imagens</Text>
                  </TouchableOpacity>

                  <View style={styles.photoGrid}>
                    {photoEditModal.localPhotos.map((p, idx) => (
                      <View key={p.id} style={styles.photoCard}>
                        <Text style={styles.photoCaption}>
                          Foto {idx + 1} de {photoEditModal.localPhotos.length}
                        </Text>
                        <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                        <TouchableOpacity
                          style={styles.deleteSmallBtn}
                          onPress={() =>
                            setPhotoEditModal((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    localPhotos: prev.localPhotos.filter((item) => item.id !== p.id),
                                  }
                                : null
                            )
                          }
                        >
                          <Text style={styles.deleteSmallBtnText}>Remover</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  (busy ||
                    (photoEditModal.operation === 'Incluir' &&
                      photoEditModal.localPhotos.length === 0)) &&
                    styles.btnDisabled,
                ]}
                onPress={handleConfirmSavedPhotoChange}
                disabled={
                  busy ||
                  (photoEditModal.operation === 'Incluir' &&
                    photoEditModal.localPhotos.length === 0)
                }
              >
                {busy ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {photoEditModal.operation === 'Excluir'
                      ? 'Confirmar exclusão desta foto'
                      : 'Confirmar e enviar as fotos selecionadas'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtnLarge}
                onPress={() => setPhotoEditModal(null)}
                disabled={busy}
              >
                <Text style={styles.secondaryBtnLargeText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* MODAL 5: Fullscreen Photo Viewer with Gallery Navigation & Server Delete */}
      <PhotoViewerModal
        visible={viewerState.visible}
        source={viewerState.source}
        title={viewerState.title}
        count={viewerState.gallery.length}
        index={viewerState.index}
        canDelete={
          viewerState.index >= 0 &&
          rdo.status !== 'Cancelado' &&
          getText(viewerState.gallery[viewerState.index]?.photo, 'id').length > 0
        }
        actionsDisabled={busy}
        actionError={error}
        onPrevious={() => moveGallery(-1)}
        onNext={() => moveGallery(1)}
        onDelete={() => {
          if (viewerState.index < 0) return;
          const entry = viewerState.gallery[viewerState.index];
          setViewerState((prev) => ({ ...prev, visible: false }));
          setPhotoEditModal({
            visible: true,
            operation: 'Excluir',
            answer: entry.answer,
            row: entry.row,
            serverPhotoId: getText(entry.photo, 'id'),
            localPhotos: [],
          });
        }}
        onClose={() => setViewerState((prev) => ({ ...prev, visible: false }))}
      />

      {/* MODAL 6: Camera Barcode Scanner */}
      <BarcodeScannerModal
        visible={Boolean(scannerModal?.visible)}
        title={scannerModal?.title || 'Escanear código de barras / serial'}
        onScanned={(serial) => {
          if (!scannerModal) return;
          if (scannerModal.target === 'draft' && scannerModal.qIdx !== undefined) {
            const qIdx = scannerModal.qIdx;
            updateActiveDraftQuestion(qIdx, (prev) => {
              const current = prev.value.trim();
              const nextVal = current.length > 0 ? `${current}\n${serial}` : serial;
              return { ...prev, value: nextVal };
            });
            setMessage(`Serial ${serial} injetado no detalhamento.`);
          } else if (scannerModal.target === 'saved') {
            setAnswerEditModal((prev) => {
              if (!prev) return null;
              const current = prev.value.trim();
              const nextVal = current.length > 0 ? `${current}\n${serial}` : serial;
              return { ...prev, value: nextVal };
            });
            setMessage(`Serial ${serial} adicionado para alteração.`);
          }
          setScannerModal(null);
        }}
        onClose={() => setScannerModal(null)}
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
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2F7',
  },
  backBtn: {
    padding: 6,
    marginRight: 8,
  },
  appBarTitleBox: {
    flex: 1,
  },
  appBarTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  appBarSubtitle: {
    fontSize: 12,
    color: '#718096',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  refreshBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#08776F',
    marginLeft: 4,
  },
  content: {
    padding: 14,
    paddingBottom: 50,
  },
  refreshNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF2F7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  refreshNoticeText: {
    fontSize: 12,
    color: '#4A5568',
    marginLeft: 8,
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEB2B2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorBannerText: {
    color: '#C53030',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F4F1',
    borderWidth: 1,
    borderColor: '#81E6D9',
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  infoBannerText: {
    color: '#08776F',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  diagnosticCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  diagnosticHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diagnosticTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#4A5568',
  },
  diagnosticPre: {
    fontSize: 11,
    color: '#2D3748',
    fontFamily: 'monospace',
    marginTop: 8,
    backgroundColor: '#F7FAFC',
    padding: 8,
    borderRadius: 6,
  },
  draftStateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF8FF',
    borderWidth: 1,
    borderColor: '#90CDF4',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  draftStateTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2B6CB0',
  },
  draftStateSub: {
    fontSize: 11,
    color: '#4299E1',
  },
  draftToggleBtn: {
    backgroundColor: '#2B6CB0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  draftToggleBtnText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  loadedStatusText: {
    fontSize: 12,
    color: '#718096',
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A202C',
    marginTop: 6,
    marginBottom: 10,
  },
  emptyCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyCardText: {
    fontSize: 13,
    color: '#718096',
    textAlign: 'center',
    marginTop: 8,
  },
  savedDetailCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  savedCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  savedCardProtocol: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
    marginBottom: 12,
  },
  signaturesSection: {
    marginBottom: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EDF2F7',
  },
  subHeading: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 8,
  },
  signatureCard: {
    backgroundColor: '#F7FAFC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  signaturePreviewBox: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 8,
    padding: 8,
    marginVertical: 8,
    alignItems: 'center',
  },
  signatureImage: {
    width: '100%',
    height: 90,
  },
  savedSignatureCaption: {
    fontSize: 11,
    color: '#08776F',
    marginTop: 4,
    fontWeight: '600',
  },
  greenSummaryBar: {
    backgroundColor: '#08776F',
    borderRadius: 10,
    padding: 14,
    marginTop: 4,
  },
  greenBarTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greenBarTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  greenBarAction: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  greenBarCounts: {
    color: '#E6FFFA',
    fontSize: 12,
    marginTop: 4,
  },
  questionsListContainer: {
    marginTop: 12,
    gap: 10,
  },
  savedQuestionBlock: {
    backgroundColor: '#F7FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EDF2F7',
  },
  questionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 4,
  },
  reqStar: {
    color: '#E53E3E',
  },
  answerValueText: {
    fontSize: 13,
    color: '#2D3748',
    marginBottom: 8,
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#EDF2F7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  secondaryActionBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2D3748',
    marginLeft: 6,
  },
  savedPhotoSection: {
    marginTop: 6,
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 8,
  },
  photoCard: {
    width: '47%',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  photoCaption: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#4A5568',
    marginBottom: 4,
  },
  photoThumb: {
    width: '100%',
    height: 110,
    borderRadius: 6,
    backgroundColor: '#EDF2F7',
  },
  photoUnavailable: {
    width: '100%',
    height: 110,
    borderRadius: 6,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteSmallBtn: {
    marginTop: 6,
    backgroundColor: '#FFF5F5',
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FEB2B2',
  },
  deleteSmallBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#C53030',
  },
  mutedText: {
    fontSize: 12,
    color: '#718096',
  },
  mutedHint: {
    fontSize: 11,
    color: '#718096',
    fontStyle: 'italic',
  },
  templateCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  templateTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  templateDesc: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: '#08776F',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 6,
  },
  primaryBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  secondaryBtnLarge: {
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 8,
  },
  secondaryBtnLargeText: {
    color: '#2D3748',
    fontSize: 14,
    fontWeight: '600',
  },
  editorContainer: {
    marginTop: 4,
  },
  editorQuizTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1A202C',
    marginBottom: 12,
  },
  editorQuestionCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  choicesGroup: {
    gap: 6,
    marginTop: 6,
  },
  choiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  choiceItemSelected: {
    backgroundColor: '#E6F4F1',
    borderColor: '#08776F',
  },
  choiceText: {
    fontSize: 13,
    color: '#2D3748',
    marginLeft: 8,
    flex: 1,
  },
  choiceTextSelected: {
    color: '#08776F',
    fontWeight: 'bold',
  },
  photoPickerButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  geoRow: {
    marginTop: 4,
    gap: 6,
  },
  geoValueText: {
    fontSize: 12,
    color: '#08776F',
    fontWeight: '600',
  },
  singleInput: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
    color: '#1A202C',
    marginTop: 6,
  },
  multilineInput: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 8,
    padding: 10,
    minHeight: 90,
    fontSize: 13,
    color: '#1A202C',
    marginTop: 6,
  },
  editorFooterActions: {
    marginTop: 12,
    marginBottom: 24,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 16,
  },
  modalPanel: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1A202C',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
    marginBottom: 10,
  },
  modalBodyText: {
    fontSize: 13,
    color: '#4A5568',
    marginVertical: 10,
  },
  comparisonBox: {
    backgroundColor: '#F7FAFC',
    padding: 10,
    borderRadius: 8,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  comparisonLabel: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#718096',
  },
  comparisonValue: {
    fontSize: 13,
    color: '#1A202C',
    marginTop: 2,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  serialInputContainer: {
    gap: 8,
  },
  barcodeScanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#08776F',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    gap: 8,
    marginBottom: 4,
  },
  barcodeScanBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  serialHelperRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  serialHelperCount: {
    fontSize: 12,
    color: '#08776F',
    fontWeight: '600',
  },
  serialClearText: {
    fontSize: 12,
    color: '#E53E3E',
    fontWeight: '600',
  },
  optionFilterInput: {
    borderWidth: 1,
    borderColor: '#CBD5E0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#2D3748',
    marginBottom: 6,
    backgroundColor: '#F7FAFC',
  },
  savedOptionChoices: {
    marginVertical: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A5568',
    marginBottom: 6,
  },
});

import { CONFIG } from '../constants/config';
import { ClientDevice, LoginSession, RdoSummary } from '../types';
import { ApiError, buildVersionedUri, sendAuthenticatedAsync, handleResponse } from './apiClient';
import { createFormDataFilePart, UploadFileItem } from './fileUpload';

const QUESTION_TYPES = [
  'Texto',
  'Valor',
  'Data',
  'Foto',
  'UnicaEscolha',
  'MultiplaEscolha',
  'Assinatura',
  'CodBarra',
  'AssinaturaCliente',
  'Geolocalizacao',
];

export function getText(obj: any, key: string): string {
  if (!obj || typeof obj !== 'object') return '';
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === key.toLowerCase()) {
      const val = obj[k];
      return val !== null && val !== undefined ? String(val) : '';
    }
  }
  return '';
}

export function getField(obj: any, key: string): any {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === key.toLowerCase()) {
      return obj[k];
    }
  }
  return undefined;
}

export function getBool(obj: any, key: string): boolean {
  const val = getField(obj, key);
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') return val.toLowerCase() === 'true';
  return false;
}

export function getArray(obj: any, key: string): any[] {
  const val = getField(obj, key);
  return Array.isArray(val) ? val : [];
}

export function questionType(question: any): string {
  const raw = getText(question, 'tipo');
  const num = parseInt(raw, 10);
  if (!!Number.isFinite(num) && num >= 0 && num < QUESTION_TYPES.length && String(num) === raw.trim()) {
    return QUESTION_TYPES[num];
  }
  return raw;
}

export function questionTypeCode(typeName: string): string {
  const idx = QUESTION_TYPES.indexOf(typeName);
  if (idx >= 0) return String(idx);
  const num = parseInt(typeName, 10);
  if (!!Number.isFinite(num) && num >= 0 && num < QUESTION_TYPES.length) return String(num);
  throw new Error(`Tipo de pergunta desconhecido: ${typeName}`);
}

export function isRequiredQuestion(question: any): boolean {
  return getText(question, 'obrigatoria').toUpperCase().startsWith('S');
}

export function isSignatureQuestion(row: any): boolean {
  const t = questionType(row);
  return t === 'Assinatura' || t === 'AssinaturaCliente';
}

export function detailAnswerText(row: any): string {
  const t = questionType(row);
  if (t === 'Assinatura' || t === 'AssinaturaCliente') {
    return getText(row, 'resposta').length > 0 ? 'Assinatura registrada' : 'Sem assinatura';
  }
  if (t === 'Foto') {
    const photos = getArray(row, 'multi').filter((p) => getText(p, 'urlfoto').length > 0);
    return `${photos.length} foto(s) registrada(s)`;
  }
  const value = getText(row, 'resposta');
  const multi = getArray(row, 'multi')
    .map((m) => getText(m, 'resposta'))
    .filter((v) => v.length > 0);
  if (multi.length > 0) return multi.join('; ');
  return value.length > 0 ? value : 'Sem resposta';
}

export function detailImageSource(value: string, baseUrl: string = CONFIG.BASE_URL): string | null {
  if (!value || !value.trim() || value.length > 2048) return null;
  const trimmed = value.trim();
  try {
    if (trimmed.startsWith('https://')) return trimmed;
    if (trimmed.startsWith('http://')) {
      return trimmed.replace(/^http:\/\//i, 'https://');
    }
    const base = baseUrl.replace(/\/+$/, '');
    const rel = trimmed.replace(/^\/+/, '');
    return `${base}/${rel}`;
  } catch {
    return null;
  }
}

export function signatureImageSource(value: string, baseUrl: string = CONFIG.BASE_URL): string | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return detailImageSource(trimmed, baseUrl);
  }
  if (/^data:image\/(png|jpeg|webp);base64,/i.test(trimmed)) {
    return trimmed;
  }
  // Base64 PNG starts with iVBORw0KGgo, JPEG starts with /9j/, WEBP starts with UklGR
  if (trimmed.startsWith('iVBORw0KGgo')) {
    return `data:image/png;base64,${trimmed}`;
  }
  if (trimmed.startsWith('/9j/')) {
    return `data:image/jpeg;base64,${trimmed}`;
  }
  if (trimmed.startsWith('UklGR')) {
    return `data:image/webp;base64,${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return detailImageSource(trimmed, baseUrl);
  }
  return `data:image/png;base64,${trimmed}`;
}

export function extractRawPngBase64(dataUrlOrBase64: string): string {
  const trimmed = (dataUrlOrBase64 || '').trim();
  if (!trimmed) throw new Error('Desenhe uma assinatura válida antes de continuar.');
  if (trimmed.startsWith('data:image/png;base64,')) {
    return trimmed.split(',')[1] || '';
  }
  return trimmed;
}

export function buildDetailQuery(session: LoginSession, rdo: RdoSummary): any {
  const project = getField(rdo.raw, 'projetoAniel') || {};
  const rawType = getText(rdo.raw, 'codTipoServico');
  const codTipoServ = parseInt(rawType, 10) || 0;
  const codSubTipoServ = getField(rdo.raw, 'codTipoProducao') ?? null;
  const codct = getText(project, 'codCt') || rdo.contract;
  const proj = getText(project, 'projeto') || rdo.project;
  const numObra = getField(rdo.raw, 'evento') ?? null;
  const tarefa = getField(rdo.raw, 'tarefa') ?? null;

  return {
    login: session.login,
    senha: session.password,
    codTipoServ,
    codSubTipoServ,
    codct,
    projeto: proj,
    numObra,
    tarefa,
    siglaModulo: 'MCO',
  };
}

export function buildDetailDiagnostic(rdo: RdoSummary, response: any): string {
  const project = getField(rdo.raw, 'projetoAniel') || {};
  const show = (v: any) => (v !== undefined && v !== null && String(v).length > 0 ? String(v) : '(ausente)');
  const shape = (key: string) => {
    const f = getField(response, key);
    return Array.isArray(f) ? `Array, ${f.length} registro(s)` : typeof f;
  };
  const type = parseInt(getText(rdo.raw, 'codTipoServico'), 10) || 0;
  return [
    'Diagnóstico da consulta de detalhamento MCO',
    `RDO exibido: ${rdo.number}`,
    `Contrato consultado: ${show(getText(project, 'codCt') || rdo.contract)}`,
    `Projeto consultado: ${show(getText(project, 'projeto') || rdo.project)}`,
    `Evento / numObra: ${show(getField(rdo.raw, 'evento'))}`,
    `Tarefa: ${show(getField(rdo.raw, 'tarefa'))}`,
    `Tipo de serviço: ${type}`,
    `Subtipo: ${show(getField(rdo.raw, 'codTipoProducao'))}`,
    `Modelos / questionarios: ${shape('questionarios')}`,
    `Salvos / questionariosFeitos: ${shape('questionariosFeitos')}`,
  ].join('\n');
}

export async function fetchRdoDetailFullAsync(
  session: LoginSession,
  rdo: RdoSummary
): Promise<{ data: any; diagnostic: string }> {
  const query = buildDetailQuery(session, rdo);
  const data = await sendAuthenticatedAsync('AnielTV.Touch.WebApi/api/Quiz/Quiz', query, session);
  const diagnostic = buildDetailDiagnostic(rdo, data);
  if (!data || typeof data !== 'object' || !Array.isArray(getField(data, 'questionariosFeitos'))) {
    throw new ApiError(
      'O servidor retornou um formato de detalhamento inesperado. Atualize os dados e tente novamente.'
    );
  }
  return { data, diagnostic };
}

export function canEditSavedAnswer(row: any): boolean {
  const t = questionType(row);
  const id = parseInt(getText(row, 'id'), 10);
  return (t === 'Texto' || t === 'Valor') && !isNaN(id) && id > 0;
}

function getReportEndpointUri(action: 'CompararSenha' | 'AtualizarResposta'): string {
  const base = CONFIG.BASE_URL.replace(/\/+$/, '');
  const suffix = '/Mobile/Touch';
  if (base.toLowerCase().endsWith(suffix.toLowerCase())) {
    const root = base.substring(0, base.length - suffix.length);
    return `${root}/Servicos/Aniel.Relatorios/api/QuizApi/${action}`;
  }
  return `${base}/Servicos/Aniel.Relatorios/api/QuizApi/${action}`;
}

function flattenForJQueryAjax(
  prefix: string,
  value: any,
  fields: { key: string; value: string }[]
) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of Object.keys(value)) {
      flattenForJQueryAjax(`${prefix}[${k}]`, value[k], fields);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const isComplex = item !== null && typeof item === 'object';
      flattenForJQueryAjax(`${prefix}[${isComplex ? index : ''}]`, item, fields);
    });
    return;
  }
  const strVal =
    value === null || value === undefined
      ? ''
      : typeof value === 'boolean'
      ? value
        ? 'true'
        : 'false'
      : String(value);
  fields.push({ key: prefix, value: strVal });
}

export async function updateSavedAnswerOnServerAsync(
  session: LoginSession,
  questionnaire: any,
  row: any,
  newValue: string
): Promise<void> {
  if (!canEditSavedAnswer(row)) {
    throw new Error('Esta resposta não está disponível para edição.');
  }
  if (isRequiredQuestion(row) && !newValue.trim()) {
    throw new Error('Esta pergunta é obrigatória.');
  }
  const t = questionType(row);
  if (t === 'Valor' && isNaN(Number(newValue.trim().replace(',', '.')))) {
    throw new Error('Informe um valor numérico válido.');
  }

  // 1. Validate password on Report API
  const validateUrl = getReportEndpointUri('CompararSenha');
  const valRes = await fetch(validateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      senhaDigitada: session.password,
      usuario: session.login,
    }),
  });
  if (!valRes.ok) {
    throw new Error('Não foi possível validar a conta no serviço de relatórios.');
  }
  const valJson = await valRes.json();
  if (getField(valJson, 'result') !== true || getField(valJson, 'valor') !== true) {
    throw new Error('A conta de edição não foi validada pelo servidor.');
  }

  // 2. Build form-urlencoded payload
  const fields: { key: string; value: string }[] = [
    { key: 'IdQuizAnswerItem', value: getText(row, 'id') },
    { key: 'TipoQuestao', value: t === 'Texto' ? '0' : '1' },
    { key: 'Resposta', value: newValue },
    { key: 'ValorAnterior', value: getText(row, 'resposta') },
    { key: 'Usuario', value: session.login },
  ];
  flattenForJQueryAjax('Questionario', questionnaire, fields);

  const formBody = fields
    .map((f) => `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`)
    .join('&');

  const updateUrl = getReportEndpointUri('AtualizarResposta');
  const upRes = await fetch(updateUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: formBody,
  });

  if (!upRes.ok) {
    throw new Error('O resultado da alteração não foi confirmado pelo servidor.');
  }
  const upJson = await upRes.json();
  if (getField(upJson, 'result') === false) {
    throw new Error('O servidor recusou a alteração desta resposta.');
  }
  if (getField(upJson, 'result') !== true) {
    throw new Error('O resultado da alteração não foi confirmado.');
  }
}

function normalizeQuizAnswerForSave(
  answer: any,
  responses: any[],
  session: LoginSession,
  device: ClientDevice
): any {
  const updated: any = { ...answer, respostas: responses };
  if (updated.idQuizTarefa === null || updated.idQuizTarefa === undefined) {
    updated.idQuizTarefa = 0;
  }
  for (const flag of [
    'update',
    'enviando',
    'isRepeticao',
    'obrigarImprodutivo',
    'deInicioAtendimento',
    'isExcluido',
    'isEmPreenchimento',
  ]) {
    if (updated[flag] === null || updated[flag] === undefined) {
      updated[flag] = false;
    }
  }
  updated.novo = false;
  updated.local = true;
  updated.usuario = session.login;
  updated.equipe = session.team;
  updated.imei = device.id;
  return updated;
}

export function buildSavedSignatureAnswer(
  rdo: RdoSummary,
  answer: any,
  row: any,
  pngData: string,
  session: LoginSession,
  device: ClientDevice
): any {
  const rawPng = extractRawPngBase64(pngData);
  const rows = getArray(answer, 'respostas');
  const targetId = getText(row, 'id');
  if (!targetId || !rows.some(r => getText(r,'id')===targetId)) throw new Error('A pergunta não pertence a este detalhamento. Atualize os dados.');

  const responses = rows.map((r) => {
    const isTarget = getText(r, 'id') === targetId;
    const copy: any = {
      ...r,
      alteracao: isTarget,
      tipo: questionTypeCode(questionType(r)),
      multi: Array.isArray(r.multi) ? r.multi : [],
      liberaGaleria: Boolean(r.liberaGaleria),
      exibirRVT: Boolean(r.exibirRVT),
    };
    if (isTarget) {
      copy.resposta = rawPng;
    }
    return copy;
  });

  return normalizeQuizAnswerForSave(answer, responses, session, device);
}

export function buildSavedPhotoAnswer(
  rdo: RdoSummary,
  answer: any,
  row: any,
  operation: 'Incluir' | 'Excluir',
  serverPhotoId: string,
  uploadFileNames: string[],
  session: LoginSession,
  device: ClientDevice
): any {
  const rows = getArray(answer, 'respostas');
  const targetId = getText(row, 'id');
  if (!targetId || !rows.some(r => getText(r,'id')===targetId)) throw new Error('A pergunta não pertence a este detalhamento. Atualize os dados.');
  const currentMulti = [...getArray(row, 'multi')];
  const currentExcluded = [...getArray(row, 'idsFotoExclusao').map((v) => String(v))];

  if (operation === 'Incluir') {
    for (const fileName of uploadFileNames) {
      currentMulti.push({ urlfoto: fileName });
    }
  } else if (operation === 'Excluir') {
    const photo = currentMulti.find((p) => getText(p, 'id') === serverPhotoId);
    if (!photo) {
      throw new Error('A foto selecionada não pertence à pergunta atual do servidor.');
    }
    const originalUrl = getText(photo, 'urlfoto');
    const filtered = currentMulti.filter((p) => getText(p, 'id') !== serverPhotoId);
    currentMulti.length = 0;
    currentMulti.push(...filtered);
    if (originalUrl && !currentExcluded.includes(originalUrl)) {
      currentExcluded.push(originalUrl);
    }
  }

  const responses = rows.map((r) => {
    const isTarget = getText(r, 'id') === targetId;
    const copy: any = {
      ...r,
      alteracao: isTarget,
      tipo: questionTypeCode(questionType(r)),
      multi: isTarget ? currentMulti : Array.isArray(r.multi) ? r.multi : [],
      idsFotoExclusao: isTarget
        ? currentExcluded
        : Array.isArray(r.idsFotoExclusao)
        ? r.idsFotoExclusao
        : [],
      liberaGaleria: Boolean(r.liberaGaleria),
      exibirRVT: Boolean(r.exibirRVT),
    };
    return copy;
  });

  return normalizeQuizAnswerForSave(answer, responses, session, device);
}

export function photoFormat(uri: string,mimeType?: string): {type:string;ext:string} {
  const type=mimeType || (/\.png(?:[?#]|$)/i.test(uri)?'image/png':/\.webp(?:[?#]|$)/i.test(uri)?'image/webp':/\.jpe?g(?:[?#]|$)/i.test(uri)?'image/jpeg':'');
  const ext=({'image/png':'png','image/jpeg':'jpg','image/webp':'webp'} as Record<string,string>)[type];
  if (!ext) throw new Error('Selecione uma foto JPEG, PNG ou WebP.');
  return {type,ext};
}

export interface QuestionDraftItem {
  question: any;
  value: string;
  choices: string[];
  images: { id: string; uri: string; base64?: string; mimeType?: string }[];
}

export interface DetailDraft {
  template: any;
  protocol: string;
  questions: QuestionDraftItem[];
  state: 'pending' | 'sending' | 'sent' | 'unknown';
  savedAt?: string;
}

export function buildNewDetailAnswer(
  rdo: RdoSummary,
  session: LoginSession,
  device: ClientDevice,
  draft: DetailDraft
): { answerPayload: any; uploadFiles: { name: string; uri: string; type: string }[] } {
  const answers: any[] = [];
  const uploadFiles: { name: string; uri: string; type: string }[] = [];

  for (const item of draft.questions) {
    const q = item.question;
    const type = questionType(q);
    let response: string | null = null;
    let selected: number | null = null;
    const multi: any[] = [];
    const choices = getArray(q, 'respostasPossiveis');

    if (type === 'UnicaEscolha' && item.value.length > 0) {
      const option = choices.find((o) => getText(o, 'id') === item.value);
      if (!option) {
        throw new Error(`Opção inválida em ${getText(q, 'pergunta')}`);
      }
      selected = parseInt(item.value, 10);
      response = getText(option, 'resposta');
    } else if (type === 'MultiplaEscolha') {
      for (const id of item.choices) {
        const option = choices.find((o) => getText(o, 'id') === id);
        if (!option) throw new Error('Opção inválida.');
        multi.push({
          idQuestionAnswer: parseInt(id, 10),
          resposta: getText(option, 'resposta'),
        });
      }
    } else if (type === 'Foto') {
      for (const img of item.images) {
        const format=photoFormat(img.uri,img.mimeType);
        const fileName = `${img.id}.${format.ext}`;
        multi.push({ urlfoto: fileName });
        uploadFiles.push({
          name: fileName,
          uri: img.uri,
          type: format.type,
        });
      }
    } else if (type === 'Assinatura' || type === 'AssinaturaCliente') {
      if (item.images.length > 0 && item.images[0].base64) {
        response = extractRawPngBase64(item.images[0].base64);
      } else if (item.value.trim().length > 0) {
        response = extractRawPngBase64(item.value);
      }
    } else if (type === 'CodBarra') {
      const tokens = item.value
        .split(/[\r\n;]+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (tokens.length > 0) {
        response = tokens.join(';');
      }
    } else if (
      type === 'Texto' ||
      type === 'Valor' ||
      type === 'Data' ||
      type === 'Geolocalizacao'
    ) {
      if (item.value.trim().length > 0) {
        response = item.value.trim();
      }
    }

    if (isRequiredQuestion(q) && response === null && selected === null && multi.length === 0) {
      throw new Error(`Pergunta obrigatória não respondida: ${getText(q, 'pergunta')}`);
    }

    if (type === 'Valor' && item.value.trim().length > 0) {
      const num = Number(item.value.trim().replace(',', '.'));
      if (!Number.isFinite(num)) {
        throw new Error(`Informe um valor numérico em ${getText(q, 'pergunta')}`);
      }
    }

    answers.push({
      idQuestion: getField(q, 'id') ?? null,
      ordem: getField(q, 'ordem') ?? null,
      tipo: questionTypeCode(type),
      pergunta: getText(q, 'pergunta'),
      obrigatoria: getText(q, 'obrigatoria'),
      liberaGaleria: getBool(q, 'liberaGaleria'),
      opcoesResposta: choices,
      idQuestionAnswer: selected,
      resposta: response,
      multi,
      alteracao: true,
      idsFotoExclusao: [],
      idsRespostaMultiplaExclusao: [],
    });
  }

  const answerPayload = {
    idQuiz: getField(draft.template, 'id') ?? null,
    idQuizTarefa: 0,
    titulo: getText(draft.template, 'titulo'),
    protocolo: draft.protocol,
    usuario: session.login,
    equipe: session.team,
    imei: device.id,
    codct: rdo.contract,
    projeto: rdo.project,
    num_obra: getText(rdo.raw, 'evento'),
    tarefa: getText(rdo.raw, 'tarefa'),
    codTipoServico: getField(rdo.raw, 'codTipoServico') ?? null,
    codSubTipoServico: getText(rdo.raw, 'codTipoProducao'),
    local: false,
    update: false,
    novo: true,
    isRepeticao: false,
    obrigarImprodutivo: getBool(draft.template, 'obrigarImprodutivo'),
    deInicioAtendimento: false,
    isEmPreenchimento: false,
    respostas: answers,
    producoes: [],
    materiais: [],
  };

  return { answerPayload, uploadFiles };
}

export async function saveRdoDetailMultipartAsync(
  session: LoginSession,
  answerPayload: any,
  files: UploadFileItem[] = []
): Promise<any> {
  const url = buildVersionedUri('AnielTV.Touch.WebApi/api/Quiz/SetQuiz');
  const envelope = {
    usuario: session.employee,
    senha: session.password,
    token: CONFIG.TOUCH_TOKEN,
    objeto: {
      login: session.login,
      senha: session.password,
      isRepeticao: Boolean(answerPayload.isRepeticao),
      resposta: answerPayload,
    },
  };

  const formData = new FormData();
  formData.append('json', JSON.stringify(envelope));

  for (const file of files) {
    const part = await createFormDataFilePart(file);
    // @ts-ignore
    formData.append(file.name, part);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      culture: 'pt-BR',
    },
    body: formData,
  });

  const result = await handleResponse(response, [session.password, CONFIG.TOUCH_TOKEN]);
  return getField(result, 'valor') ?? result;
}

import { hasPendingDetail } from './storage';
import {
  buildCancelBody,
  buildRemoveAttachmentBody,
  nativeDate,
  nativeDate12h,
  nativeTime12h,
  parseServerDate,
  rdoIdentity,
  statusCode,
  uniqueRdos,
} from './rdoProtocol';
import { CONFIG } from '../constants/config';
import {
  ClientDevice,
  Encerramento,
  LoginSession,
  RdoAttachment,
  RdoSummary,
  ViaCepResult,
} from '../types';

export class ApiError extends Error {
  constructor(message: string, public rejected = false) {
    super(message);
    this.name = 'ApiError';
  }
}

export function buildVersionedUri(route: string): string {
  const base = CONFIG.BASE_URL.replace(/\/+$/, '');
  const cleanRoute = route.replace(/^\/+/, '');
  return `${base}/${CONFIG.API_VERSION}${cleanRoute}`;
}

export async function handleResponse(response: Response, secrets: string[] = []): Promise<any> {
  if (!response.ok) {
    throw new ApiError(`Erro HTTP ${response.status}: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data || typeof data !== 'object' || data.result !== true) {
    let message = typeof data?.message === 'string' ? data.message : '';
    if (!message || message.length > 300 || /[{}<>\r\n]|exception|stack/i.test(message)) message = 'O servidor não confirmou a operação.';
    for (const secret of secrets) if (secret) message = message.split(secret).join('[protegido]');
    throw new ApiError(message, data?.result === false);
  }
  return data;
}

export async function loginAsync(
  username: string,
  password: string,
  device: ClientDevice
): Promise<LoginSession> {
  if (!username.trim() || !password) {
    throw new ApiError('Informe o usuário e a senha do Aniel.');
  }

  const url = buildVersionedUri('AnielTV.Seguranca.WebApi/api/Login/Logon');
  const payload = {
    usuario: username.trim(),
    token: CONFIG.SECURITY_TOKEN,
    objeto: {
      usuario: username.trim(),
      senha: password,
      novo: false,
      token: CONFIG.COMPANY_CODE,
      imei: device.id,
      numero: '',
      operadora: '',
      serial: '',
      deviceInfo: {
        modelo: device.model,
        versaoAndroid: device.platform,
        versaoApp: device.version,
        imei: device.id,
        publicKey: device.id,
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      culture: 'pt-BR',
    },
    body: JSON.stringify(payload),
  });

  const body = await handleResponse(response, [password, CONFIG.SECURITY_TOKEN]);
  const user = body.valor;
  if (!user) {
    throw new ApiError('O servidor confirmou o login sem retornar os dados do usuário.');
  }

  const funcionario = user.funcionario || {};
  const numFre = funcionario.numFre ? String(funcionario.numFre) : '';
  const login = user.login || username.trim();
  const nome = funcionario.nome || login;
  const equipe = funcionario.equipe ? String(funcionario.equipe) : ''; 
  const usesRouting = funcionario.empresa?.usaRoteirizacao === true;

  if (!numFre || !login) {
    throw new ApiError('A identificação do funcionário não foi retornada pelo servidor.');
  }

  return {
    login,
    password,
    employee: numFre,
    name: nome,
    team: equipe,
    usesRouting,
    data: user,
  };
}

export async function sendAuthenticatedAsync(
  route: string,
  bodyObj: any,
  session: LoginSession
): Promise<any> {
  const url = buildVersionedUri(route);
  const payload = {
    usuario: session.employee,
    senha: session.password,
    token: CONFIG.TOUCH_TOKEN,
    objeto: bodyObj,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      culture: 'pt-BR',
    },
    body: JSON.stringify(payload),
  });

  const res = await handleResponse(response, [session.password, CONFIG.TOUCH_TOKEN]);
  return res.valor !== undefined ? res.valor : res;
}

function parseStatusName(raw: string | number): string {
  const s = String(raw);
  switch (s) {
    case '0':
      return 'Aberta';
    case '1':
      return 'FechadaImprodutiva';
    case '2':
      return 'FechadaProdutiva';
    case '3':
      return 'Atendendo';
    case '6':
      return 'Deslocando';
    case '8':
      return 'Atendido';
    case '9':
      return 'Cancelado';
    case '10':
      return 'Pausar';
    case '11':
      return 'Reiniciar';
    case '12':
      return 'InterromperDeslocamento';
    default:
      return s;
  }
}

function formatRawDate(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('/Date(')) {
    const ms = parseInt(raw.substring(6).split(')')[0], 10);
    if (!isNaN(ms)) {
      return new Date(ms).toLocaleDateString('pt-BR');
    }
  }
  return raw;
}

function parseRdoSummary(item: any): RdoSummary {
  const proj = item.projetoAniel || {};
  const end = item.endereco || {};
  const rua = [end.rua, end.numero, end.bairro, end.cidade].filter(Boolean).join(', ');

  return {
    number: String(item.obra || ''),
    contract: String(proj.codCt || item.codCt || ''),
    project: String(proj.projeto || item.proj || ''),
    service: String(item.tipoServico || ''),
    status: parseStatusName(item.statusExecucao),
    date: formatRawDate(item.dtInicial || ''),
    address: rua,
    raw: item,
  };
}

export async function getOpenRdosAsync(session: LoginSession): Promise<RdoSummary[]> {
  if (!session.team) throw new ApiError('Esta conta não possui equipe vinculada para consultar RDOs.');
  const list = await sendAuthenticatedAsync(
    'AnielTV.Touch.WebApi/api/Obra/GetRDOByDate',
    {
      equipe: session.team,
      dataAgendamento: 'Jan 1, 2000 12:00:00 AM',
    },
    session
  );

  if (!Array.isArray(list)) throw new ApiError('O servidor retornou uma lista inválida.');
  return uniqueRdos(list.map(parseRdoSummary));
}

export async function getClosedRdosAsync(
  session: LoginSession,
  startDate: string,
  endDate: string
): Promise<RdoSummary[]> {
  const list = await sendAuthenticatedAsync(
    'AnielTV.Touch.WebApi/api/Obra/GetRDOs',
    {
      login: session.login,
      dataIni: startDate,
      dataFim: endDate,
    },
    session
  );

  if (!Array.isArray(list)) throw new ApiError('O servidor retornou uma lista inválida.');
  return uniqueRdos(list.map(parseRdoSummary));
}

export async function cancelRdoAsync(
  session: LoginSession,
  rdo: RdoSummary,
  observacao: string
): Promise<boolean> {
  const fresh = (await getOpenRdosAsync(session)).filter(x => rdoIdentity(x) === rdoIdentity(rdo));
  if (fresh.length !== 1) throw new ApiError('Atualize a lista: o RDO mudou ou possui dados conflitantes.');
  await sendAuthenticatedAsync('AnielTV.Touch.WebApi/api/Obra/cancelarRDO', buildCancelBody(fresh[0], observacao), session);
  return true;
}

export async function getContractsAsync(session: LoginSession): Promise<any[]> {
  const list = await sendAuthenticatedAsync(
    'AnielTV.Touch.WebApi/api/Contrato/Contratos',
    [session.password, true],
    session
  );
  if (!Array.isArray(list)) throw new ApiError('O servidor retornou uma lista inválida.');
  return list;
}

export async function getRdoAttachmentsAsync(
  session: LoginSession,
  rdo: RdoSummary
): Promise<RdoAttachment[]> {
  const seq = rdo.raw.contrato;
  const list = await sendAuthenticatedAsync(
    'AnielTV.Touch.WebApi/api/Arquivo/CarregarArquivos',
    {
      contrato: seq,
      obra: rdo.number,
      contratoAniel: rdo.contract,
      projetoAniel: rdo.project,
      isRDO: true,
    },
    session
  );
  if (!Array.isArray(list)) throw new ApiError('O servidor retornou uma lista inválida.');
  return list;
}

export async function removeRdoAttachmentAsync(
  session: LoginSession,
  rdo: RdoSummary,
  selected: RdoAttachment
): Promise<void> {
  if (rdo.status === 'Cancelado') {
    throw new ApiError('Este RDO está cancelado.');
  }
  const current = await getRdoAttachmentsAsync(session, rdo);
  const body = buildRemoveAttachmentBody(selected, current);
  await sendAuthenticatedAsync('AnielTV.Touch.WebApi/api/Arquivo/RemoverArquivo', body, session);
}

export async function setRdoStatusAsync(
  session: LoginSession,
  rdo: RdoSummary,
  device: ClientDevice,
  targetStatus: 'Deslocando' | 'Atendendo' | 'Atendido',
  position?: { latitude: number; longitude: number; accuracy?: number | null; altitude?: number | null }
): Promise<RdoSummary | null> {
  const wireStatus = statusCode(targetStatus);
  const baseRaw = rdo.raw || {};
  const document: any =
    targetStatus === 'Deslocando'
      ? { ...baseRaw }
      : { ...baseRaw, statusExecucao: wireStatus };

  if (!document.usuario || typeof document.usuario !== 'object') {
    if (!session.data || typeof session.data !== 'object') {
      throw new ApiError('Entre novamente para recuperar a identificação do usuário.');
    }
    document.usuario = { ...session.data, senha: session.password };
  }

  const now = new Date();
  await sendAuthenticatedAsync(
    'AnielTV.Touch.WebApi/api/AlterarStatusLocalizacaoTecnico/AtualizarStatus',
    {
      documentoProducao: document,
      status: wireStatus,
      data: nativeDate12h(now),
      hora: nativeTime12h(now),
      imei: device.id,
      dispositivo: device.model,
      versaoAPP: device.version,
      versaoAndroid: device.platform,
      logado: 2,
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
      precisao: position?.accuracy ?? null,
      altitude: position?.altitude ?? null,
    },
    session
  );

  // Re-fetch from server so horaInicio and statusExecucao reflect persisted server truth
  try {
    const freshList = uniqueRdos(await getOpenRdosAsync(session));
    const match = freshList.find((x) => rdoIdentity(x) === rdoIdentity(rdo));
    if (match) return match;
  } catch {
    // Non-fatal: mutation already confirmed by server
  }
  return null;
}

export async function getServiceTypesAsync(
  session: LoginSession,
  contractCode: string
): Promise<any[]> {
  if (!contractCode.trim()) return [];
  const list = await sendAuthenticatedAsync(
    'AnielTV.Touch.WebApi/api/TipoServico/getTipoServicobyContrato',
    { contrato: contractCode.trim(), senha: session.password },
    session
  );
  if (!Array.isArray(list)) throw new ApiError('Catálogo de serviços inválido.');
  return list;
}

export async function getServiceSubtypesAsync(
  session: LoginSession,
  serviceId: number | string
): Promise<any[]> {
  const numericId = Number(serviceId);
  if (!Number.isInteger(numericId) || numericId <= 0) return [];
  const list = await sendAuthenticatedAsync(
    'AnielTV.Touch.WebApi/api/TipoServico/getSubTipoServico',
    { tipoServico: numericId, senha: session.password },
    session
  );
  if (!Array.isArray(list)) throw new ApiError('Catálogo de subtipos inválido.');
  return list;
}

export async function getRdoEndingsAsync(
  session: LoginSession,
  rdo: RdoSummary
): Promise<Encerramento[]> {
  const codTipoServ = Number(rdo.raw.codTipoServico);
  if (!Number.isInteger(codTipoServ) || codTipoServ <= 0) throw new ApiError('Atualize o tipo de serviço do RDO.');
  const list = await sendAuthenticatedAsync(
    'AnielTV.Touch.WebApi/api/DocumentoProducao/GetEncerramentoByContrato',
    {
      contrato: rdo.contract,
      codServ: codTipoServ,
    },
    session
  );
  if (!Array.isArray(list)) throw new ApiError('O servidor retornou uma lista inválida.');
  return list;
}

export async function getRdoDetailAsync(
  session: LoginSession,
  rdo: RdoSummary
): Promise<any> {
  const res = await sendAuthenticatedAsync('AnielTV.Touch.WebApi/api/Quiz/Quiz', {
    login:session.login, senha:session.password, codct:rdo.contract, projeto:rdo.project,
    codTipoServ:Number(rdo.raw.codTipoServico), codSubTipoServ:rdo.raw.codTipoProducao ?? null,
    numObra:rdo.raw.evento, tarefa:rdo.raw.tarefa || rdo.number, siglaModulo:'MCO',
  }, session);
  return res;
}

export interface BaixarRdoParams {
  encerramento: Encerramento;
  observacao: string;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  startDate?: Date;
  endDate?: Date;
  listaQuizSerializada?: string;
}

export function isEndingHidden(ending: any): boolean {
  if (!ending) return true;
  if (ending.ocultar === true || ending.ocultar === 1) return true;
  const text = String(ending.ocultar ?? '').trim().toUpperCase();
  return text === 'S' || text === 'TRUE' || text === '1';
}

export async function baixarRdoAsync(
  session: LoginSession,
  rdo: RdoSummary,
  params: BaixarRdoParams
): Promise<boolean> {
  if (await hasPendingDetail(rdo, session)) {
    throw new ApiError('Envie ou resolva o detalhamento pendente neste celular antes da baixa.');
  }
  const fresh = uniqueRdos(
    (await getOpenRdosAsync(session)).filter((x) => rdoIdentity(x) === rdoIdentity(rdo))
  );
  if (fresh.length !== 1) {
    throw new ApiError('Este RDO não está mais disponível nos abertos ou mudou. Atualize a lista antes de baixar.');
  }
  const current = fresh[0];
  const endings = await getRdoEndingsAsync(session, current);
  const selected = endings.filter(
    (e) => String(e.codigo) === String(params.encerramento.codigo) && !isEndingHidden(e)
  );
  if (selected.length !== 1) {
    throw new ApiError('Motivo de encerramento indisponível. Atualize os encerramentos e tente novamente.');
  }
  const endingStatus = String(selected[0].status ?? '');
  if (endingStatus && !['1', '2'].includes(endingStatus)) {
    throw new ApiError('Encerramento selecionado com status inválido no servidor.');
  }

  const attachments = await getRdoAttachmentsAsync(session, current);
  if (!attachments.some(isVideoAttachment)) {
    throw new ApiError('Envie um vídeo ao servidor em Anexos antes de baixar a atividade.');
  }

  const details = await getRdoDetailAsync(session, current);
  if (
    current.raw.exigeCheckList &&
    !details?.questionariosFeitos?.some((q: any) => !q.deInicioAtendimento)
  ) {
    throw new ApiError('Preencha e envie o detalhamento antes de baixar a atividade.');
  }

  if (!session.data || typeof session.data !== 'object') {
    throw new ApiError('Sessão incompleta. Entre novamente antes de baixar a atividade.');
  }

  const endDate =
    params.endDate && Number.isFinite(params.endDate.getTime()) ? params.endDate : new Date();
  const parsedStart =
    params.startDate && Number.isFinite(params.startDate.getTime())
      ? params.startDate
      : parseServerDate(current.raw.horaInicio);
  const startDate =
    parsedStart && parsedStart.getTime() <= endDate.getTime()
      ? parsedStart
      : new Date(endDate.getTime() - 15 * 60 * 1000);

  const lat =
    typeof params.latitude === 'number' && Number.isFinite(params.latitude)
      ? params.latitude
      : typeof current.raw.lat === 'number' && Number.isFinite(current.raw.lat)
      ? current.raw.lat
      : 0;
  const lng =
    typeof params.longitude === 'number' && Number.isFinite(params.longitude)
      ? params.longitude
      : typeof current.raw.longt === 'number' && Number.isFinite(current.raw.longt)
      ? current.raw.longt
      : 0;

  const startStr = nativeDate12h(startDate);
  const endStr = nativeDate12h(endDate);
  const nowStr = nativeDate12h(new Date());
  const actor = { ...session.data, login: session.login, senha: session.password };
  const wire = {
    ...current.raw,
    encerramento: selected[0],
    observacao: params.observacao,
    dataProd: nowStr,
    usuario: actor,
    producoes: Array.isArray(current.raw.producoes) ? current.raw.producoes : [],
    produtos: Array.isArray(current.raw.produtos) ? current.raw.produtos : [],
    horaInicio: startStr,
    horaTermino: endStr,
  };
  const payload: any = {
    rdo: wire,
    usuario: actor,
    encerramento: selected[0],
    horaInicio: startStr,
    horaTermino: endStr,
    dataProd: nowStr,
    obs: params.observacao,
    produtos: wire.produtos,
    fotos: [],
    logs: [],
    latitude: lat,
    longitude: lng,
  };
  for (const key of ['rat', 'lnbf', 'transponder', 'intensidade', 'qualidade', 'ciente', 'parentesco']) {
    if (current.raw[key] != null) payload[key] = current.raw[key];
  }
  await sendAuthenticatedAsync('AnielTV.Touch.WebApi/api/DocumentoProducao/BaixarRDO', payload, session);
  return true;
}

export function isVideoAttachment(file: RdoAttachment): boolean {
  const value = String(file.extensao || file.nomeDocumento || '').toLowerCase().replace(/^\./, '');
  return /^(mp4|mov|m4v|avi|mkv|webm|3gp)$/.test(value) || /\.(mp4|mov|m4v|avi|mkv|webm|3gp)$/.test(value);
}

export interface CreateRdoInput {
  contract: string;
  project: string;
  event: string;
  serviceName: string;
  subtypeName: string;
  serviceId?: string;
  subtypeId?: string;
  obra?: string;
  address: Record<string, string>;
  getPosition?: () => Promise<{ latitude: number; longitude: number; altitude: number | null }>;
}
export async function createRdoAsync(session: LoginSession, input: CreateRdoInput): Promise<RdoSummary> {
  const contracts = await getContractsAsync(session);
  const matches = contracts.filter(c => String(c.codCt) === input.contract.trim());
  if (matches.length !== 1) throw new ApiError('Contrato indisponível para esta conta.');
  const contract = matches[0];
  const projects = (contract.projetos || []).filter((p: any) => String(p.projeto) === input.project.trim());
  if (projects.length !== 1) throw new ApiError('Este projeto/INEP não pertence ao contrato selecionado.');
  if (Number(contract.configBloqueiaCriacao || 0) !== 0) throw new ApiError('A regra de bloqueio deste contrato ainda não é suportada pelo aplicativo.');
  let position: { latitude: number; longitude: number; altitude: number | null } | undefined;
  if (contract.isObrigaGPS === true) {
    if (!input.getPosition) throw new ApiError('Este contrato exige localização real para criar o RDO.');
    position = await input.getPosition();
    if (![position.latitude, position.longitude].every(Number.isFinite)) throw new ApiError('Localização inválida.');
  }
  const services = await getServiceTypesAsync(session, input.contract.trim());
  const normalize = (s: any) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const types = input.serviceId
    ? services.filter((t: any) => String(t.id) === String(input.serviceId))
    : services.filter((t: any) => normalize(t.descricao || t.nome || t.tipoServico) === normalize(input.serviceName));
  if (types.length !== 1 || !/^\d+$/.test(String(types[0].id))) throw new ApiError('Tipo de serviço não identificado no catálogo.');
  const subtypes = await getServiceSubtypesAsync(session, Number(types[0].id));
  let chosenSubId = '';
  if (subtypes.length > 0) {
    const subs = input.subtypeId
      ? subtypes.filter((t: any) => String(t.id) === String(input.subtypeId))
      : subtypes.filter((t: any) => normalize(t.descricao || t.nome || t.tipoServico) === normalize(input.subtypeName));
    if (subs.length !== 1) throw new ApiError('Subtipo não identificado no catálogo.');
    chosenSubId = String(subs[0].id);
  }
  const projectEvents: any[] = Array.isArray(projects[0].eventos) ? projects[0].eventos : [];
  let chosenEvent: any = null;
  if (projectEvents.length > 0) {
    const events = projectEvents.filter((e: any) => String(e.evento) === input.event.trim());
    if (events.length !== 1) throw new ApiError('Evento não disponível neste projeto/INEP.');
    chosenEvent = events[0];
  }
  const isSequential = contract.isRDOSequencial === true;
  if (!isSequential && !input.obra?.trim()) {
    throw new ApiError('Informe o número do RDO para este contrato.');
  }
  if (Number(contract.modeloContrato) > 0) {
    const allRules = await sendAuthenticatedAsync('AnielTV.Touch.WebApi/api/Contrato/GetModeloContratos', 'obras_criar_rdo', session);
    if (!Array.isArray(allRules)) throw new ApiError('Regras do contrato indisponíveis.');
    const rules = allRules.filter((r: any) => r.tela === 'obras_criar_rdo' && String(r.idModelo) === String(contract.modeloContrato));
    if (!rules.length) throw new ApiError('Modelo de contrato não retornado.');
    const supplied: Record<string, string> = {
      frmrdo_spnContratos: input.contract.trim(),
      frmrdo_spnProjetos: input.project.trim(),
      frmrdo_spnEvento: input.event.trim(),
      frmrdo_spnTipoServ: String(types[0].id),
      frmrdo_spnSubTipoServico: chosenSubId,
      frmrdo_txttarefa: isSequential ? '' : (input.obra || '').trim(),
      frmrdo_txtendereco: input.address.rua,
      frmrdo_txtnum: input.address.numero,
      frmrdo_txtcomplemento: input.address.complemento,
      frmrdo_txtbairro: input.address.bairro,
      frmrdo_txtcidade: input.address.cidade,
      frmrdo_txtestado: input.address.estado,
      frmrdo_txtcep: input.address.cep,
    };
    for (const rule of rules.filter((r: any) => r.requerido === true)) {
      const key = String(rule.field).replace(/^.*\//, '');
      if (isSequential && key === 'frmrdo_txttarefa') continue;
      if (!supplied[key]?.trim()) throw new ApiError('Campo obrigatório não preenchido ou não suportado nesta tela: ' + key);
    }
  }
  const cost = chosenEvent?.unidadeCusto || contract.unidCusto;
  if (!cost) throw new ApiError('Centro de custo não informado pelo servidor.');
  const body: any = {
    usuario: session.login,
    senha: session.password,
    equipe: session.team,
    isEditingRDO: false,
    obra: isSequential ? '' : (input.obra || '').trim(),
    contratoAniel: input.contract.trim(),
    projetoAniel: input.project.trim(),
    evento: chosenEvent ? String(chosenEvent.evento) : input.event.trim(),
    tipoServico: String(types[0].id),
    tipoProduto: chosenSubId,
    unidadecusto: String(cost),
    contInicial: '0',
    contFinal: '0',
    tipoposte: '0',
    tipokit: '0',
    endereco: { ...input.address, latitude: 0, longitude: 0, altitude: 0, direcao: 0, velocidade: 0 },
  };
  for (const key of ['armario', 'cabo', 'cirex', 'contagens', 'de', 'folha', 'gad', 'lateral', 'localidade', 'para', 'sgpam', 'uf']) body[key] = '';
  if (position) body.localAtual = { ...input.address, ...position, direcao: 0, velocidade: 0, dataHoraInfo: nativeDate(new Date()) };
  const before = new Set((await getOpenRdosAsync(session)).map(rdoIdentity));
  try {
    const result = await sendAuthenticatedAsync('AnielTV.Touch.WebApi/api/Obra/CriarRDO', body, session);
    const created = parseRdoSummary(result);
    if (created.number && created.contract === input.contract.trim() && created.project === input.project.trim()) return created;
  } catch { /* A failed acknowledgement is not proof that creation was rolled back. */ }
  const fresh = (await getOpenRdosAsync(session)).filter(r => r.contract === input.contract.trim() && r.project === input.project.trim() && !before.has(rdoIdentity(r)));
  if (fresh.length === 1) return fresh[0];
  throw new ApiError('Criação não confirmada. Consulte os RDOs abertos antes de tentar novamente.');
}

export async function lookupCepAsync(cep: string): Promise<ViaCepResult | null> {
  const clean = cep.replace(/\D/g, '');
  if (clean.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.erro) return null;
    return data;
  } catch {
    return null;
  }
}

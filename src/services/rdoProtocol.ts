import type { RdoAttachment, RdoSummary } from '../types';

export function stableJson(value: any): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableJson(value[k])).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
}
export const rdoIdentity = (r: RdoSummary) => JSON.stringify([r.contract, r.project, r.number, String(r.raw?.contrato ?? '')]);
export function uniqueRdos(rows: RdoSummary[]): RdoSummary[] {
  const seen = new Set<string>();
  return rows.filter(r => { const key = stableJson(r.raw); if (seen.has(key)) return false; seen.add(key); return true; });
}
export function nativeDate(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error('Data inválida.');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${months[value.getMonth()]} ${value.getDate()}, ${value.getFullYear()} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}
export function nativeDate12h(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error('Data inválida.');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad = (v: number) => String(v).padStart(2, '0');
  const rawHour = value.getHours();
  const ampm = rawHour >= 12 ? 'PM' : 'AM';
  const hour12 = rawHour % 12 || 12;
  return `${months[value.getMonth()]} ${value.getDate()}, ${value.getFullYear()} ${hour12}:${pad(value.getMinutes())}:${pad(value.getSeconds())} ${ampm}`;
}
export function nativeTime12h(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error('Data inválida.');
  const pad = (v: number) => String(v).padStart(2, '0');
  const rawHour = value.getHours();
  const ampm = rawHour >= 12 ? 'PM' : 'AM';
  const hour12 = rawHour % 12 || 12;
  return `${pad(hour12)}:${pad(value.getMinutes())}:${pad(value.getSeconds())} ${ampm}`;
}
export function parseServerDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) && value.getFullYear() >= 2000 ? value : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = value.trim().replace(/\\\//g, '/');
  const wcf = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(cleaned);
  if (wcf) {
    const ms = Number(wcf[1]);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) && d.getFullYear() >= 2000 ? d : null;
  }
  const parsed = new Date(cleaned);
  return Number.isFinite(parsed.getTime()) && parsed.getFullYear() >= 2000 ? parsed : null;
}
const statusCodes: Record<string,string> = { Aberta:'0', FechadaImprodutiva:'1', FechadaProdutiva:'2', Atendendo:'3', Deslocando:'6', Atendido:'8', Cancelado:'9', Pausar:'10', Reiniciar:'11', InterromperDeslocamento:'12' };
export function statusCode(value: unknown): string {
  const text = String(value);
  const code = statusCodes[text] ?? text;
  if (!Object.values(statusCodes).includes(code)) throw new Error('Status do RDO desconhecido. Atualize a lista.');
  return code;
}
export function buildCancelBody(rdo: RdoSummary, reason: string): any {
  if (!reason.trim() || reason.length > 4000) throw new Error('Informe um motivo de até 4.000 caracteres.');
  if (['1','2','9'].includes(statusCode(rdo.status))) throw new Error('O RDO não está aberto.');
  if (!rdo.number || !rdo.project || !rdo.contract || !rdo.raw?.contrato) throw new Error('Atualize a identificação do RDO.');
  for (const [key, expected] of [['codCt',rdo.contract],['proj',rdo.project]]) {
    if (rdo.raw[key] != null && String(rdo.raw[key]) !== expected) throw new Error('Identificação divergente. Atualize a lista.');
  }
  const omitted = new Set(['exibicaoNoTouch','exibicaoNoTouchDiasAntes','exibicaoNoTouchDiasDepois','latitude','longitude','obrigaFtth','statusAtivacao','projetoAniel.bloqueioAplicacao','projetoAniel.exigirMudancaStatus','projetoAniel.idGrupoTransfCtProj','projetoAniel.validaTransferencia','usuario.equipeIntegrator','usuario.funcionario.UsaMobile','usuario.funcionario.situacao','usuario.funcionario.usaPonto','usuario.funcionario.empresa.usaPonto']);
  function native(value: any, path = ''): any {
    if (Array.isArray(value)) return value.map(v => native(v, path + '[]'));
    if (value && typeof value === 'object') {
      const out: any = {};
      for (const [k,v] of Object.entries(value)) {
        const key = path ? path + '.' + k : k;
        if (v != null && !omitted.has(key)) out[k] = native(v, key);
      }
      if (!path) { out.logs ??= []; out.produtosElementoRede ??= []; out.enderecoFTTH ??= { altitude:0, direcao:0, latitude:0, longitude:0 }; }
      if (path === 'usuario') out.configTimmerNotification ??= 0;
      if (path === 'usuario.funcionario') { out.marcacaoRestritaResidencia ??= false; out.raioDistancia ??= 0; }
      if (path === 'usuario.funcionario.empresa') out.usaIntegrator ??= false;
      return out;
    }
    const text = String(value);
    if (path === 'statusExecucao') return statusCode(value);
    if (path === 'portaFtth') return text;
    if (path === 'statusFtth' || path === 'tipoServicoExigeDetalhamento') {
      if (/^\d+$/.test(text)) return String(Number(text));
      const labels = path === 'statusFtth' ? ['Indisponivel','Disponivel','Previsto','Construido','Reservado','Ocupado','Desconhecido'] : ['Nenhum','Detalhamento','Producao','Material','ProducaoEMaterial'];
      const index = labels.indexOf(text); if (index < 0) throw new Error('Código do RDO desconhecido. Atualize a lista.'); return String(index);
    }
    if (['projetoAniel.tipoLimiteAplic','projetoAniel.tipoPlanilhaCliente'].includes(path)) {
      const code = ({ Referencial:'1', Limitativa:'2', Livre:'3' } as Record<string,string>)[text] ?? text;
      return ['1','2','3'].includes(code) ? code : '3';
    }
    if (/^endereco(?:FTTH)?\.(latitude|longitude|altitude|direcao)$/.test(path)) {
      const n = Number(value); if (!Number.isFinite(n)) throw new Error('Coordenada inválida.'); return n;
    }
    if (typeof value === 'string') {
      const match = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(value.replace(/\\\//g, '/'));
      if (match) return nativeDate(new Date(Number(match[1])));
    }
    return value;
  }
  return { rdo: { ...native(rdo.raw), codCt:rdo.contract, proj:rdo.project, statusExecucao:statusCode(rdo.status) }, observacao:reason };
}

export function buildRemoveAttachmentBody(selected: RdoAttachment, fresh: RdoAttachment[]): any {
  const id = Number(selected?.id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Este arquivo não retornou uma identificação válida para exclusão.');
  }
  const matches = fresh.filter((d) => String(d?.id ?? '') === String(selected.id));
  if (matches.length !== 1) {
    throw new Error('Este arquivo não está mais na lista deste RDO. Atualize os anexos.');
  }
  const current = matches[0];
  for (const key of ['caminho', 'uuId', 'nomeDocumento', 'extensao'] as const) {
    if (String(selected[key] ?? '') !== String(current[key] ?? '')) {
      throw new Error('O anexo mudou no servidor. Atualize a lista antes de excluir.');
    }
  }
  return { ...current, id, isRDO: true };
}

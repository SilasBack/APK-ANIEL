export interface EquipmentAuditItem {
  key: string;
  name: string;
  allowedSerialLengths: number[];
  quantity: number | null;
  count: number;
  uniqueCount: number;
  invalid: string[];
  hasQuantity: boolean;
  hasSerials: boolean;
  matches: boolean;
  status: string;
}

const DEVICES: { key: string; name: string; lengths: number[] }[] = [
  { key: 'controladora', name: 'Controladora', lengths: [13, 18] },
  { key: 'switch', name: 'Switches', lengths: [13] },
  { key: 'ap', name: 'APs', lengths: [13, 20] },
  { key: 'nobreak', name: 'Nobreak', lengths: [13] },
];

export function normalizeText(value: string): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export function detectDevice(question: string): string | null {
  const text = normalizeText(question);
  if (text.includes('CONTROLADOR')) return 'controladora';
  if (text.includes('SWITCH')) return 'switch';
  if (/NO\s*-?\s*BREAK|\bUPS\b/.test(text)) return 'nobreak';
  if (/\bAPS?\b|ACCESS\s*POINT/.test(text)) return 'ap';
  return null;
}

export function isSerialQuestion(question: string): boolean {
  return detectDevice(question) !== null && normalizeText(question).includes('SERIAL');
}

function getRowValue(row: any): string {
  if (!row) return '';
  const val = row.resposta !== undefined && row.resposta !== null ? String(row.resposta) : '';
  if (val.length > 0) return val;
  if (Array.isArray(row.multi)) {
    return row.multi
      .map((m: any) => (m?.resposta ? String(m.resposta) : ''))
      .filter((v: string) => v.length > 0)
      .join(';');
  }
  return '';
}

export function analyzeEquipmentAudit(rows: any[]): EquipmentAuditItem[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const result: EquipmentAuditItem[] = [];

  for (const device of DEVICES) {
    const deviceRows = rows.filter((r) => detectDevice(String(r?.pergunta || '')) === device.key);
    const quantityRow = deviceRows.find((r) =>
      /\bQUANTIDADE\b|\bQTD\b/.test(normalizeText(String(r?.pergunta || '')))
    );
    const serialRow = deviceRows.find((r) => isSerialQuestion(String(r?.pergunta || '')));

    if (!quantityRow && !serialRow) continue;

    let quantity: number | null = null;
    const rawQty = getRowValue(quantityRow).trim().replace(',', '.');
    if (rawQty.length > 0 && !isNaN(Number(rawQty))) {
      quantity = Number(rawQty);
    }

    const serials: string[] = [];
    const invalid: string[] = [];
    let rawSerials = getRowValue(serialRow);
    if (rawSerials.length > 1000000) {
      invalid.push('Lista de seriais grande demais para conferência.');
      rawSerials = '';
    }

    const tokens = rawSerials.trim().split(/[\s;,|]+/);
    for (const token of tokens) {
      if (!token) continue;
      const value = token.toUpperCase();
      if (!/^[A-Z0-9]+$/.test(value)) {
        invalid.push(token);
        continue;
      }
      if (device.lengths.includes(value.length)) {
        serials.push(value);
        continue;
      }
      const matchingLengths = device.lengths.filter((len) => value.length % len === 0);
      if (matchingLengths.length !== 1) {
        invalid.push(token);
        continue;
      }
      const len = matchingLengths[0];
      for (let offset = 0; offset < value.length; offset += len) {
        serials.push(value.substring(offset, offset + len));
      }
    }

    const hasQuantity = Boolean(quantityRow);
    const hasSerials = Boolean(serialRow);
    const count = serials.length;
    const uniqueCount = new Set(serials.map((s) => s.toUpperCase())).size;

    const isIntQty = quantity !== null && quantity >= 0 && Math.trunc(quantity) === quantity;
    const matches =
      hasQuantity &&
      hasSerials &&
      isIntQty &&
      quantity === count &&
      count === uniqueCount &&
      invalid.length === 0;

    let status = 'Revisar';
    if (!hasQuantity || !hasSerials) {
      status = 'Campos não encontrados';
    } else if (quantity === null || quantity < 0 || Math.trunc(quantity) !== quantity) {
      status = 'Quantidade inválida';
    } else if (matches) {
      status = 'Conferido';
    }

    result.push({
      key: device.key,
      name: device.name,
      allowedSerialLengths: device.lengths,
      quantity,
      count,
      uniqueCount,
      invalid,
      hasQuantity,
      hasSerials,
      matches,
      status,
    });
  }

  return result;
}

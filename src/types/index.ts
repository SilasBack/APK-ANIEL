export interface LoginSession {
  login: string;
  password: string;
  employee: string; // numFre
  name: string;
  team: string; // equipe
  usesRouting: boolean;
  data?: any;
}

export interface ClientDevice {
  id: string; // persistente: anielnext-<guid>
  model: string;
  platform: string;
  version: string;
}

export interface RdoSummary {
  number: string; // obra
  contract: string; // codCt
  project: string; // projeto / INEP
  service: string; // tipoServico
  status: string; // Aberta, Atendendo, etc.
  date: string; // dtInicial
  address: string;
  raw: any;
}

export interface Encerramento {
  codigo: string | number;
  descricao: string;
  status?: string; // 2 = produtivo, outro = improdutivo
  [key: string]: any;
}

export interface RdoAttachment {
  nomeDocumento: string;
  extensao: string;
  uuId: string;
  caminho: string;
  tamanho: string;
  isRDO: boolean;
  [key: string]: any;
}

export interface SavedLogin {
  login: string;
  password?: string;
  employeeName?: string;
  lastUsed: string;
}

export interface ViaCepResult {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

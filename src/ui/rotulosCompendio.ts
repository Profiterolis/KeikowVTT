import type {
  Atributo,
  CATEGORIAS_ITEM,
  ESCOLAS_MAGIA,
  MOEDAS,
  PESOS_ARMADURA,
  RARIDADES,
  RECARGAS,
  TAMANHOS,
  TipoEntrada,
} from '../core/entradas';

type Rotulos<T extends string> = Readonly<Record<T, string>>;

export const ROTULO_TIPO: Rotulos<TipoEntrada> = {
  item: 'Item',
  magia: 'Magia',
  habilidade: 'Habilidade',
  classe: 'Classe',
  especie: 'Espécie',
  antecedente: 'Antecedente',
  talento: 'Talento',
  condicao: 'Condição',
  monstro: 'Monstro',
  kit: 'Kit',
};

export const ROTULO_ATRIBUTO: Rotulos<Atributo> = {
  for: 'Força',
  des: 'Destreza',
  con: 'Constituição',
  int: 'Inteligência',
  sab: 'Sabedoria',
  car: 'Carisma',
};

export const ROTULO_CATEGORIA: Rotulos<(typeof CATEGORIAS_ITEM)[number]> = {
  arma: 'Arma',
  armadura: 'Armadura',
  escudo: 'Escudo',
  consumivel: 'Consumível',
  municao: 'Munição',
  ferramenta: 'Ferramenta',
  montaria: 'Montaria ou veículo',
  equipamento: 'Equipamento',
  tesouro: 'Tesouro',
};

export const ROTULO_RARIDADE: Rotulos<(typeof RARIDADES)[number]> = {
  comum: 'Comum',
  incomum: 'Incomum',
  raro: 'Raro',
  'muito-raro': 'Muito raro',
  lendario: 'Lendário',
  artefato: 'Artefato',
  variada: 'Variada',
};

export const ROTULO_MOEDA: Rotulos<(typeof MOEDAS)[number]> = {
  pc: 'peças de cobre',
  pp: 'peças de prata',
  pe: 'peças de electro',
  po: 'peças de ouro',
  pl: 'peças de platina',
};

export const ROTULO_TAMANHO: Rotulos<(typeof TAMANHOS)[number]> = {
  miudo: 'Miúdo',
  pequeno: 'Pequeno',
  medio: 'Médio',
  grande: 'Grande',
  enorme: 'Enorme',
  imenso: 'Imenso',
};

export const ROTULO_ESCOLA: Rotulos<(typeof ESCOLAS_MAGIA)[number]> = {
  abjuracao: 'Abjuração',
  adivinhacao: 'Adivinhação',
  conjuracao: 'Conjuração',
  encantamento: 'Encantamento',
  evocacao: 'Evocação',
  ilusao: 'Ilusão',
  necromancia: 'Necromancia',
  transmutacao: 'Transmutação',
};

export const ROTULO_RECARGA: Rotulos<(typeof RECARGAS)[number]> = {
  'descanso-curto': 'Descanso curto',
  'descanso-longo': 'Descanso longo',
  aurora: 'Aurora',
};

export const ROTULO_PESO_ARMADURA: Rotulos<(typeof PESOS_ARMADURA)[number]> = {
  leve: 'Leve',
  media: 'Média',
  pesada: 'Pesada',
  escudo: 'Escudo',
};

export const ROTULO_DOMINIO = { simples: 'Simples', marcial: 'Marcial' } as const;
export const ROTULO_ALCANCE_TIPO = { 'corpo-a-corpo': 'Corpo a corpo', distancia: 'À distância' } as const;

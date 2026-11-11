import { SO_MESTRE, type Visibilidade } from './visibilidade';

/** Força, Destreza, Constituição, Inteligência, Sabedoria e Carisma. */
export const ATRIBUTOS = ['for', 'des', 'con', 'int', 'sab', 'car'] as const;
export type Atributo = (typeof ATRIBUTOS)[number];

export const TIPOS_ENTRADA = [
  'item',
  'magia',
  'habilidade',
  'classe',
  'especie',
  'antecedente',
  'talento',
  'condicao',
  'monstro',
  'kit',
] as const;
export type TipoEntrada = (typeof TIPOS_ENTRADA)[number];

/** Peças de cobre, prata, electro, ouro e platina. */
export const MOEDAS = ['pc', 'pp', 'pe', 'po', 'pl'] as const;
export const RARIDADES = [
  'comum',
  'incomum',
  'raro',
  'muito-raro',
  'lendario',
  'artefato',
  'variada',
] as const;
export const CATEGORIAS_ITEM = [
  'arma',
  'armadura',
  'escudo',
  'consumivel',
  'municao',
  'ferramenta',
  'montaria',
  'equipamento',
  'tesouro',
] as const;
export const TAMANHOS = ['miudo', 'pequeno', 'medio', 'grande', 'enorme', 'imenso'] as const;
export const ESCOLAS_MAGIA = [
  'abjuracao',
  'adivinhacao',
  'conjuracao',
  'encantamento',
  'evocacao',
  'ilusao',
  'necromancia',
  'transmutacao',
] as const;
export const RECARGAS = ['descanso-curto', 'descanso-longo', 'aurora'] as const;
export const PESOS_ARMADURA = ['leve', 'media', 'pesada', 'escudo'] as const;
export const QUANDO_EFEITO = ['sempre', 'equipado', 'sintonizado'] as const;
/**
 * - somar: +1 na CA (Anel de Proteção).
 * - minimo: o valor fica no mínimo este, se já não for maior (Manoplas de Força: Força 19).
 * - definir: o valor vira este, ignorando qualquer bônus (Agarrado: deslocamento 0).
 */
export const OPERACOES_EFEITO = ['somar', 'minimo', 'definir'] as const;
export type OperacaoEfeito = (typeof OPERACOES_EFEITO)[number];

/** De onde veio a entrada: criada nesta campanha, ou trazida de um pacote como o SRD. */
export type OrigemEntrada =
  | { readonly tipo: 'campanha' }
  | { readonly tipo: 'pacote'; readonly pacote: string };

/**
 * Um modificador que a entrada aplica na ficha de quem a tem, como "+1 na CA".
 * `alvo` e `valor` são interpretados pelo motor de regras.
 */
export interface Efeito {
  readonly id: string;
  readonly alvo: string;
  readonly operacao: OperacaoEfeito;
  /** Fórmula, como `1` ou `mod(DES)`. */
  readonly valor: string;
  readonly quando: (typeof QUANDO_EFEITO)[number];
}

/**
 * Uma etapa do que acontece ao usar uma ação:
 * - rolar: rola a fórmula e mostra no registro, como "Dano: 1d8 + 3".
 * - curar: rola a fórmula e devolve esses PV a quem usou.
 * - consumir: gasta unidades da pilha do item (uma poção bebida).
 * - gastarUso: gasta usos da habilidade (uma Fúria).
 */
export type PassoDeAcao =
  | { readonly tipo: 'rolar'; readonly formula: string; readonly rotulo: string }
  | { readonly tipo: 'curar'; readonly formula: string }
  | { readonly tipo: 'consumir'; readonly quantidade: number }
  | { readonly tipo: 'gastarUso'; readonly quantidade: number };

export const TIPOS_PASSO = ['rolar', 'curar', 'consumir', 'gastarUso'] as const;

/** Uma opção do menu do botão direito, vinda da própria entrada, como "Beber" numa poção. */
export interface AcaoDeEntrada {
  readonly id: string;
  readonly rotulo: string;
  readonly passos: readonly PassoDeAcao[];
}

export interface BlocoDeTexto {
  readonly nome: string;
  readonly descricao: string;
}

export interface DadosArma {
  readonly dominio: 'simples' | 'marcial';
  readonly alcanceTipo: 'corpo-a-corpo' | 'distancia';
  /** Fórmula de dados, como `1d8`. */
  readonly dano: string;
  readonly tipoDano: string;
  readonly danoVersatil: string | null;
  /** Em metros (o SRD usa pés; 1 pé = 0,3 m). */
  readonly alcance: { readonly normal: number; readonly longo: number | null } | null;
  readonly propriedades: readonly string[];
}

export interface DadosArmadura {
  readonly peso: (typeof PESOS_ARMADURA)[number];
  /** No escudo, é o bônus que ele dá. */
  readonly caBase: number;
  readonly usaDestreza: boolean;
  /** `null` quando não há limite. */
  readonly destrezaMaxima: number | null;
  readonly forcaMinima: number;
  readonly desvantagemFurtividade: boolean;
}

export interface DadosItem {
  readonly categoria: (typeof CATEGORIAS_ITEM)[number];
  /** Em quilos. O SRD usa libras; a conversão é 1 libra = 0,5 kg, como na edição brasileira do 5e. */
  readonly peso: number;
  readonly custo: { readonly quantidade: number; readonly moeda: (typeof MOEDAS)[number] } | null;
  readonly raridade: (typeof RARIDADES)[number] | null;
  readonly requerSintonia: boolean;
  readonly empilhavel: boolean;
  readonly arma: DadosArma | null;
  readonly armadura: DadosArmadura | null;
}

export interface DadosMagia {
  /** 0 para truques. */
  readonly nivel: number;
  readonly escola: (typeof ESCOLAS_MAGIA)[number];
  readonly tempoConjuracao: string;
  readonly alcance: string;
  readonly componentes: {
    readonly verbal: boolean;
    readonly somatico: boolean;
    readonly material: string | null;
  };
  readonly duracao: string;
  readonly concentracao: boolean;
  readonly ritual: boolean;
  /** Ids das entradas de classe que podem aprender a magia. */
  readonly classes: readonly string[];
}

export interface DadosHabilidade {
  /** Texto livre, como "Guerreiro 2" ou "Anão". */
  readonly requisito: string;
  readonly usos: {
    /** Fórmula, como `1` ou `mod(CAR)`. */
    readonly maximo: string;
    readonly recarga: (typeof RECARGAS)[number];
  } | null;
}

/** A tabela de uma classe vai do nível 1 ao 20. */
export const NIVEIS_DA_TABELA = 20;

/** Uma coluna da tabela de nível da classe, como "Fúrias" ou "Espaços de 1º nível". */
export interface ColunaTabela {
  /** Nome usado nas fórmulas, como em `tabela(furias)`. */
  readonly id: string;
  readonly nome: string;
  /** Uma fórmula por nível, do 1 ao 20. Vazio é como o "—" dos livros e vale zero. */
  readonly valores: readonly string[];
}

/** "Escolha N entre estas perícias", como nas classes do 5e. */
export interface EscolhaDePericias {
  readonly quantidade: number;
  /** Nomes das perícias como no texto, como "Skill: Athletics" ou "Atletismo"; as regras acham a perícia. */
  readonly opcoes: readonly string[];
}

/** Os níveis com aumento de atributo do 5e, para classes novas e antigas. */
export const NIVEIS_DE_AUMENTO_PADRAO: readonly number[] = [4, 8, 12, 16, 19];

export interface DadosClasse {
  readonly dadoVida: number;
  readonly salvaguardas: readonly Atributo[];
  readonly proficiencias: readonly string[];
  /** As perícias que o personagem escolhe ao pegar a classe como a primeira. */
  readonly escolhaPericias: EscolhaDePericias | null;
  /** Níveis da classe em que se ganha aumento de atributo (ou um talento). */
  readonly niveisDeAumento: readonly number[];
  /** Ids das entradas de habilidade ganhas em cada nível. */
  readonly habilidades: readonly { readonly nivel: number; readonly entradaId: string }[];
  readonly atributoConjuracao: Atributo | null;
  readonly tabela: readonly ColunaTabela[];
}

export interface DadosEspecie {
  readonly tamanho: (typeof TAMANHOS)[number];
  /** Em metros (o SRD usa pés; 1 pé = 0,3 m). */
  readonly deslocamento: number;
  readonly aumentosAtributo: Readonly<Partial<Record<Atributo, number>>>;
  readonly idiomas: readonly string[];
  /** Ids das entradas de habilidade da espécie. */
  readonly tracos: readonly string[];
}

export interface DadosAntecedente {
  readonly proficiencias: readonly string[];
  readonly habilidades: readonly string[];
}

export interface DadosTalento {
  readonly prerequisito: string;
}

/** Condições não têm dados próprios: o que elas fazem está nos efeitos. */
export type DadosCondicao = Readonly<Record<string, never>>;

export interface DadosMonstro {
  readonly tamanho: (typeof TAMANHOS)[number];
  readonly tipoCriatura: string;
  readonly alinhamento: string;
  readonly classeArmadura: number;
  /** De onde vem a CA, como "armadura natural" ou "couro, escudo". Vazio quando não há nota. */
  readonly notaArmadura: string;
  readonly pontosVida: number;
  /** Fórmula, como `2d8+2`. */
  readonly dadosVida: string;
  readonly deslocamento: string;
  readonly atributos: Readonly<Record<Atributo, number>>;
  readonly salvaguardas: Readonly<Partial<Record<Atributo, number>>>;
  readonly pericias: Readonly<Record<string, number>>;
  readonly vulnerabilidades: readonly string[];
  readonly resistencias: readonly string[];
  readonly imunidades: readonly string[];
  readonly imunidadesCondicao: readonly string[];
  readonly sentidos: string;
  readonly idiomas: string;
  readonly nivelDesafio: number;
  readonly experiencia: number;
  readonly tracos: readonly BlocoDeTexto[];
  readonly acoesDeCombate: readonly BlocoDeTexto[];
  readonly reacoes: readonly BlocoDeTexto[];
  readonly acoesLendarias: readonly BlocoDeTexto[];
}

/** Um item do kit, pelo id da entrada no compêndio. */
export interface ItemDoKit {
  readonly entradaId: string;
  readonly quantidade: number;
}

/**
 * Um kit de equipamento: só uma conveniência do mestre. Quem recebe um kit ganha os itens
 * separados, como pilhas comuns, e as moedas; o kit em si nunca aparece na ficha.
 */
export interface DadosKit {
  readonly itens: readonly ItemDoKit[];
  readonly moedas: Readonly<Record<(typeof MOEDAS)[number], number>>;
  /** Classes (ids do compêndio) que oferecem este kit como equipamento inicial no assistente. */
  readonly classes: readonly string[];
  /** Antecedentes (ids do compêndio) que dão este kit a mais na criação, sem escolha. */
  readonly extraPorAntecedente: readonly string[];
  /** Perícias (ids das regras) que dão este kit a mais na criação, sem escolha. */
  readonly extraPorPericia: readonly string[];
}

export interface DadosPorTipo {
  readonly item: DadosItem;
  readonly magia: DadosMagia;
  readonly habilidade: DadosHabilidade;
  readonly classe: DadosClasse;
  readonly especie: DadosEspecie;
  readonly antecedente: DadosAntecedente;
  readonly talento: DadosTalento;
  readonly condicao: DadosCondicao;
  readonly monstro: DadosMonstro;
  readonly kit: DadosKit;
}

export interface EntradaDe<T extends TipoEntrada> {
  readonly id: string;
  readonly tipo: T;
  readonly nome: string;
  readonly descricao: string;
  readonly etiquetas: readonly string[];
  readonly origem: OrigemEntrada;
  readonly visibilidade: Visibilidade;
  readonly efeitos: readonly Efeito[];
  readonly acoes: readonly AcaoDeEntrada[];
  readonly dados: DadosPorTipo[T];
}

/** Qualquer coisa do compêndio: item, magia, monstro etc. */
export type Entrada = { [T in TipoEntrada]: EntradaDe<T> }[TipoEntrada];

const ATRIBUTOS_PADRAO: Record<Atributo, number> = {
  for: 10,
  des: 10,
  con: 10,
  int: 10,
  sab: 10,
  car: 10,
};

const DADOS_INICIAIS: { readonly [T in TipoEntrada]: () => DadosPorTipo[T] } = {
  item: () => ({
    categoria: 'equipamento',
    peso: 0,
    custo: null,
    raridade: null,
    requerSintonia: false,
    empilhavel: false,
    arma: null,
    armadura: null,
  }),
  magia: () => ({
    nivel: 0,
    escola: 'evocacao',
    tempoConjuracao: '1 ação',
    alcance: '',
    componentes: { verbal: false, somatico: false, material: null },
    duracao: 'Instantânea',
    concentracao: false,
    ritual: false,
    classes: [],
  }),
  habilidade: () => ({ requisito: '', usos: null }),
  classe: () => ({
    dadoVida: 8,
    salvaguardas: [],
    proficiencias: [],
    habilidades: [],
    atributoConjuracao: null,
    tabela: [],
    escolhaPericias: null,
    niveisDeAumento: NIVEIS_DE_AUMENTO_PADRAO,
  }),
  especie: () => ({
    tamanho: 'medio',
    deslocamento: 9,
    aumentosAtributo: {},
    idiomas: [],
    tracos: [],
  }),
  antecedente: () => ({ proficiencias: [], habilidades: [] }),
  talento: () => ({ prerequisito: '' }),
  condicao: () => ({}),
  monstro: () => ({
    tamanho: 'medio',
    tipoCriatura: '',
    alinhamento: '',
    classeArmadura: 10,
    notaArmadura: '',
    pontosVida: 1,
    dadosVida: '1d8',
    deslocamento: '9 m',
    atributos: { ...ATRIBUTOS_PADRAO },
    salvaguardas: {},
    pericias: {},
    vulnerabilidades: [],
    resistencias: [],
    imunidades: [],
    imunidadesCondicao: [],
    sentidos: '',
    idiomas: '',
    nivelDesafio: 0,
    experiencia: 0,
    tracos: [],
    acoesDeCombate: [],
    reacoes: [],
    acoesLendarias: [],
  }),
  kit: () => ({
    itens: [],
    moedas: { pc: 0, pp: 0, pe: 0, po: 0, pl: 0 },
    classes: [],
    extraPorAntecedente: [],
    extraPorPericia: [],
  }),
};

/**
 * Uma entrada nova, criada pelo mestre: começa visível só para ele.
 * Funciona também com um tipo escolhido na hora, como numa lista de opções.
 */
export function criarEntrada<T extends TipoEntrada>(tipo: T, id: string): Extract<Entrada, { tipo: T }> {
  const entrada: EntradaDe<T> = {
    id,
    tipo,
    nome: '',
    descricao: '',
    etiquetas: [],
    origem: { tipo: 'campanha' },
    visibilidade: SO_MESTRE,
    efeitos: [],
    acoes: [],
    dados: DADOS_INICIAIS[tipo](),
  };
  // O TypeScript não consegue provar sozinho que os dados de DADOS_INICIAIS[tipo] combinam com o tipo,
  // mas o mapa acima é verificado tipo a tipo.
  return entrada as unknown as Extract<Entrada, { tipo: T }>;
}

/**
 * Fichas de personagem, NPC e monstro. As três usam o mesmo formato.
 *
 * A ficha guarda cópias das entradas do compêndio que usa (classe, espécie, antecedente,
 * habilidades, monstro): editar ou apagar a entrada no compêndio depois não muda a ficha.
 */
import { ID_MESTRE } from './campanha';
import type { EstadoCompendio } from './compendio';
import { ATRIBUTOS, criarEntrada, MOEDAS, NIVEIS_DA_TABELA, type Atributo, type Entrada, type EntradaDe } from './entradas';
import { SO_MESTRE, VISIVEL_A_TODOS, type Visibilidade } from './visibilidade';
import { conferirFichas, type OpcoesDaConferencia } from './permissoes';
import { criarLojaComHistorico, type LojaComHistorico } from './lojaHistorico';
import type { OpcoesRegistro } from './registro';
import type { MetodoAtributos } from './regras';

export const TIPOS_FICHA = ['personagem', 'npc', 'monstro'] as const;
export type TipoFicha = (typeof TIPOS_FICHA)[number];

/** Sem proficiência, metade, proficiente ou especialista. */
export const MULTIPLICADORES_PROFICIENCIA = [0, 0.5, 1, 2] as const;

export const NIVEL_MAXIMO = NIVEIS_DA_TABELA;

export interface ClasseNaFicha {
  /** Id da cópia da classe, em `entradas`. */
  readonly entradaId: string;
  readonly nivel: number;
}

export interface Ficha {
  readonly id: string;
  readonly tipo: TipoFicha;
  readonly nome: string;
  /** Participante da campanha que controla a ficha: o mestre ou um jogador. */
  readonly donoId: string;
  /** Quem vê a ficha além do dono e do mestre. "Só o mestre" quer dizer que ninguém mais vê. */
  readonly visibilidade: Visibilidade;
  /** Com a edição liberada pelo mestre, o dono muda tudo na ficha, inclusive atributos e classes. */
  readonly edicaoLiberada: boolean;
  /** A ficha está sendo montada pelo assistente de criação: o dono muda tudo até concluir. */
  readonly emCriacao: boolean;
  /** Níveis que o mestre liberou e o dono ainda não subiu pelo assistente. */
  readonly niveisLiberados: number;
  /** Durante a criação: o método dos atributos e os valores rolados, que não podem ser rolados de novo. */
  readonly rascunho: RascunhoDaCriacao | null;
  /** Os valores escolhidos para a ficha, antes dos aumentos da espécie e de outros efeitos. */
  readonly atributos: Readonly<Record<Atributo, number>>;
  /** Cópias das entradas do compêndio que a ficha usa, pelo id. */
  readonly entradas: Readonly<Record<string, Entrada>>;
  /** Na ordem em que foram pegas: a primeira dá o dado de vida cheio e as salvaguardas. */
  readonly classes: readonly ClasseNaFicha[];
  readonly especieId: string | null;
  readonly antecedenteId: string | null;
  /** Nas fichas de monstro, a cópia do monstro de onde vêm CA, PV e bônus. */
  readonly monstroId: string | null;
  /** Proficiências marcadas à mão, por perícia ou salvaguarda. Valem mais que as automáticas. */
  readonly proficiencias: Readonly<Record<string, number>>;
  /** PV ganhos em cada nível, na ordem dos níveis. `null` (ou faltando) usa a média. */
  readonly pvPorNivel: readonly (number | null)[];
  /** `null` quando a ficha está com os PV cheios. */
  readonly pvAtuais: number | null;
  readonly pvTemporarios: number;
  /** Itens carregados, em pilhas. A mesma entrada pode ter várias pilhas (uma equipada, outra na mochila). */
  readonly itens: readonly PilhaDeItem[];
  /** Habilidades, magias e talentos acrescentados à mão, além dos que vêm da classe, espécie e antecedente. */
  readonly extras: readonly string[];
  readonly notas: readonly NotaDaFicha[];
  readonly moedas: Readonly<Record<Moeda, number>>;
  /** Como o jogador arrumou as cartas. Cartas que não estão em nenhuma seção vão para a seção padrão do tipo delas. */
  readonly secoes: readonly SecaoDaFicha[];
  /** Usos já gastos de cada habilidade, pelo id da cópia. Voltam nos descansos. */
  readonly usosGastos: Readonly<Record<string, number>>;
  /** Espaços de magia já gastos, do 1º ao 9º nível. Voltam no descanso longo. */
  readonly espacosGastos: readonly number[];
  /** Estudos em andamento, feitos à noite: um idioma ou uma magia de um livro ou pergaminho. */
  readonly estudos: readonly EstudoNaFicha[];
  /** Idiomas aprendidos estudando (os da espécie ficam na espécie). */
  readonly idiomas: readonly string[];
}

/** Um estudo em andamento. O mestre decide quando ele termina. */
export interface EstudoNaFicha {
  readonly id: string;
  readonly tipo: 'idioma' | 'magia';
  /** O nome do idioma, ou o nome da magia. */
  readonly assunto: string;
  /** A magia estudada (id no compêndio), ou `null` num idioma. */
  readonly magiaId: string | null;
  /** Quantos turnos da noite já foram estudados. */
  readonly turnos: number;
}

export const ESPACOS_ZERADOS: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0];

/** O que a criação precisa lembrar e a ficha em si não guarda. */
export interface RascunhoDaCriacao {
  readonly metodo: MetodoAtributos;
  /** Os seis valores rolados, ou `null` se ainda não rolou. */
  readonly rolados: readonly number[] | null;
  /** O kit de equipamento escolhido entre os da classe, ou `null`. */
  readonly kitId: string | null;
  /** Itens escolhidos fora dos kits (só o mestre escolhe). */
  readonly itens: readonly { readonly entradaId: string; readonly quantidade: number }[];
}

export type Moeda = (typeof MOEDAS)[number];

export interface PilhaDeItem {
  readonly id: string;
  /** Id da cópia do item, em `entradas`. */
  readonly entradaId: string;
  readonly quantidade: number;
  /** Guardado desde já; os efeitos de equipar e sintonizar entram no passo seguinte. */
  readonly equipado: boolean;
  readonly sintonizado: boolean;
}

export interface NotaDaFicha {
  readonly id: string;
  readonly titulo: string;
  readonly texto: string;
}

/** Um grupo de cartas, como "Mochila" ou "Magias preparadas", na ordem escolhida. */
export interface SecaoDaFicha {
  readonly id: string;
  readonly nome: string;
  /** Chaves das cartas: `item:<pilha>`, `entrada:<habilidade ou magia>` ou `nota:<nota>`. */
  readonly cartas: readonly string[];
}

/** Tipos que podem ser acrescentados à mão como cartas: habilidades, magias e talentos. */
export const TIPOS_EXTRAS = ['habilidade', 'magia', 'talento'] as const;
export type TipoExtra = (typeof TIPOS_EXTRAS)[number];

/** As seções com que toda ficha começa. Os ids servem de seção padrão para cada tipo de carta. */
export const SECOES_PADRAO: readonly SecaoDaFicha[] = [
  { id: 'equipado', nome: 'Equipado', cartas: [] },
  { id: 'mochila', nome: 'Mochila', cartas: [] },
  { id: 'habilidades', nome: 'Habilidades', cartas: [] },
  { id: 'magias', nome: 'Magias', cartas: [] },
  { id: 'notas', nome: 'Notas', cartas: [] },
];

export const MOEDAS_ZERADAS: Readonly<Record<Moeda, number>> = { pc: 0, pp: 0, pe: 0, po: 0, pl: 0 };

export const chaveDoItem = (pilhaId: string) => `item:${pilhaId}`;
export const chaveDaEntrada = (entradaId: string) => `entrada:${entradaId}`;
export const chaveDaNota = (notaId: string) => `nota:${notaId}`;

export interface EstadoFichas {
  readonly fichas: Readonly<Record<string, Ficha>>;
}

export type AcaoFichas =
  | { readonly tipo: 'CriarFicha'; readonly ficha: Ficha }
  /** Troca a ficha inteira pela nova versão, mantendo id e tipo. */
  | { readonly tipo: 'EditarFicha'; readonly ficha: Ficha }
  | { readonly tipo: 'RemoverFicha'; readonly fichaId: string }
  /** Muda várias fichas de uma vez, num só passo de desfazer: presentear ou trocar itens entre elas. */
  | { readonly tipo: 'EditarFichas'; readonly fichas: readonly Ficha[] }
  | { readonly tipo: 'CarregarFichas'; readonly estado: EstadoFichas };

export function criarFichasVazias(): EstadoFichas {
  return { fichas: {} };
}

const ATRIBUTOS_INICIAIS: Readonly<Record<Atributo, number>> = {
  for: 10,
  des: 10,
  con: 10,
  int: 10,
  sab: 10,
  car: 10,
};

export function criarFicha(tipo: Exclude<TipoFicha, 'monstro'>, id: string, donoId: string = ID_MESTRE): Ficha {
  return {
    id,
    tipo,
    nome: '',
    donoId,
    visibilidade: SO_MESTRE,
    edicaoLiberada: false,
    emCriacao: false,
    niveisLiberados: 0,
    rascunho: null,
    atributos: { ...ATRIBUTOS_INICIAIS },
    entradas: {},
    classes: [],
    especieId: null,
    antecedenteId: null,
    monstroId: null,
    proficiencias: {},
    pvPorNivel: [],
    pvAtuais: null,
    pvTemporarios: 0,
    itens: [],
    extras: [],
    notas: [],
    moedas: { ...MOEDAS_ZERADAS },
    secoes: SECOES_PADRAO,
    usosGastos: {},
    espacosGastos: ESPACOS_ZERADOS,
    estudos: [],
    idiomas: [],
  };
}

/** Uma ficha de monstro, com cópia do monstro do compêndio. Fica com o mestre. */
export function fichaDeMonstro(monstro: EntradaDe<'monstro'>, id: string): Ficha {
  return {
    ...criarFicha('npc', id),
    tipo: 'monstro',
    nome: monstro.nome,
    atributos: { ...monstro.dados.atributos },
    entradas: { [monstro.id]: monstro },
    monstroId: monstro.id,
  };
}

export function entradaDaFicha<T extends Entrada['tipo']>(
  ficha: Ficha,
  id: string | null,
  tipo: T,
): Extract<Entrada, { tipo: T }> | null {
  const entrada = id ? ficha.entradas[id] : undefined;
  return entrada && entrada.tipo === tipo ? (entrada as Extract<Entrada, { tipo: T }>) : null;
}

export function nivelTotal(ficha: Ficha): number {
  return ficha.classes.reduce((soma, c) => soma + c.nivel, 0);
}

/** Habilidades que uma entrada cita: as da classe, os traços da espécie, as do antecedente. */
function referenciasDe(entrada: Entrada): string[] {
  switch (entrada.tipo) {
    case 'classe':
      return entrada.dados.habilidades.map((h) => h.entradaId);
    case 'especie':
      return [...entrada.dados.tracos];
    case 'antecedente':
      return [...entrada.dados.habilidades];
    default:
      return [];
  }
}

/** A entrada do compêndio e as habilidades que ela cita, prontas para copiar na ficha. */
function copiasDe(compendio: EstadoCompendio, entrada: Entrada): Record<string, Entrada> {
  const copias: Record<string, Entrada> = { [entrada.id]: entrada };
  for (const id of referenciasDe(entrada)) {
    const citada = compendio.entradas[id];
    if (citada) {
      copias[id] = citada;
    }
  }
  return copias;
}

/**
 * Tira as cópias que nenhuma parte da ficha usa mais, como as habilidades de uma classe removida,
 * e as cartas das seções que deixaram de existir.
 */
function semCopiasSoltas(ficha: Ficha): Ficha {
  const raizes = [
    ...ficha.classes.map((c) => c.entradaId),
    ficha.especieId,
    ficha.antecedenteId,
    ficha.monstroId,
    ...ficha.itens.map((p) => p.entradaId),
    ...ficha.extras,
  ].filter((id): id is string => id !== null);
  const usadas = new Set(raizes);
  for (const id of raizes) {
    const entrada = ficha.entradas[id];
    if (entrada) {
      referenciasDe(entrada).forEach((r) => usadas.add(r));
    }
  }
  const entradas = Object.fromEntries(Object.entries(ficha.entradas).filter(([id]) => usadas.has(id)));
  const existentes = new Set([
    ...ficha.itens.map((p) => chaveDoItem(p.id)),
    ...Object.keys(entradas).map(chaveDaEntrada),
    ...ficha.notas.map((n) => chaveDaNota(n.id)),
  ]);
  const secoes = ficha.secoes.map((s) =>
    s.cartas.every((c) => existentes.has(c)) ? s : { ...s, cartas: s.cartas.filter((c) => existentes.has(c)) },
  );
  return { ...ficha, entradas, secoes };
}

// ---------- Inventário, cartas extras, notas e moedas ----------

/** Acrescenta uma pilha de um item do compêndio. Se a ficha já tem uma cópia dele, usa a cópia (que pode ter sido editada). */
export function comItem(ficha: Ficha, compendio: EstadoCompendio, entradaId: string, pilhaId: string, quantidade = 1): Ficha {
  const item = ficha.entradas[entradaId] ?? compendio.entradas[entradaId];
  if (!item || item.tipo !== 'item' || ficha.itens.some((p) => p.id === pilhaId)) {
    return ficha;
  }
  return {
    ...ficha,
    entradas: { ...ficha.entradas, [entradaId]: item },
    itens: [...ficha.itens, { id: pilhaId, entradaId, quantidade: Math.max(1, Math.round(quantidade)), equipado: false, sintonizado: false }],
  };
}

/** Um item criado na hora, só desta ficha: não passa pelo compêndio. */
export function comItemAvulso(ficha: Ficha, entradaId: string, pilhaId: string, nome: string): Ficha {
  if (ficha.entradas[entradaId] || ficha.itens.some((p) => p.id === pilhaId)) {
    return ficha;
  }
  const item: Entrada = { ...criarEntrada('item', entradaId), nome, visibilidade: VISIVEL_A_TODOS };
  return {
    ...ficha,
    entradas: { ...ficha.entradas, [entradaId]: item },
    itens: [...ficha.itens, { id: pilhaId, entradaId, quantidade: 1, equipado: false, sintonizado: false }],
  };
}

/** Muda quantidade ou marcas de uma pilha. A quantidade fica entre 1 e 99999. */
export function comPilha(ficha: Ficha, pilhaId: string, mudancas: Partial<Omit<PilhaDeItem, 'id' | 'entradaId'>>): Ficha {
  return {
    ...ficha,
    itens: ficha.itens.map((p) => {
      if (p.id !== pilhaId) {
        return p;
      }
      const quantidade = mudancas.quantidade === undefined ? p.quantidade : Math.min(99999, Math.max(1, Math.round(mudancas.quantidade)));
      return { ...p, ...mudancas, quantidade };
    }),
  };
}

/** Descarta uma pilha. A cópia do item some quando nenhuma outra pilha a usa. */
export function semPilha(ficha: Ficha, pilhaId: string): Ficha {
  return semCopiasSoltas({ ...ficha, itens: ficha.itens.filter((p) => p.id !== pilhaId) });
}

/** Acrescenta uma habilidade, magia ou talento do compêndio como carta. */
export function comExtra(ficha: Ficha, compendio: EstadoCompendio, entradaId: string): Ficha {
  const entrada = ficha.entradas[entradaId] ?? compendio.entradas[entradaId];
  if (!entrada || !(TIPOS_EXTRAS as readonly string[]).includes(entrada.tipo) || ficha.extras.includes(entradaId)) {
    return ficha;
  }
  return { ...ficha, entradas: { ...ficha.entradas, [entradaId]: entrada }, extras: [...ficha.extras, entradaId] };
}

export function semExtra(ficha: Ficha, entradaId: string): Ficha {
  return semCopiasSoltas({ ...ficha, extras: ficha.extras.filter((id) => id !== entradaId) });
}

/** Troca a cópia de uma entrada da ficha pela versão editada, mantendo id, tipo e origem. */
export function comCopiaEditada(ficha: Ficha, nova: Entrada): Ficha {
  const atual = ficha.entradas[nova.id];
  if (!atual || atual.tipo !== nova.tipo) {
    return ficha;
  }
  return { ...ficha, entradas: { ...ficha.entradas, [nova.id]: { ...nova, origem: atual.origem } as Entrada } };
}

export function comNota(ficha: Ficha, nota: NotaDaFicha): Ficha {
  const existe = ficha.notas.some((n) => n.id === nota.id);
  return { ...ficha, notas: existe ? ficha.notas.map((n) => (n.id === nota.id ? nota : n)) : [...ficha.notas, nota] };
}

export function semNota(ficha: Ficha, notaId: string): Ficha {
  return semCopiasSoltas({ ...ficha, notas: ficha.notas.filter((n) => n.id !== notaId) });
}

export function comMoeda(ficha: Ficha, moeda: Moeda, quantidade: number): Ficha {
  return { ...ficha, moedas: { ...ficha.moedas, [moeda]: Math.max(0, Math.round(quantidade)) } };
}

// ---------- Seções ----------

export function comSecao(ficha: Ficha, secaoId: string, nome: string): Ficha {
  if (ficha.secoes.some((s) => s.id === secaoId)) {
    return ficha;
  }
  return { ...ficha, secoes: [...ficha.secoes, { id: secaoId, nome, cartas: [] }] };
}

export function comSecaoRenomeada(ficha: Ficha, secaoId: string, nome: string): Ficha {
  return { ...ficha, secoes: ficha.secoes.map((s) => (s.id === secaoId ? { ...s, nome } : s)) };
}

/** Muda a posição de uma seção na lista. */
export function comSecaoMovida(ficha: Ficha, secaoId: string, posicao: number): Ficha {
  const secao = ficha.secoes.find((s) => s.id === secaoId);
  if (!secao) {
    return ficha;
  }
  const resto = ficha.secoes.filter((s) => s.id !== secaoId);
  const destino = Math.max(0, Math.min(posicao, resto.length));
  return { ...ficha, secoes: [...resto.slice(0, destino), secao, ...resto.slice(destino)] };
}

/** Apaga uma seção. As cartas dela vão para o fim da primeira seção que sobrar; a última seção não pode ser apagada. */
export function semSecao(ficha: Ficha, secaoId: string): Ficha {
  const secao = ficha.secoes.find((s) => s.id === secaoId);
  if (!secao || ficha.secoes.length <= 1) {
    return ficha;
  }
  const resto = ficha.secoes.filter((s) => s.id !== secaoId);
  const [primeira, ...outras] = resto;
  return { ...ficha, secoes: [{ ...primeira, cartas: [...primeira.cartas, ...secao.cartas] }, ...outras] };
}

/** Acrescenta uma classe do compêndio no nível 1, se ainda houver nível livre. */
export function comClasse(ficha: Ficha, compendio: EstadoCompendio, classeId: string): Ficha {
  const classe = compendio.entradas[classeId];
  if (
    !classe ||
    classe.tipo !== 'classe' ||
    ficha.classes.some((c) => c.entradaId === classeId) ||
    nivelTotal(ficha) >= NIVEL_MAXIMO
  ) {
    return ficha;
  }
  return {
    ...ficha,
    entradas: { ...ficha.entradas, ...copiasDe(compendio, classe) },
    classes: [...ficha.classes, { entradaId: classeId, nivel: 1 }],
  };
}

/** Muda o nível de uma classe, sem deixar o total passar do máximo. */
export function comNivel(ficha: Ficha, classeId: string, nivel: number): Ficha {
  const outros = ficha.classes.filter((c) => c.entradaId !== classeId).reduce((s, c) => s + c.nivel, 0);
  const permitido = Math.max(1, Math.min(Math.round(nivel), NIVEL_MAXIMO - outros));
  return {
    ...ficha,
    classes: ficha.classes.map((c) => (c.entradaId === classeId ? { ...c, nivel: permitido } : c)),
  };
}

export function semClasse(ficha: Ficha, classeId: string): Ficha {
  return semCopiasSoltas({ ...ficha, classes: ficha.classes.filter((c) => c.entradaId !== classeId) });
}

/** Troca a espécie ou o antecedente por um do compêndio, ou tira (`null`). */
export function comOrigem(
  ficha: Ficha,
  compendio: EstadoCompendio,
  campo: 'especieId' | 'antecedenteId',
  entradaId: string | null,
): Ficha {
  const tipo = campo === 'especieId' ? 'especie' : 'antecedente';
  const entrada = entradaId ? compendio.entradas[entradaId] : null;
  if (entradaId && (!entrada || entrada.tipo !== tipo)) {
    return ficha;
  }
  const sem = { ...ficha, [campo]: null };
  if (!entrada) {
    return semCopiasSoltas(sem);
  }
  return semCopiasSoltas({ ...sem, entradas: { ...sem.entradas, ...copiasDe(compendio, entrada) }, [campo]: entrada.id });
}

/** O dado de vida de cada nível, na ordem: a primeira classe primeiro. */
export function dadosDeVida(ficha: Ficha): number[] {
  const dados: number[] = [];
  for (const c of ficha.classes) {
    const classe = entradaDaFicha(ficha, c.entradaId, 'classe');
    if (classe) {
      dados.push(...Array<number>(c.nivel).fill(classe.dados.dadoVida));
    }
  }
  return dados;
}

/**
 * Os PV que os dados de vida dão em cada nível: o dado cheio no 1º, e depois a média
 * (metade do dado + 1), a menos que a ficha tenha o valor rolado daquele nível.
 */
export function pvPorNivel(ficha: Ficha): { readonly dado: number; readonly valor: number; readonly rolado: boolean }[] {
  return dadosDeVida(ficha).map((dado, i) => {
    const rolado = ficha.pvPorNivel[i];
    if (rolado !== null && rolado !== undefined) {
      return { dado, valor: rolado, rolado: true };
    }
    return { dado, valor: i === 0 ? dado : Math.floor(dado / 2) + 1, rolado: false };
  });
}

function editarFicha(estado: EstadoFichas, nova: Ficha): EstadoFichas {
  const atual = estado.fichas[nova.id];
  if (!atual || atual.tipo !== nova.tipo || JSON.stringify(atual) === JSON.stringify(nova)) {
    return estado;
  }
  return { fichas: { ...estado.fichas, [nova.id]: nova } };
}

export function aplicarAcaoFichas(estado: EstadoFichas, acao: AcaoFichas): EstadoFichas {
  switch (acao.tipo) {
    case 'CriarFicha':
      return acao.ficha.id in estado.fichas
        ? estado
        : { fichas: { ...estado.fichas, [acao.ficha.id]: acao.ficha } };
    case 'EditarFicha':
      return editarFicha(estado, acao.ficha);
    case 'EditarFichas':
      // Se alguma ficha não existe (ou mudaria de tipo), nada muda: é tudo ou nada.
      if (acao.fichas.some((f) => estado.fichas[f.id]?.tipo !== f.tipo)) {
        return estado;
      }
      return acao.fichas.reduce(editarFicha, estado);
    case 'RemoverFicha': {
      if (!(acao.fichaId in estado.fichas)) {
        return estado;
      }
      const fichas = { ...estado.fichas };
      delete fichas[acao.fichaId];
      return { fichas };
    }
    case 'CarregarFichas':
      return acao.estado;
  }
}

/** As fichas em ordem alfabética, sem diferenciar maiúsculas. */
export function fichasEmOrdem(estado: EstadoFichas): Ficha[] {
  return Object.values(estado.fichas).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

export type LojaFichas = LojaComHistorico<EstadoFichas, AcaoFichas>;

/** `obterConferencia` traz o que as regras da campanha dizem, como se os jogadores podem criar personagens. */
export function criarLojaFichas(
  inicial: EstadoFichas = criarFichasVazias(),
  opcoes: OpcoesRegistro = {},
  obterConferencia: () => OpcoesDaConferencia = () => ({}),
): LojaFichas {
  return criarLojaComHistorico(
    {
      inicial,
      aplicar: aplicarAcaoFichas,
      eventoDesfazer: 'DesfazerFichas',
      eventoRefazer: 'RefazerFichas',
      conferir: (antes, depois, autorId) => conferirFichas(antes, depois, autorId, obterConferencia()),
    },
    opcoes,
  );
}

export function atributosValidos(valores: Readonly<Record<string, number>>): boolean {
  return ATRIBUTOS.every((a) => Number.isInteger(valores[a]) && valores[a] >= 1 && valores[a] <= 30);
}

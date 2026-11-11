/**
 * As regras da noite no acampamento, como dados editáveis pelo mestre: quantos turnos, quanto
 * descanso cada turno vale, as ações que os jogadores escolhem e a chance de encontros.
 * Fica separado de `noite.ts` (que resolve os turnos) para as regras não dependerem das fichas.
 */
import { ehObjeto, ErroDeFormato, exigir } from './leitura';

/** O que cada ação faz ao resolver o turno. */
export const TIPOS_ACAO_NOTURNA = ['descanso', 'vigia', 'furto', 'pericia', 'estudo', 'livre'] as const;
export type TipoAcaoNoturna = (typeof TIPOS_ACAO_NOTURNA)[number];

export const ROTULO_TIPO_ACAO_NOTURNA: Readonly<Record<TipoAcaoNoturna, string>> = {
  descanso: 'Descansar (conta para o descanso)',
  vigia: 'Vigiar (evita a surpresa e protege de furtos)',
  furto: 'Furtar outro personagem do grupo',
  pericia: 'Teste de perícia (o jogador escolhe qual)',
  estudo: 'Estudar (idioma, ou magia de um livro ou pergaminho)',
  livre: 'Ação livre (texto para o mestre)',
};

export interface AcaoNoturna {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly tipo: TipoAcaoNoturna;
}

export interface RegrasDaNoite {
  /** Turnos de cada noite. */
  readonly turnos: number;
  /** No acampamento: turnos descansando para um descanso curto e para um longo. */
  readonly turnosParaCurto: number;
  readonly turnosParaLongo: number;
  /** No abrigo (estalagem, casa), a cama é melhor: bastam estes turnos para o descanso longo. */
  readonly turnosParaLongoNoAbrigo: number;
  readonly acoes: readonly AcaoNoturna[];
  /** Chance de um encontro em cada turno, em %, por tag de terreno do hex; vale a maior. No abrigo, nenhuma. */
  readonly chanceDeEncontro: Readonly<Record<string, number>>;
  /** A chance num hex sem nenhuma tag com chance. */
  readonly chancePadrao: number;
  /**
   * A etiqueta que marca, no compêndio, um veículo fechado. Se um membro tem um veículo assim
   * e cabem todos nele, o grupo nunca é surpreendido.
   */
  readonly etiquetaVeiculoFechado: string;
}

export const REGRAS_DA_NOITE_PADRAO: RegrasDaNoite = {
  turnos: 3,
  turnosParaCurto: 1,
  turnosParaLongo: 2,
  turnosParaLongoNoAbrigo: 1,
  acoes: [
    { id: 'descansar', nome: 'Descansar', descricao: 'Dormir. Um turno vale descanso curto; dois, longo (na estalagem, um já é longo).', tipo: 'descanso' },
    { id: 'vigiar', nome: 'Vigiar', descricao: 'Ficar de guarda: o grupo não é surpreendido e os furtos ficam mais difíceis.', tipo: 'vigia' },
    { id: 'furtar', nome: 'Furtar', descricao: 'Tentar pegar um item de outro personagem do grupo, às escondidas.', tipo: 'furto' },
    { id: 'pericia', nome: 'Usar uma perícia', descricao: 'Caçar, cuidar de alguém, explorar os arredores… O mestre narra o resultado.', tipo: 'pericia' },
    { id: 'estudar', nome: 'Estudar', descricao: 'Aprender um idioma, ou uma magia de um livro ou pergaminho que o personagem tenha.', tipo: 'estudo' },
    { id: 'livre', nome: 'Outra coisa', descricao: 'Descreva para o mestre o que o personagem faz.', tipo: 'livre' },
  ],
  chanceDeEncontro: { campo: 5, floresta: 10, colina: 10, montanha: 10, pantano: 15, deserto: 5, dunas: 5, povoado: 0 },
  chancePadrao: 5,
  etiquetaVeiculoFechado: 'Veículo fechado',
};

/** As ações que valem num lugar: no abrigo não há vigia (nem encontros). */
export function acoesDoLugar(noite: RegrasDaNoite, lugar: 'acampamento' | 'abrigo'): AcaoNoturna[] {
  return noite.acoes.filter((a) => lugar === 'acampamento' || a.tipo !== 'vigia');
}

/** Os problemas destas regras, para a tela Regras recusar uma mudança ruim. */
export function problemasNaNoite(noite: RegrasDaNoite): { readonly onde: string; readonly erro: string }[] {
  const problemas: { onde: string; erro: string }[] = [];
  const inteiro = (n: number, minimo: number) => Number.isInteger(n) && n >= minimo;
  if (!inteiro(noite.turnos, 1) || noite.turnos > 12) {
    problemas.push({ onde: 'Turnos da noite', erro: 'Use um número inteiro de 1 a 12.' });
  }
  for (const [campo, nome] of [
    ['turnosParaCurto', 'Turnos para o descanso curto'],
    ['turnosParaLongo', 'Turnos para o descanso longo'],
    ['turnosParaLongoNoAbrigo', 'Turnos para o descanso longo no abrigo'],
  ] as const) {
    if (!inteiro(noite[campo], 1)) {
      problemas.push({ onde: nome, erro: 'Use um número inteiro, 1 ou mais.' });
    }
  }
  if (noite.turnosParaCurto > noite.turnosParaLongo) {
    problemas.push({ onde: 'Turnos para o descanso curto', erro: 'O curto não pode pedir mais turnos que o longo.' });
  }
  if (noite.acoes.length === 0) {
    problemas.push({ onde: 'Ações da noite', erro: 'Deixe ao menos uma ação.' });
  }
  if (!noite.acoes.some((a) => a.tipo === 'descanso')) {
    problemas.push({ onde: 'Ações da noite', erro: 'Deixe ao menos uma ação de descansar.' });
  }
  const ids = new Set<string>();
  for (const acao of noite.acoes) {
    if (acao.id === '' || ids.has(acao.id)) {
      problemas.push({ onde: `Ação "${acao.nome}"`, erro: 'O nome interno está vazio ou repetido.' });
    }
    ids.add(acao.id);
    if (acao.nome.trim() === '') {
      problemas.push({ onde: 'Ações da noite', erro: 'Toda ação precisa de um nome.' });
    }
  }
  for (const [tag, chance] of Object.entries({ padrão: noite.chancePadrao, ...noite.chanceDeEncontro })) {
    if (!Number.isFinite(chance) || chance < 0 || chance > 100) {
      problemas.push({ onde: `Chance de encontro (${tag})`, erro: 'Use uma porcentagem de 0 a 100.' });
    }
  }
  return problemas;
}

/** Lê as regras da noite guardadas; regras de antes da Fase 5.5 não as têm e ganham as padrão. */
export function lerNoite(valor: unknown, padrao: RegrasDaNoite): RegrasDaNoite {
  if (valor === undefined) {
    return padrao;
  }
  const onde = 'A noite no acampamento';
  exigir(ehObjeto(valor), `${onde} não é válida.`);
  const numero = (campo: string) => {
    const n = valor[campo];
    exigir(typeof n === 'number' && Number.isFinite(n), `${onde}: "${campo}" precisa ser um número.`);
    return n as number;
  };
  const texto = (d: Record<string, unknown>, campo: string, local: string) => {
    const t = d[campo];
    exigir(typeof t === 'string', `${local}: "${campo}" precisa ser um texto.`);
    return t as string;
  };
  exigir(Array.isArray(valor.acoes), `${onde} está sem as ações.`);
  exigir(ehObjeto(valor.chanceDeEncontro), `${onde} está sem as chances de encontro.`);
  const chances = valor.chanceDeEncontro;
  exigir(Object.values(chances).every((n) => typeof n === 'number'), `${onde}: as chances de encontro precisam ser números.`);
  const noite: RegrasDaNoite = {
    turnos: numero('turnos'),
    turnosParaCurto: numero('turnosParaCurto'),
    turnosParaLongo: numero('turnosParaLongo'),
    turnosParaLongoNoAbrigo: numero('turnosParaLongoNoAbrigo'),
    acoes: valor.acoes.map((a, i) => {
      const local = `A ação da noite nº ${i + 1}`;
      exigir(ehObjeto(a), `${local} não é válida.`);
      exigir((TIPOS_ACAO_NOTURNA as readonly unknown[]).includes(a.tipo), `${local}: o tipo é desconhecido.`);
      return { id: texto(a, 'id', local), nome: texto(a, 'nome', local), descricao: texto(a, 'descricao', local), tipo: a.tipo as TipoAcaoNoturna };
    }),
    chanceDeEncontro: { ...(chances as Record<string, number>) },
    chancePadrao: numero('chancePadrao'),
    etiquetaVeiculoFechado: texto(valor, 'etiquetaVeiculoFechado', onde),
  };
  const problemas = problemasNaNoite(noite);
  if (problemas.length > 0) {
    throw new ErroDeFormato(`${onde}, "${problemas[0].onde}": ${problemas[0].erro}`);
  }
  return noite;
}

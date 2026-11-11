/**
 * O diário de viagem lido pelo mestre: as linhas guardadas no grupo viram dias, com um resumo
 * de cada dia e um texto claro para cada acontecimento. Só monta textos; quem guarda o diário
 * é o grupo (`grupo.ts`), e quem desenha é a tela.
 */
import { formatarDuracao, formatarRelogio, MINUTOS_POR_DIA, type EntradaDaViagem } from './grupo';
import type { CoordHex } from './hex';
import type { ParteDoTempo, RegrasDeViagem } from './viagem';

export type CategoriaDoDiario = 'passos' | 'descansos' | 'tempo' | 'posicionamentos' | 'anotacoes';

/** As categorias na ordem do filtro, com o nome mostrado. */
export const CATEGORIAS_DO_DIARIO: readonly { readonly id: CategoriaDoDiario; readonly nome: string }[] = [
  { id: 'passos', nome: 'Passos' },
  { id: 'descansos', nome: 'Descansos' },
  { id: 'tempo', nome: 'Tempo' },
  { id: 'posicionamentos', nome: 'Posicionamentos' },
  { id: 'anotacoes', nome: 'Anotações' },
];

export interface LinhaDoDiario {
  readonly id: number;
  readonly categoria: CategoriaDoDiario;
  readonly icone: string;
  /** "08:00", ou "08:00 → 10:00" quando o acontecimento gastou tempo. */
  readonly hora: string;
  readonly texto: string;
  /** A conta ou o complemento, como "2 h · ritmo normal · Floresta ×2"; vazio quando não há. */
  readonly detalhe: string;
  readonly autor: string;
  /** Onde aconteceu, para levar a câmera até lá; `null` com o grupo fora do mapa. */
  readonly coord: CoordHex | null;
}

export interface DiaDoDiario {
  readonly dia: number;
  /** Conta todo o dia, mesmo as linhas escondidas pelo filtro. */
  readonly minutosViajados: number;
  readonly hexesPercorridos: number;
  readonly descansos: number;
  readonly linhas: readonly LinhaDoDiario[];
}

/** O que o diário precisa saber de fora para escrever os nomes. */
export interface NomesDoDiario {
  /** O nome dado ao hex no painel, ou vazio. */
  readonly nomeDoHex: (coord: CoordHex) => string;
  readonly nomeDoAutor: (participanteId: string) => string;
  readonly viagem: RegrasDeViagem;
}

const diaDe = (relogio: number) => Math.floor(relogio / MINUTOS_POR_DIA) + 1;

/** "08:00", sem o dia. */
function horaDoDia(relogio: number): string {
  return formatarRelogio(relogio).split(', ')[1];
}

/** "08:00 → 10:00"; se terminar em outro dia, "20:00 → Dia 2, 08:00". */
function intervalo(inicio: number, fim: number): string {
  if (fim === inicio) {
    return horaDoDia(inicio);
  }
  return `${horaDoDia(inicio)} → ${diaDe(fim) === diaDe(inicio) ? horaDoDia(fim) : formatarRelogio(fim)}`;
}

const numero = (n: number) => String(Number(n.toFixed(2))).replace('.', ',');

/** Uma parte da conta, como na explicação do passo; a base fica de fora (o ritmo já aparece). */
function textoDaParte(parte: ParteDoTempo): string | null {
  if (parte.tipo === 'base') {
    return null;
  }
  if (parte.tipo === 'velocidade') {
    return `${parte.texto}: velocidade ×${numero(parte.valor)}`;
  }
  // "Floresta, sem penalidade (guia: Lyra)" já diz tudo; o ×1 não acrescenta nada.
  return parte.valor === 1 ? parte.texto : `${parte.texto} ×${numero(parte.valor)}`;
}

/** "Floresta Sombria (2, -1)" ou só "(2, -1)" num hex sem nome. */
export function rotuloDoHex(coord: CoordHex, nome: string): string {
  const posicao = `(${coord.q}, ${coord.r})`;
  return nome.trim() ? `${nome.trim()} ${posicao}` : posicao;
}

/** Uma linha do diário em texto, com onde aconteceu. */
export function linhaDoDiario(entrada: EntradaDaViagem, nomes: NomesDoDiario): LinhaDoDiario {
  const hex = (coord: CoordHex) => rotuloDoHex(coord, nomes.nomeDoHex(coord));
  const inicio = entrada.antes.relogio;
  const fim = entrada.relogioDepois;
  const base = { id: entrada.id, autor: nomes.nomeDoAutor(entrada.autorId), coord: entrada.antes.posicao };
  const a = entrada.acontecimento;

  switch (a.tipo) {
    case 'passo': {
      const ritmo = nomes.viagem.ritmos.find((r) => r.id === a.ritmo)?.nome ?? a.ritmo;
      // Com a conta guardada, vale o que de fato pesou (guias, montarias, veículos).
      // Passos antigos só têm as tags: só as que mudaram o tempo, sem "Campo ×1".
      const partes = a.conta
        ? a.conta.map(textoDaParte).filter((t): t is string => t !== null)
        : null;
      const tags = partes ?? a.tags.flatMap((id) => {
        const tag = nomes.viagem.tags.find((t) => t.id === id);
        if (!tag) {
          return [id];
        }
        return tag.multiplicador === 1 ? [] : [`${tag.nome} ×${String(tag.multiplicador).replace('.', ',')}`];
      });
      return {
        ...base,
        categoria: 'passos',
        icone: '🥾',
        hora: intervalo(inicio, fim),
        texto: `Andou de ${hex(a.de)} para ${hex(a.para)}`,
        detalhe: [formatarDuracao(a.minutos), `ritmo ${ritmo.toLowerCase()}`, ...tags].join(' · '),
        coord: a.para,
      };
    }
    case 'descansou': {
      const lugar = a.lugar === 'abrigo' ? 'no abrigo' : 'no acampamento';
      return {
        ...base,
        categoria: 'descansos',
        icone: '💤',
        hora: intervalo(inicio, fim),
        texto: `Descanso ${a.descanso} ${lugar}${a.nomeDoLugar ? ` "${a.nomeDoLugar}"` : ''}`,
        detalhe: formatarDuracao(fim - inicio),
      };
    }
    case 'avancou':
      return {
        ...base,
        categoria: 'tempo',
        icone: '⏩',
        hora: intervalo(inicio, fim),
        texto: a.ateAManha ? 'Tempo avançado até a manhã' : `Tempo avançado: +${formatarDuracao(fim - inicio)}`,
        detalhe: a.ateAManha ? formatarDuracao(fim - inicio) : '',
      };
    case 'acertouRelogio':
      return {
        ...base,
        categoria: 'tempo',
        icone: '🕐',
        hora: horaDoDia(inicio),
        texto: `Relógio acertado para ${formatarRelogio(fim)}`,
        detalhe: '',
      };
    case 'posicionou':
      return {
        ...base,
        categoria: 'posicionamentos',
        icone: '📌',
        hora: horaDoDia(inicio),
        texto: a.para ? `Grupo posto em ${hex(a.para)}` : 'Grupo tirado do mapa',
        detalhe: '',
        coord: a.para ?? entrada.antes.posicao,
      };
    case 'anotou':
      return { ...base, categoria: 'anotacoes', icone: '📝', hora: horaDoDia(inicio), texto: a.texto, detalhe: '' };
  }
}

/**
 * O diário em dias, do mais recente para o mais antigo; dentro do dia, na ordem dos
 * acontecimentos. O dia de cada linha é o do momento em que ela começou. Dias sem nenhuma
 * linha das categorias escolhidas não aparecem.
 */
export function diarioPorDias(
  historico: readonly EntradaDaViagem[],
  nomes: NomesDoDiario,
  categorias: ReadonlySet<CategoriaDoDiario> = new Set(CATEGORIAS_DO_DIARIO.map((c) => c.id)),
): DiaDoDiario[] {
  const porDia = new Map<number, { minutos: number; hexes: number; descansos: number; linhas: LinhaDoDiario[] }>();
  for (const entrada of historico) {
    const dia = diaDe(entrada.antes.relogio);
    const atual = porDia.get(dia) ?? { minutos: 0, hexes: 0, descansos: 0, linhas: [] };
    porDia.set(dia, atual);
    const a = entrada.acontecimento;
    if (a.tipo === 'passo') {
      atual.minutos += a.minutos;
      atual.hexes += 1;
    } else if (a.tipo === 'descansou') {
      atual.descansos += 1;
    }
    const linha = linhaDoDiario(entrada, nomes);
    if (categorias.has(linha.categoria)) {
      atual.linhas.push(linha);
    }
  }
  return [...porDia.entries()]
    .filter(([, d]) => d.linhas.length > 0)
    .sort(([a], [b]) => b - a)
    .map(([dia, d]) => ({
      dia,
      minutosViajados: d.minutos,
      hexesPercorridos: d.hexes,
      descansos: d.descansos,
      linhas: d.linhas,
    }));
}

/** "4 h de viagem · 2 hexes · 1 descanso"; vazio num dia sem viagem nem descanso. */
export function resumoDoDia(dia: DiaDoDiario): string {
  const partes: string[] = [];
  if (dia.hexesPercorridos > 0) {
    partes.push(`${formatarDuracao(dia.minutosViajados)} de viagem`);
    partes.push(dia.hexesPercorridos === 1 ? '1 hex' : `${dia.hexesPercorridos} hexes`);
  }
  if (dia.descansos > 0) {
    partes.push(dia.descansos === 1 ? '1 descanso' : `${dia.descansos} descansos`);
  }
  return partes.join(' · ');
}

/** O diário inteiro em texto simples, do primeiro dia ao último, para colar num resumo de sessão. */
export function diarioEmTexto(historico: readonly EntradaDaViagem[], nomes: NomesDoDiario): string {
  const dias = diarioPorDias(historico, nomes).reverse();
  const blocos = dias.map((dia) => {
    const resumo = resumoDoDia(dia);
    const titulo = resumo ? `Dia ${dia.dia} (${resumo})` : `Dia ${dia.dia}`;
    const linhas = dia.linhas.map(
      (l) => `${l.hora}  ${l.texto}${l.detalhe ? ` (${l.detalhe})` : ''} [${l.autor}]`,
    );
    return [titulo, ...linhas].join('\n');
  });
  return ['Diário de viagem', ...blocos].join('\n\n');
}

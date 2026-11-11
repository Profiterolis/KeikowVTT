import { chaveHex, distanciaHex, type ChaveHex, type CoordHex } from './hex';
import { INFORMACAO_VAZIA, type EstadoMapa, type Hex } from './mapa';

/** Quem pode ver uma informação: todos, só o mestre, ou o mestre e os jogadores escolhidos. */
export type Visibilidade =
  | { readonly tipo: 'todos' }
  | { readonly tipo: 'mestre' }
  | { readonly tipo: 'jogadores'; readonly ids: readonly string[] };

export const VISIVEL_A_TODOS: Visibilidade = { tipo: 'todos' };
export const SO_MESTRE: Visibilidade = { tipo: 'mestre' };

/** Mesmo valor de `ID_MESTRE`. Repetido aqui para evitar que os arquivos dependam um do outro em círculo. */
const MESTRE = 'mestre';

export function ehMestre(participanteId: string): boolean {
  return participanteId === MESTRE;
}

/** O mestre vê tudo; os jogadores, o que é de todos ou foi mostrado a eles. */
export function podeVer(visibilidade: Visibilidade, participanteId: string): boolean {
  switch (visibilidade.tipo) {
    case 'todos':
      return true;
    case 'mestre':
      return participanteId === MESTRE;
    case 'jogadores':
      return participanteId === MESTRE || visibilidade.ids.includes(participanteId);
  }
}

export function mesmaVisibilidade(a: Visibilidade, b: Visibilidade): boolean {
  if (a.tipo !== 'jogadores' || b.tipo !== 'jogadores') {
    return a.tipo === b.tipo;
  }
  return a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
}

/** Só para os jogadores escolhidos (e o mestre). Sem nenhum jogador, é o mesmo que só o mestre. */
export function paraJogadores(ids: readonly string[]): Visibilidade {
  return { tipo: 'jogadores', ids: [...new Set(ids)] };
}

/** O hex onde o grupo está: tudo o que este participante pode ver. */
function hexCompleto(hex: Hex, participanteId: string): Hex {
  return {
    ...hex,
    revelado: false,
    notas: hex.notas.filter((nota) => podeVer(nota.visibilidade, participanteId)),
  };
}

/** Um hex avistado de longe: só terreno e decorações. */
function hexAvistado(hex: Hex): Hex {
  return { ...hex, ...INFORMACAO_VAZIA, revelado: false };
}

/** O quanto os jogadores conhecem de um hex: tudo o que é público, só a paisagem, ou nada. */
export type NivelDeVisao = 'completo' | 'avistado' | 'oculto';

function chavesDePosicao(posicoes: readonly CoordHex[]): ReadonlySet<ChaveHex> {
  return new Set(posicoes.map(chaveHex));
}

/** Hexes à vista além da posição: os vizinhos, ou mais longe com um alcance maior. */
function noAlcance(hex: Hex, posicoes: readonly CoordHex[], alcance: number): boolean {
  return posicoes.some((p) => distanciaHex(p, hex.coord) <= alcance);
}

function calcularNivel(hex: Hex, posicoes: ReadonlySet<ChaveHex>, listaDePosicoes: readonly CoordHex[], alcance: number): NivelDeVisao {
  const chave = chaveHex(hex.coord);
  if (posicoes.has(chave)) {
    return 'completo';
  }
  return hex.revelado || noAlcance(hex, listaDePosicoes, alcance) ? 'avistado' : 'oculto';
}

/** `alcance` 1 são os 6 vizinhos; quem voa pode enxergar mais longe. */
export function nivelDeVisao(hex: Hex, posicoes: readonly CoordHex[], alcance = 1): NivelDeVisao {
  return calcularNivel(hex, chavesDePosicao(posicoes), posicoes, alcance);
}

/**
 * O mapa como um jogador pode vê-lo, a partir de onde o grupo está: o hex da posição,
 * os hexes ao alcance da visão dele (os 6 vizinhos, com alcance 1) e os revelados pelo mestre.
 * Os demais hexes simplesmente não existem aqui. Sem `participanteId`, ficam só as notas de todos.
 */
export function visaoDoJogador(
  estado: EstadoMapa,
  posicoes: readonly CoordHex[],
  participanteId = '',
  alcance = 1,
): EstadoMapa {
  const chavesPosicao = chavesDePosicao(posicoes);
  const hexes: Record<ChaveHex, Hex> = {};

  for (const hex of Object.values(estado.hexes)) {
    const nivel = calcularNivel(hex, chavesPosicao, posicoes, alcance);
    if (nivel !== 'oculto') {
      hexes[chaveHex(hex.coord)] = nivel === 'completo' ? hexCompleto(hex, participanteId) : hexAvistado(hex);
    }
  }

  return { ...estado, hexes };
}

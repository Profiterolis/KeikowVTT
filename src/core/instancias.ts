/**
 * Instâncias táticas (Fase 6): mapas separados do mapa-mundi, onde acontecem a exploração e os combates.
 * Uma instância fica presa a um hex ou é universal (serve a qualquer hex). Não tem grid: o movimento
 * é livre, e a escala (metros por pixel) serve à régua, à luz e à visão.
 *
 * Aqui também fica a cena de cada jogador: o mapa-mundi ou uma instância. Só o mestre leva os
 * jogadores de uma cena a outra. O próprio mestre passeia por qualquer cena sem levar ninguém,
 * então a cena dele não é guardada.
 *
 * Os tokens, as paredes, a luz, os itens e as regiões chegam nos passos seguintes da fase,
 * cada um como um campo novo da instância.
 */
import type { CoordHex } from './hex';
import { chaveHex } from './hex';
import { criarLojaComHistorico, type LojaComHistorico } from './lojaHistorico';
import type { EstadoMapa } from './mapa';
import { soOMestre } from './permissoes';
import type { OpcoesRegistro } from './registro';
import { ehMestre } from './visibilidade';

/** Onde um jogador está: no mapa-mundi ou dentro de uma instância. */
export type Cena = { readonly tipo: 'mapa' } | { readonly tipo: 'instancia'; readonly instanciaId: string };

export const CENA_MAPA: Cena = { tipo: 'mapa' };

export function cenaNaInstancia(instanciaId: string): Cena {
  return { tipo: 'instancia', instanciaId };
}

export function mesmaCena(a: Cena, b: Cena): boolean {
  return a.tipo === 'mapa' ? b.tipo === 'mapa' : b.tipo === 'instancia' && a.instanciaId === b.instanciaId;
}

export interface Instancia {
  readonly id: string;
  readonly nome: string;
  /** Só o mestre lê: o que há ali, o que pode acontecer. */
  readonly descricao: string;
  /** O hex a que ela pertence, ou `null` para uma instância universal. */
  readonly hex: CoordHex | null;
  /** Id da imagem de fundo (`core/imagens.ts`), ou `null` enquanto não houver. */
  readonly imagem: string | null;
  /** Tamanho do mapa em pixels; com imagem, o tamanho dela. */
  readonly largura: number;
  readonly altura: number;
  /** Quantos metros cada pixel representa. */
  readonly metrosPorPixel: number;
}

export interface EstadoInstancias {
  readonly instancias: Readonly<Record<string, Instancia>>;
  /** A cena de cada jogador, pelo id do participante. Quem não está aqui fica na cena inicial. */
  readonly cenas: Readonly<Record<string, Cena>>;
  /** Para onde vai quem ainda não tem cena, como um jogador novo. */
  readonly cenaInicial: Cena;
}

/** O tamanho comum de um quadrado de mapa de batalha: 100 pixels = 1,5 m. */
export const METROS_POR_PIXEL_PADRAO = 0.015;
/** Sem imagem, a instância tem 45 m × 30 m na escala padrão. */
export const LARGURA_PADRAO = 3000;
export const ALTURA_PADRAO = 2000;
/** Limites para um número digitado errado não criar um mapa absurdo. */
export const LADO_MAXIMO = 50_000;
export const METROS_POR_PIXEL_MINIMO = 0.0001;
export const METROS_POR_PIXEL_MAXIMO = 100;

export function criarInstanciasVazias(): EstadoInstancias {
  return { instancias: {}, cenas: {}, cenaInicial: CENA_MAPA };
}

/** Uma instância nova, vazia, com os valores padrão. */
export function novaInstancia(id: string, nome: string, hex: CoordHex | null): Instancia {
  return {
    id,
    nome,
    descricao: '',
    hex,
    imagem: null,
    largura: LARGURA_PADRAO,
    altura: ALTURA_PADRAO,
    metrosPorPixel: METROS_POR_PIXEL_PADRAO,
  };
}

/** O que está errado numa instância, ou `null`. A loja recusa instâncias com problema. */
export function problemaNaInstancia(instancia: Instancia): string | null {
  if (instancia.id === '') {
    return 'A instância está sem id.';
  }
  const ladoValido = (lado: number) => Number.isFinite(lado) && lado >= 1 && lado <= LADO_MAXIMO;
  if (!ladoValido(instancia.largura) || !ladoValido(instancia.altura)) {
    return `O tamanho do mapa precisa ficar entre 1 e ${LADO_MAXIMO} pixels de cada lado.`;
  }
  const escala = instancia.metrosPorPixel;
  if (!Number.isFinite(escala) || escala < METROS_POR_PIXEL_MINIMO || escala > METROS_POR_PIXEL_MAXIMO) {
    return 'A escala do mapa não é válida.';
  }
  if (instancia.hex && (!Number.isInteger(instancia.hex.q) || !Number.isInteger(instancia.hex.r))) {
    return 'O hex da instância não é válido.';
  }
  return null;
}

export type MudancasNaInstancia = Partial<Omit<Instancia, 'id'>>;

export type AcaoInstancias =
  | { readonly tipo: 'CriarInstancia'; readonly instancia: Instancia }
  /** Muda só os campos informados. */
  | { readonly tipo: 'EditarInstancia'; readonly instanciaId: string; readonly mudancas: MudancasNaInstancia }
  /** Uma cópia nova, com o estado atual: serve para usar o mesmo mapa "zerado" em outro lugar. */
  | { readonly tipo: 'DuplicarInstancia'; readonly instanciaId: string; readonly novoId: string }
  /** Quem estava nela volta ao mapa-mundi; se era a cena inicial, a cena inicial volta a ser o mapa-mundi. */
  | { readonly tipo: 'ApagarInstancia'; readonly instanciaId: string }
  /** Leva um ou vários jogadores para uma cena. */
  | { readonly tipo: 'LevarParaCena'; readonly participanteIds: readonly string[]; readonly cena: Cena }
  | { readonly tipo: 'DefinirCenaInicial'; readonly cena: Cena }
  | { readonly tipo: 'CarregarInstancias'; readonly estado: EstadoInstancias };

/** Uma cena que aponta para uma instância que não existe vira o mapa-mundi. */
function cenaValida(estado: EstadoInstancias, cena: Cena): Cena {
  return cena.tipo === 'instancia' && !(cena.instanciaId in estado.instancias) ? CENA_MAPA : cena;
}

/** Onde está um jogador agora. */
export function cenaDe(estado: EstadoInstancias, participanteId: string): Cena {
  return cenaValida(estado, estado.cenas[participanteId] ?? estado.cenaInicial);
}

/** A instância em que o jogador está, ou `null` se ele está no mapa-mundi. */
export function instanciaDe(estado: EstadoInstancias, participanteId: string): Instancia | null {
  const cena = cenaDe(estado, participanteId);
  return cena.tipo === 'instancia' ? estado.instancias[cena.instanciaId] : null;
}

/** Os participantes (entre os informados) que estão numa cena. */
export function quemEstaNaCena(estado: EstadoInstancias, cena: Cena, participanteIds: readonly string[]): string[] {
  return participanteIds.filter((id) => !ehMestre(id) && mesmaCena(cenaDe(estado, id), cena));
}

/** As instâncias em ordem alfabética, sem diferenciar maiúsculas. */
export function instanciasEmOrdem(estado: EstadoInstancias): Instancia[] {
  return Object.values(estado.instancias).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
}

/** As instâncias presas a um hex. */
export function instanciasDoHex(estado: EstadoInstancias, coord: CoordHex): Instancia[] {
  const chave = chaveHex(coord);
  return instanciasEmOrdem(estado).filter((i) => i.hex !== null && chaveHex(i.hex) === chave);
}

/**
 * A ligação da instância com o mapa-mundi. Um hex apagado não apaga a instância:
 * ela guarda a coordenada até o mestre ligá-la a outro hex ou torná-la universal.
 */
export function situacaoDoHex(instancia: Instancia, mapa: EstadoMapa): 'universal' | 'noHex' | 'hexSemTerreno' {
  if (instancia.hex === null) {
    return 'universal';
  }
  return chaveHex(instancia.hex) in mapa.hexes ? 'noHex' : 'hexSemTerreno';
}

/** Metros que uma distância em pixels representa nesta instância. */
export function pixelsEmMetros(instancia: Instancia, pixels: number): number {
  return pixels * instancia.metrosPorPixel;
}

/** Um quadrado de mapa de batalha mede 1,5 m: a escala se acerta dizendo quantos pixels ele tem na imagem. */
export const METROS_DO_QUADRADO = 1.5;

/** Quantos pixels da imagem cabem em 1,5 m. */
export function pixelsPorQuadrado(instancia: Instancia): number {
  return METROS_DO_QUADRADO / instancia.metrosPorPixel;
}

/**
 * A escala (metros por pixel) a partir de uma medida: uma distância em pixels na imagem que
 * vale tantos metros no jogo. `null` se a medida não serve (zero, negativa, fora dos limites).
 */
export function escalaPelaMedida(pixels: number, metros: number): number | null {
  if (!Number.isFinite(pixels) || !Number.isFinite(metros) || pixels <= 0 || metros <= 0) {
    return null;
  }
  const escala = metros / pixels;
  return escala >= METROS_POR_PIXEL_MINIMO && escala <= METROS_POR_PIXEL_MAXIMO ? escala : null;
}

/** Uma mudança de cena de um jogador, para avisá-lo. */
export interface MudancaDeCena {
  readonly participanteId: string;
  readonly cena: Cena;
  /** "Cripta" ou "o mapa-mundi". */
  readonly destino: string;
}

/**
 * Quem, entre os participantes informados, mudou de cena de um estado para o outro: levado pelo
 * mestre, devolvido ao mapa-mundi porque a instância foi apagada ou pela cena inicial nova.
 */
export function mudancasDeCena(
  antes: EstadoInstancias,
  depois: EstadoInstancias,
  participanteIds: readonly string[],
): MudancaDeCena[] {
  return participanteIds
    .filter((id) => !ehMestre(id) && !mesmaCena(cenaDe(antes, id), cenaDe(depois, id)))
    .map((id) => {
      const cena = cenaDe(depois, id);
      const destino = cena.tipo === 'instancia' ? depois.instancias[cena.instanciaId].nome.trim() || 'Sem nome' : 'o mapa-mundi';
      return { participanteId: id, cena, destino };
    });
}

function comInstancia(estado: EstadoInstancias, instancia: Instancia): EstadoInstancias {
  return { ...estado, instancias: { ...estado.instancias, [instancia.id]: instancia } };
}

function mesmaInstancia(a: Instancia, b: Instancia): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Uma ação sem efeito, ou inválida, devolve o mesmo objeto. */
export function aplicarAcaoInstancias(estado: EstadoInstancias, acao: AcaoInstancias): EstadoInstancias {
  switch (acao.tipo) {
    case 'CriarInstancia': {
      if (acao.instancia.id in estado.instancias || problemaNaInstancia(acao.instancia)) {
        return estado;
      }
      return comInstancia(estado, acao.instancia);
    }
    case 'EditarInstancia': {
      const atual = estado.instancias[acao.instanciaId];
      if (!atual) {
        return estado;
      }
      const editada: Instancia = { ...atual, ...acao.mudancas, id: atual.id };
      if (mesmaInstancia(editada, atual) || problemaNaInstancia(editada)) {
        return estado;
      }
      return comInstancia(estado, editada);
    }
    case 'DuplicarInstancia': {
      const original = estado.instancias[acao.instanciaId];
      if (!original || acao.novoId === '' || acao.novoId in estado.instancias) {
        return estado;
      }
      return comInstancia(estado, { ...original, id: acao.novoId, nome: `${original.nome} (cópia)` });
    }
    case 'ApagarInstancia': {
      if (!(acao.instanciaId in estado.instancias)) {
        return estado;
      }
      const { [acao.instanciaId]: _apagada, ...instancias } = estado.instancias;
      const estavaNela = (cena: Cena) => cena.tipo === 'instancia' && cena.instanciaId === acao.instanciaId;
      const cenas = Object.fromEntries(
        Object.entries(estado.cenas).map(([id, cena]) => [id, estavaNela(cena) ? CENA_MAPA : cena]),
      );
      return { instancias, cenas, cenaInicial: estavaNela(estado.cenaInicial) ? CENA_MAPA : estado.cenaInicial };
    }
    case 'LevarParaCena': {
      if (acao.cena.tipo === 'instancia' && !(acao.cena.instanciaId in estado.instancias)) {
        return estado;
      }
      // A cena do mestre não é guardada: ele passeia por qualquer uma.
      const levados = acao.participanteIds.filter((id) => id !== '' && !ehMestre(id));
      const mudam = levados.filter((id) => !(id in estado.cenas) || !mesmaCena(estado.cenas[id], acao.cena));
      if (mudam.length === 0) {
        return estado;
      }
      return { ...estado, cenas: { ...estado.cenas, ...Object.fromEntries(mudam.map((id) => [id, acao.cena])) } };
    }
    case 'DefinirCenaInicial': {
      const naoExiste = acao.cena.tipo === 'instancia' && !(acao.cena.instanciaId in estado.instancias);
      if (naoExiste || mesmaCena(acao.cena, estado.cenaInicial)) {
        return estado;
      }
      return { ...estado, cenaInicial: acao.cena };
    }
    case 'CarregarInstancias':
      return acao.estado;
  }
}

/**
 * As instâncias como um participante pode recebê-las. O jogador recebe só a instância em que
 * está, sem a descrição; as outras não existem para ele, nem os nomes. Também não sabe onde
 * estão os outros jogadores. No online, é isto que o servidor manda a cada jogador.
 */
export function instanciasVistasPor(estado: EstadoInstancias, participanteId: string): EstadoInstancias {
  if (ehMestre(participanteId)) {
    return estado;
  }
  const cena = cenaDe(estado, participanteId);
  const atual = cena.tipo === 'instancia' ? estado.instancias[cena.instanciaId] : null;
  return {
    instancias: atual ? { [atual.id]: { ...atual, descricao: '' } } : {},
    cenas: { [participanteId]: cena },
    cenaInicial: cena,
  };
}

export type LojaInstancias = LojaComHistorico<EstadoInstancias, AcaoInstancias>;

/** Por enquanto, só o mestre muda as instâncias; os jogadores ganham ações nos passos seguintes. */
export function criarLojaInstancias(
  inicial: EstadoInstancias = criarInstanciasVazias(),
  opcoes: OpcoesRegistro = {},
): LojaInstancias {
  return criarLojaComHistorico(
    {
      inicial,
      aplicar: aplicarAcaoInstancias,
      coordDaAcao: (acao) => (acao.tipo === 'CriarInstancia' ? acao.instancia.hex : null),
      eventoDesfazer: 'DesfazerInstancias',
      eventoRefazer: 'RefazerInstancias',
      conferir: soOMestre('as instâncias'),
    },
    opcoes,
  );
}

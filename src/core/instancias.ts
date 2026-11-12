/**
 * Instâncias táticas (Fase 6): mapas separados do mapa-mundi, onde acontecem a exploração e os combates.
 * Uma instância fica presa a um hex ou é universal (serve a qualquer hex). Não tem grid: o movimento
 * é livre, e a escala (metros por pixel) serve à régua, à luz e à visão.
 *
 * Aqui também fica a cena de cada jogador: o mapa-mundi ou uma instância. Só o mestre leva os
 * jogadores de uma cena a outra. O próprio mestre passeia por qualquer cena sem levar ninguém,
 * então a cena dele não é guardada.
 *
 * Os tokens (passo 4), as paredes (passo 5) e a luz (passo 6) ficam dentro de cada instância; as
 * regras deles estão em `tokens.ts`, `paredes.ts`, `luz.ts` e `visaoTatica.ts`. Os itens e as regiões
 * chegam nos passos seguintes da fase, cada um como um campo novo da instância.
 */
import type { CoordHex } from './hex';
import { chaveHex } from './hex';
import { criarLojaComHistorico, type LojaComHistorico } from './lojaHistorico';
import type { EstadoMapa } from './mapa';
import type { OpcoesRegistro } from './registro';
import { abrirVao, normalizarParede, paredeVistaPeloJogador, problemaNaParede, type EstadoDaPorta, type Parede, type Ponto } from './paredes';
import {
  conferirInstancias,
  dentroDoMapa,
  problemaNoToken,
  SEM_FICHAS,
  tamanhoValido,
  type ContextoDasInstancias,
  type MudancasNoToken,
  type TokenNaInstancia,
} from './tokens';
import { ehMestre } from './visibilidade';
import {
  LUZES_DO_AMBIENTE,
  MODOS_DE_VISAO,
  problemaNaFonte,
  problemaNaLuz,
  type FonteDeLuz,
  type LuzDoAmbiente,
  type ModoDeVisao,
} from './luz';

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
  /** Os tokens no mapa, pelo id do token. */
  readonly tokens: Readonly<Record<string, TokenNaInstancia>>;
  /** Trava do mestre: nenhum jogador move tokens nem abre portas nesta instância. */
  readonly movimentoTravado: boolean;
  /** Paredes, portas e janelas, pelo id. */
  readonly paredes: Readonly<Record<string, Parede>>;
  /** A luz do ambiente: clara, penumbra, escuridão ou pela hora do relógio do mundo. */
  readonly luzAmbiente: LuzDoAmbiente;
  /** O que os jogadores veem fora da visão dos personagens. */
  readonly visao: ModoDeVisao;
  /** Fontes de luz postas pelo mestre (braseiros, lustres), pelo id. */
  readonly luzes: Readonly<Record<string, FonteDeLuz>>;
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
    tokens: {},
    movimentoTravado: false,
    paredes: {},
    luzAmbiente: 'clara',
    visao: 'escurecer',
    luzes: {},
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
  for (const [id, token] of Object.entries(instancia.tokens)) {
    const problema = id === token.id ? problemaNoToken(token) : 'Um token está guardado com o id errado.';
    if (problema) {
      return problema;
    }
  }
  for (const [id, parede] of Object.entries(instancia.paredes)) {
    const problema = id === parede.id ? problemaNaParede(parede) : 'Uma parede está guardada com o id errado.';
    if (problema) {
      return problema;
    }
  }
  for (const [id, fonte] of Object.entries(instancia.luzes)) {
    const problema = id === fonte.id ? problemaNaFonte(fonte) : 'Uma luz está guardada com o id errado.';
    if (problema) {
      return problema;
    }
  }
  if (!(LUZES_DO_AMBIENTE as readonly string[]).includes(instancia.luzAmbiente)) {
    return 'A luz do ambiente não é válida.';
  }
  if (!(MODOS_DE_VISAO as readonly string[]).includes(instancia.visao)) {
    return 'O modo da visão não é válido.';
  }
  const fichas = Object.values(instancia.tokens).map((t) => t.fichaId);
  if (new Set(fichas).size !== fichas.length) {
    return 'Uma ficha tem dois tokens na mesma instância.';
  }
  return null;
}

/** Os tokens, as paredes e as luzes mudam pelas ações próprias deles, não por aqui. */
export type MudancasNaInstancia = Partial<Omit<Instancia, 'id' | 'tokens' | 'paredes' | 'luzes'>>;

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
  /**
   * Põe o token de uma ficha no mapa. Se a ficha já tinha um token (nesta ou em outra instância),
   * ele sai de lá: uma criatura não está em dois lugares. `levar` são os jogadores que vão junto
   * para a instância (quem controla a ficha), no mesmo passo de desfazer.
   */
  | {
      readonly tipo: 'ColocarToken';
      readonly instanciaId: string;
      readonly token: TokenNaInstancia;
      readonly levar?: readonly string[];
    }
  /** `caminho`: os pontos onde o movimento mudou de direção ao deslizar nas paredes. */
  | {
      readonly tipo: 'MoverToken';
      readonly instanciaId: string;
      readonly tokenId: string;
      readonly x: number;
      readonly y: number;
      readonly caminho?: readonly Ponto[];
    }
  | { readonly tipo: 'EditarToken'; readonly instanciaId: string; readonly tokenId: string; readonly mudancas: MudancasNoToken }
  | { readonly tipo: 'TirarToken'; readonly instanciaId: string; readonly tokenId: string }
  /** Várias paredes de uma vez (uma linha desenhada ponto a ponto), num só passo de desfazer. */
  /**
   * `encaixe` (pixels): portas e janelas desenhadas sobre uma parede, a até essa distância da linha
   * dela, abrem um vão nela (`abrirVao`).
   */
  | {
      readonly tipo: 'CriarParedes';
      readonly instanciaId: string;
      readonly paredes: readonly Parede[];
      readonly encaixe?: number;
    }
  /** Troca as paredes informadas (pelo id), como ao arrastar uma ponta que várias compartilham. */
  | { readonly tipo: 'EditarParedes'; readonly instanciaId: string; readonly paredes: readonly Parede[] }
  | { readonly tipo: 'ApagarParedes'; readonly instanciaId: string; readonly paredeIds: readonly string[] }
  /** Abrir, fechar, trancar ou destrancar uma porta, ou torná-la secreta (ou revelá-la). */
  | {
      readonly tipo: 'MudarPorta';
      readonly instanciaId: string;
      readonly paredeId: string;
      readonly estado?: EstadoDaPorta;
      readonly secreta?: boolean;
    }
  /** Fontes de luz do mapa (só o mestre): pôr, trocar (mover, mudar os raios, ligar e desligar) e apagar. */
  | { readonly tipo: 'CriarLuz'; readonly instanciaId: string; readonly luz: FonteDeLuz }
  | { readonly tipo: 'EditarLuz'; readonly instanciaId: string; readonly luz: FonteDeLuz }
  | { readonly tipo: 'ApagarLuz'; readonly instanciaId: string; readonly luzId: string }
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

function mesmaInstancia(a: object, b: object): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A instância com os tokens trocados; uma instância que não existe não muda nada. */
function comTokens(
  estado: EstadoInstancias,
  instanciaId: string,
  mudar: (tokens: Readonly<Record<string, TokenNaInstancia>>, instancia: Instancia) => Readonly<Record<string, TokenNaInstancia>>,
): EstadoInstancias {
  const instancia = estado.instancias[instanciaId];
  if (!instancia) {
    return estado;
  }
  const tokens = mudar(instancia.tokens, instancia);
  return tokens === instancia.tokens ? estado : comInstancia(estado, { ...instancia, tokens });
}

/** A instância com as paredes trocadas; nada muda se a instância não existe ou se uma parede tem problema. */
function comParedes(
  estado: EstadoInstancias,
  instanciaId: string,
  mudar: (paredes: Readonly<Record<string, Parede>>) => Readonly<Record<string, Parede>>,
): EstadoInstancias {
  const instancia = estado.instancias[instanciaId];
  if (!instancia) {
    return estado;
  }
  const paredes = mudar(instancia.paredes);
  if (paredes === instancia.paredes || Object.values(paredes).some((p) => problemaNaParede(p))) {
    return estado;
  }
  return comInstancia(estado, { ...instancia, paredes });
}

/** A instância com as luzes trocadas; nada muda se a instância não existe ou se uma luz tem problema. */
function comLuzes(
  estado: EstadoInstancias,
  instanciaId: string,
  mudar: (luzes: Readonly<Record<string, FonteDeLuz>>, instancia: Instancia) => Readonly<Record<string, FonteDeLuz>>,
): EstadoInstancias {
  const instancia = estado.instancias[instanciaId];
  if (!instancia) {
    return estado;
  }
  const luzes = mudar(instancia.luzes, instancia);
  if (luzes === instancia.luzes || Object.values(luzes).some((l) => problemaNaFonte(l))) {
    return estado;
  }
  return comInstancia(estado, { ...instancia, luzes });
}

/** Mudou o tamanho do mapa: os tokens que ficariam fora voltam para a borda. */
function tokensDentroDoMapa(instancia: Instancia): Instancia {
  let mudou = false;
  const tokens = Object.fromEntries(
    Object.entries(instancia.tokens).map(([id, token]) => {
      const { x, y } = dentroDoMapa(instancia, token.x, token.y);
      if (x === token.x && y === token.y) {
        return [id, token];
      }
      mudou = true;
      return [id, { ...token, x, y }];
    }),
  );
  return mudou ? { ...instancia, tokens } : instancia;
}

/** O estado com o token na instância, tirando o token antigo da ficha (onde quer que esteja) e o que tiver o mesmo id. */
function comTokenPosto(estado: EstadoInstancias, instancia: Instancia, token: TokenNaInstancia): EstadoInstancias {
  if (mesmaInstancia(token, instancia.tokens[token.id] ?? {})) {
    return estado;
  }
  const instancias: Record<string, Instancia> = {};
  for (const [id, i] of Object.entries(estado.instancias)) {
    const restantes = Object.values(i.tokens).filter((t) => t.fichaId !== token.fichaId && t.id !== token.id);
    instancias[id] =
      restantes.length === Object.keys(i.tokens).length ? i : { ...i, tokens: Object.fromEntries(restantes.map((t) => [t.id, t])) };
  }
  const destino = instancias[instancia.id];
  instancias[destino.id] = { ...destino, tokens: { ...destino.tokens, [token.id]: token } };
  return { ...estado, instancias };
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
      const editada: Instancia = tokensDentroDoMapa({
        ...atual,
        ...acao.mudancas,
        id: atual.id,
        tokens: atual.tokens,
        paredes: atual.paredes,
        luzes: atual.luzes,
      });
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
      // A cópia sai sem tokens: cada ficha tem um token só no jogo inteiro.
      return comInstancia(estado, { ...original, id: acao.novoId, nome: `${original.nome} (cópia)`, tokens: {} });
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
    case 'ColocarToken': {
      const instancia = estado.instancias[acao.instanciaId];
      if (!instancia || problemaNoToken(acao.token)) {
        return estado;
      }
      // Um token posto no mapa não traz o caminho de um movimento antigo.
      const { caminho: _caminho, ...semCaminho } = acao.token;
      const posto = comTokenPosto(estado, instancia, { ...semCaminho, ...dentroDoMapa(instancia, acao.token.x, acao.token.y) });
      // Quem controla a ficha vai para onde ela está.
      return acao.levar && acao.levar.length > 0
        ? aplicarAcaoInstancias(posto, { tipo: 'LevarParaCena', participanteIds: acao.levar, cena: cenaNaInstancia(instancia.id) })
        : posto;
    }
    case 'MoverToken':
      return comTokens(estado, acao.instanciaId, (tokens, instancia) => {
        const token = tokens[acao.tokenId];
        if (!token || !Number.isFinite(acao.x) || !Number.isFinite(acao.y)) {
          return tokens;
        }
        const { x, y } = dentroDoMapa(instancia, acao.x, acao.y);
        if (x === token.x && y === token.y) {
          return tokens;
        }
        const { caminho: _antigo, ...semCaminho } = token;
        const caminho = (acao.caminho ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        return { ...tokens, [token.id]: caminho.length > 0 ? { ...semCaminho, x, y, caminho } : { ...semCaminho, x, y } };
      });
    case 'EditarToken':
      return comTokens(estado, acao.instanciaId, (tokens) => {
        const token = tokens[acao.tokenId];
        if (!token) {
          return tokens;
        }
        // Só os campos que se editam; posição, ficha e id ficam.
        const { tamanho, escondido, travado, nomeNoMapa } = { ...token, ...acao.mudancas };
        const { luz: _luz, ...semLuz } = token;
        // A luz própria: `null` tira (volta a valer a da ficha); sem o campo, fica a que estava.
        const luz = acao.mudancas.luz === undefined ? token.luz : acao.mudancas.luz;
        const editado: TokenNaInstancia = { ...semLuz, tamanho, escondido, travado, nomeNoMapa, ...(luz ? { luz } : {}) };
        if (mesmaInstancia(editado, token) || !tamanhoValido(tamanho) || (luz && problemaNaLuz(luz))) {
          return tokens;
        }
        return { ...tokens, [token.id]: editado };
      });
    case 'TirarToken':
      return comTokens(estado, acao.instanciaId, (tokens) => {
        if (!(acao.tokenId in tokens)) {
          return tokens;
        }
        const { [acao.tokenId]: _tirado, ...restantes } = tokens;
        return restantes;
      });
    case 'CriarParedes':
      return comParedes(estado, acao.instanciaId, (paredes) => {
        const novas = acao.paredes.filter((p) => !(p.id in paredes)).map(normalizarParede);
        if (novas.length === 0) {
          return paredes;
        }
        let resultado = paredes;
        for (const nova of novas) {
          const { paredes: cortadas, abertura } =
            acao.encaixe !== undefined && acao.encaixe >= 0 ? abrirVao(resultado, nova, acao.encaixe) : { paredes: resultado, abertura: nova };
          resultado = { ...cortadas, [abertura.id]: abertura };
        }
        return resultado;
      });
    case 'EditarParedes':
      return comParedes(estado, acao.instanciaId, (paredes) => {
        const trocadas = acao.paredes
          .filter((p) => p.id in paredes)
          .map(normalizarParede)
          .filter((p) => !mesmaInstancia(p, paredes[p.id]));
        return trocadas.length === 0 ? paredes : { ...paredes, ...Object.fromEntries(trocadas.map((p) => [p.id, p])) };
      });
    case 'ApagarParedes':
      return comParedes(estado, acao.instanciaId, (paredes) => {
        const apagar = new Set(acao.paredeIds.filter((id) => id in paredes));
        return apagar.size === 0 ? paredes : Object.fromEntries(Object.entries(paredes).filter(([id]) => !apagar.has(id)));
      });
    case 'MudarPorta':
      return comParedes(estado, acao.instanciaId, (paredes) => {
        const porta = paredes[acao.paredeId];
        if (!porta || porta.tipo !== 'porta') {
          return paredes;
        }
        const mudada: Parede = { ...porta, estado: acao.estado ?? porta.estado, secreta: acao.secreta ?? porta.secreta };
        return mesmaInstancia(mudada, porta) ? paredes : { ...paredes, [porta.id]: mudada };
      });
    case 'CriarLuz':
      return comLuzes(estado, acao.instanciaId, (luzes, instancia) =>
        acao.luz.id in luzes
          ? luzes
          : { ...luzes, [acao.luz.id]: { ...acao.luz, ...dentroDoMapa(instancia, acao.luz.x, acao.luz.y) } },
      );
    case 'EditarLuz':
      return comLuzes(estado, acao.instanciaId, (luzes, instancia) => {
        if (!(acao.luz.id in luzes)) {
          return luzes;
        }
        const luz = { ...acao.luz, ...dentroDoMapa(instancia, acao.luz.x, acao.luz.y) };
        return mesmaInstancia(luz, luzes[luz.id]) ? luzes : { ...luzes, [luz.id]: luz };
      });
    case 'ApagarLuz':
      return comLuzes(estado, acao.instanciaId, (luzes) => {
        if (!(acao.luzId in luzes)) {
          return luzes;
        }
        const { [acao.luzId]: _apagada, ...restantes } = luzes;
        return restantes;
      });
    case 'CarregarInstancias':
      return acao.estado;
  }
}

/**
 * As instâncias como um participante pode recebê-las. O jogador recebe só a instância em que
 * está, sem a descrição, sem os tokens escondidos e sem saber das portas secretas; as outras
 * não existem para ele, nem os nomes.
 * Também não sabe onde estão os outros jogadores. No online, é isto que o servidor manda a cada jogador.
 */
export function instanciasVistasPor(estado: EstadoInstancias, participanteId: string): EstadoInstancias {
  if (ehMestre(participanteId)) {
    return estado;
  }
  const cena = cenaDe(estado, participanteId);
  const atual = cena.tipo === 'instancia' ? estado.instancias[cena.instanciaId] : null;
  return {
    instancias: atual
      ? {
          [atual.id]: {
            ...atual,
            descricao: '',
            tokens: Object.fromEntries(Object.entries(atual.tokens).filter(([, token]) => !token.escondido)),
            // Portas secretas fechadas chegam como paredes comuns; abertas, nem chegam.
            paredes: Object.fromEntries(
              Object.values(atual.paredes).flatMap((parede) => {
                const vista = paredeVistaPeloJogador(parede);
                return vista ? [[vista.id, vista]] : [];
              }),
            ),
          },
        }
      : {},
    cenas: { [participanteId]: cena },
    cenaInicial: cena,
  };
}

export type LojaInstancias = LojaComHistorico<EstadoInstancias, AcaoInstancias>;

/**
 * O mestre muda tudo; o jogador só move os próprios tokens (`conferirInstancias`).
 * O contexto diz quem controla cada ficha.
 */
export function criarLojaInstancias(
  inicial: EstadoInstancias = criarInstanciasVazias(),
  opcoes: OpcoesRegistro = {},
  contexto: ContextoDasInstancias = SEM_FICHAS,
): LojaInstancias {
  return criarLojaComHistorico(
    {
      inicial,
      aplicar: aplicarAcaoInstancias,
      coordDaAcao: (acao) => (acao.tipo === 'CriarInstancia' ? acao.instancia.hex : null),
      eventoDesfazer: 'DesfazerInstancias',
      eventoRefazer: 'RefazerInstancias',
      conferir: (antes, depois, autorId) => conferirInstancias(antes, depois, autorId, contexto),
    },
    opcoes,
  );
}

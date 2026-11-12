/**
 * O que cada participante vê numa instância (Fase 6, passo 6).
 *
 * A regra: um jogador vê um ponto quando um dos tokens dele tem a linha até o ponto livre de
 * paredes **e** o ponto está iluminado (luz clara ou penumbra) ou dentro da visão no escuro daquele
 * token. Por isso um goblin com uma tocha aparece de longe num corredor escuro, e um sem luz não.
 * A visão é de cada jogador (como no hexcrawl): um aliado fora da sua visão some.
 *
 * O mestre vê tudo. Os tokens do próprio jogador sempre aparecem para ele.
 * Os desenhos da tela usam os mesmos polígonos daqui, para o que se vê bater com as regras.
 */
import { calcularFicha } from './calculoDaFicha';
import type { Ficha } from './fichas';
import type { Instancia } from './instancias';
import { dentroDoPoligono, poligonoDeVisao, type Segmento } from './linhaDeVisao';
import { LUZ_DA_FICHA, nivelDoAmbiente, VALOR_DO_NIVEL, type ModoDeVisao, type NivelDeLuz, type PropriedadesDaLuz } from './luz';
import { barraVisao, type Ponto } from './paredes';
import type { Regras } from './regras';
import { diametroEmMetros, type ContextoDasInstancias, type TokenNaInstancia } from './tokens';
import { ehMestre } from './visibilidade';

/** O que a ficha leva para a visão: visão no escuro e luz que carrega, em metros. */
export interface VisaoDaFicha {
  readonly noEscuro: number;
  readonly luzClara: number;
  readonly luzPenumbra: number;
}

/** Os valores de visão da ficha; uma fórmula com problema vale zero, para não travar a tela. */
export function visaoDaFicha(ficha: Ficha, regras: Regras): VisaoDaFicha {
  const calculo = calcularFicha(ficha, regras);
  const valor = (nome: string) => {
    const c = calculo.valor(nome);
    return c.ok && Number.isFinite(c.valor) ? Math.max(0, c.valor) : 0;
  };
  return { noEscuro: valor('visao_no_escuro'), luzClara: valor('luz_clara'), luzPenumbra: valor('luz_penumbra') };
}

/** A luz que um token espalha: a posta pelo mestre ou a da ficha (uma tocha equipada), ou nenhuma. */
export function luzDoToken(token: TokenNaInstancia, visao: VisaoDaFicha | undefined): PropriedadesDaLuz | null {
  if (token.luz) {
    return token.luz.clara + token.luz.penumbra > 0 ? token.luz : null;
  }
  if (!visao || visao.luzClara + visao.luzPenumbra <= 0) {
    return null;
  }
  return { clara: visao.luzClara, penumbra: visao.luzPenumbra, ...LUZ_DA_FICHA };
}

/** Uma luz pronta para as contas e o desenho: posição e raios em pixels. */
export interface LuzNoMapa {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Raio da luz clara, em pixels. */
  readonly clara: number;
  /** Raio total (luz clara mais penumbra), em pixels. */
  readonly alcance: number;
  readonly cor: number;
  readonly tremular: boolean;
  /** A área que ela ilumina: as paredes cortam a luz. */
  readonly area: readonly Ponto[];
}

/** De onde um participante enxerga: um token dele. */
export interface Observador {
  readonly tokenId: string;
  readonly x: number;
  readonly y: number;
  /** Visão no escuro, em pixels. */
  readonly noEscuro: number;
  /** O que a linha de visão alcança, sem pensar na luz. */
  readonly area: readonly Ponto[];
  /** A área da visão no escuro (a linha de visão até o raio dela), ou vazia. */
  readonly areaNoEscuro: readonly Ponto[];
}

/** Tudo o que se precisa para saber o que um participante vê numa instância. */
export interface VisaoNaInstancia {
  readonly instanciaId: string;
  readonly largura: number;
  readonly altura: number;
  readonly modo: ModoDeVisao;
  readonly ambiente: NivelDeLuz;
  /** O mestre, ou a visão desligada: vê tudo, sem pensar em linha de visão nem luz. */
  readonly todos: boolean;
  readonly bloqueios: readonly Segmento[];
  readonly luzes: readonly LuzNoMapa[];
  readonly observadores: readonly Observador[];
}

/** As paredes que barram a visão e a luz: paredes e portas não abertas (janelas e vãos deixam ver). */
export function bloqueiosDaVisao(instancia: Instancia): Segmento[] {
  return Object.values(instancia.paredes).filter(barraVisao);
}

/** Uma luz pronta, com a área que ela ilumina. */
export function luzNoMapa(
  instancia: Instancia,
  bloqueios: readonly Segmento[],
  id: string,
  x: number,
  y: number,
  luz: PropriedadesDaLuz,
): LuzNoMapa {
  const clara = luz.clara / instancia.metrosPorPixel;
  const alcance = (luz.clara + luz.penumbra) / instancia.metrosPorPixel;
  return {
    id,
    x,
    y,
    clara,
    alcance,
    cor: luz.cor,
    tremular: luz.tremular,
    area: poligonoDeVisao({ x, y }, bloqueios, instancia.largura, instancia.altura, alcance),
  };
}

/** Um observador pronto, com as áreas que ele alcança. */
export function observadorEm(instancia: Instancia, bloqueios: readonly Segmento[], tokenId: string, x: number, y: number, noEscuroMetros: number): Observador {
  const noEscuro = noEscuroMetros / instancia.metrosPorPixel;
  const origem = { x, y };
  return {
    tokenId,
    x,
    y,
    noEscuro,
    area: poligonoDeVisao(origem, bloqueios, instancia.largura, instancia.altura),
    areaNoEscuro: noEscuro > 0 ? poligonoDeVisao(origem, bloqueios, instancia.largura, instancia.altura, noEscuro) : [],
  };
}

export interface FontesDaVisao {
  readonly fichas: Readonly<Record<string, Ficha>>;
  readonly regras: Regras;
  readonly contexto: ContextoDasInstancias;
  /** Minutos do relógio do mundo, para a luz "pelo relógio". */
  readonly relogio: number;
}

/**
 * O que um participante vê na instância. As luzes dos tokens escondidos pelo mestre não contam
 * para os jogadores (o token "não está lá" para eles).
 */
export function visaoNaInstancia(instancia: Instancia, participanteId: string, fontes: FontesDaVisao): VisaoNaInstancia {
  const mestre = ehMestre(participanteId);
  const bloqueios = bloqueiosDaVisao(instancia);
  const visoes = new Map<string, VisaoDaFicha>();
  const visaoDe = (fichaId: string) => {
    if (!visoes.has(fichaId)) {
      const ficha = fontes.fichas[fichaId];
      if (ficha) {
        visoes.set(fichaId, visaoDaFicha(ficha, fontes.regras));
      }
    }
    return visoes.get(fichaId);
  };
  const tokens = Object.values(instancia.tokens).filter((t) => t.fichaId in fontes.fichas);
  const luzes: LuzNoMapa[] = [];
  for (const fonte of Object.values(instancia.luzes)) {
    if (fonte.ligada && fonte.clara + fonte.penumbra > 0) {
      luzes.push(luzNoMapa(instancia, bloqueios, fonte.id, fonte.x, fonte.y, fonte));
    }
  }
  for (const token of tokens) {
    if (token.escondido && !mestre) {
      continue;
    }
    const luz = luzDoToken(token, visaoDe(token.fichaId));
    if (luz) {
      luzes.push(luzNoMapa(instancia, bloqueios, `token:${token.id}`, token.x, token.y, luz));
    }
  }
  const todos = mestre || instancia.visao === 'livre';
  const observadores = todos
    ? []
    : tokens
        .filter((t) => fontes.contexto.obterDonoDaFicha(t.fichaId) === participanteId)
        .map((t) => observadorEm(instancia, bloqueios, t.id, t.x, t.y, visaoDe(t.fichaId)?.noEscuro ?? 0));
  return {
    instanciaId: instancia.id,
    largura: instancia.largura,
    altura: instancia.altura,
    modo: instancia.visao,
    ambiente: nivelDoAmbiente(instancia.luzAmbiente, fontes.relogio),
    todos,
    bloqueios,
    luzes,
    observadores,
  };
}

const distancia = (a: Ponto, b: Ponto) => Math.hypot(a.x - b.x, a.y - b.y);

/** O nível de luz num ponto: o do ambiente ou o da luz mais forte que chega até ele. */
export function nivelDeLuzEm(visao: Pick<VisaoNaInstancia, 'ambiente' | 'luzes'>, p: Ponto): NivelDeLuz {
  let nivel = VALOR_DO_NIVEL[visao.ambiente];
  for (const luz of visao.luzes) {
    if (nivel === 2) {
      break;
    }
    const d = distancia(luz, p);
    if (d > luz.alcance || !dentroDoPoligono(p, luz.area)) {
      continue;
    }
    nivel = Math.max(nivel, d <= luz.clara ? 2 : 1);
  }
  return nivel === 2 ? 'clara' : nivel === 1 ? 'penumbra' : 'escuridao';
}

/** Se um observador vê um ponto: linha livre e o ponto iluminado ou dentro da visão no escuro. */
export function observadorVe(visao: Pick<VisaoNaInstancia, 'ambiente' | 'luzes'>, observador: Observador, p: Ponto): boolean {
  if (!dentroDoPoligono(p, observador.area)) {
    return false;
  }
  return distancia(observador, p) <= observador.noEscuro || nivelDeLuzEm(visao, p) !== 'escuridao';
}

/** Se o participante vê um ponto. */
export function vePonto(visao: VisaoNaInstancia, p: Ponto): boolean {
  return visao.todos || visao.observadores.some((o) => observadorVe(visao, o, p));
}

/** O centro e oito pontos perto da borda do círculo: basta um pedaço do token aparecer. */
export function pontosDoCirculo(x: number, y: number, raio: number): Ponto[] {
  const pontos = [{ x, y }];
  for (let i = 0; i < 8; i += 1) {
    const ang = (i * Math.PI) / 4;
    pontos.push({ x: x + Math.cos(ang) * raio * 0.9, y: y + Math.sin(ang) * raio * 0.9 });
  }
  return pontos;
}

/**
 * Os tokens que o participante vê: todos para o mestre (ou com a visão desligada); para o jogador,
 * os dele e os que aparecem para algum token dele.
 */
export function tokensQueVe(
  visao: VisaoNaInstancia,
  instancia: Instancia,
  participanteId: string,
  fontes: Pick<FontesDaVisao, 'fichas' | 'contexto'>,
): Set<string> {
  const vistos = new Set<string>();
  for (const token of Object.values(instancia.tokens)) {
    if (visao.todos || fontes.contexto.obterDonoDaFicha(token.fichaId) === participanteId) {
      vistos.add(token.id);
      continue;
    }
    const raio = diametroEmMetros(token, fontes.fichas[token.fichaId]) / 2 / instancia.metrosPorPixel;
    if (pontosDoCirculo(token.x, token.y, raio).some((p) => vePonto(visao, p))) {
      vistos.add(token.id);
    }
  }
  return vistos;
}

/**
 * A instância sem os tokens que o participante não vê. É o que o servidor mandará a cada jogador
 * no online, depois de `instanciasVistasPor`.
 */
export function instanciaPelaVisao(instancia: Instancia, vistos: ReadonlySet<string>): Instancia {
  const tokens = Object.values(instancia.tokens);
  if (tokens.every((t) => vistos.has(t.id))) {
    return instancia;
  }
  return { ...instancia, tokens: Object.fromEntries(tokens.filter((t) => vistos.has(t.id)).map((t) => [t.id, t])) };
}

// ---------- Névoa de masmorra: a grade do que já foi visto ----------

/** O lado de uma célula da memória, em metros (meio quadrado de batalha). */
export const METROS_DA_CELULA = 0.75;
/** Mapas enormes ganham células maiores, para a memória não passar disto. */
const CELULAS_MAXIMAS = 250 * 250;

export interface GradeDaExploracao {
  /** Lado da célula, em pixels. */
  readonly celula: number;
  readonly colunas: number;
  readonly linhas: number;
}

export function gradeDaExploracao(instancia: Pick<Instancia, 'largura' | 'altura' | 'metrosPorPixel'>): GradeDaExploracao {
  let celula = METROS_DA_CELULA / instancia.metrosPorPixel;
  const contar = (c: number) => Math.ceil(instancia.largura / c) * Math.ceil(instancia.altura / c);
  if (contar(celula) > CELULAS_MAXIMAS) {
    celula = Math.sqrt((instancia.largura * instancia.altura) / CELULAS_MAXIMAS) * 1.01;
  }
  return { celula, colunas: Math.ceil(instancia.largura / celula), linhas: Math.ceil(instancia.altura / celula) };
}

/** As células (índice = linha × colunas + coluna) cujo centro o participante vê agora. */
export function celulasVistas(visao: VisaoNaInstancia, grade: GradeDaExploracao): number[] {
  const vistas: number[] = [];
  if (visao.observadores.length === 0) {
    return vistas;
  }
  // Só as células dentro do retângulo que as áreas dos observadores ocupam.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of visao.observadores) {
    for (const p of o.area) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  const c0 = Math.max(0, Math.floor(minX / grade.celula));
  const c1 = Math.min(grade.colunas - 1, Math.floor(maxX / grade.celula));
  const l0 = Math.max(0, Math.floor(minY / grade.celula));
  const l1 = Math.min(grade.linhas - 1, Math.floor(maxY / grade.celula));
  for (let l = l0; l <= l1; l += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const centro = { x: (c + 0.5) * grade.celula, y: (l + 0.5) * grade.celula };
      if (vePonto(visao, centro)) {
        vistas.push(l * grade.colunas + c);
      }
    }
  }
  return vistas;
}

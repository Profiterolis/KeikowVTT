/**
 * Paredes, portas e janelas das instâncias (Fase 6, passo 5). Cada uma é um segmento de reta em
 * pixels da instância, como no formato Universal VTT (`.uvtt`), para a importação do passo 10.
 *
 * Elas barram o movimento dos tokens: o corpo do token (um círculo) anda em linha reta e para logo
 * antes de encostar numa parede. No passo 6, as mesmas paredes barram a visão e a luz.
 */

export const TIPOS_DE_PAREDE = ['parede', 'porta', 'janela'] as const;
export type TipoDeParede = (typeof TIPOS_DE_PAREDE)[number];

export const ESTADOS_DA_PORTA = ['aberta', 'fechada', 'trancada'] as const;
export type EstadoDaPorta = (typeof ESTADOS_DA_PORTA)[number];

export interface Ponto {
  readonly x: number;
  readonly y: number;
}

export interface Parede {
  readonly id: string;
  readonly a: Ponto;
  readonly b: Ponto;
  readonly tipo: TipoDeParede;
  /** Só vale para portas; as outras ficam sempre "fechada". */
  readonly estado: EstadoDaPorta;
  /** Porta secreta: para os jogadores, é uma parede comum até o mestre revelar. Só vale para portas. */
  readonly secreta: boolean;
}

/** A distância (a partir da borda do token) de onde um jogador abre ou fecha uma porta. */
export const ALCANCE_DA_PORTA_METROS = 1.5;

/**
 * O corpo que bate nas paredes é um pouco menor que o círculo desenhado: o círculo é o espaço que
 * a criatura ocupa (1,5 m para um Médio), e uma porta comum também tem 1,5 m. Com 70%, um Médio
 * passa numa porta de 1,5 m e um Grande (3 m de espaço, 2,1 m de corpo) não passa.
 */
export const FATOR_DO_CORPO = 0.7;

/** Quanto o token para antes de encostar, em pixels, para não ficar grudado na parede. */
const FOLGA = 0.5;

/** Uma parede nova; tipos que não são porta ficam sempre fechados e não secretos. */
export function novaParede(id: string, a: Ponto, b: Ponto, tipo: TipoDeParede, secreta = false): Parede {
  return normalizarParede({ id, a, b, tipo, estado: 'fechada', secreta });
}

/** Garante que estado e segredo só existam em portas. */
export function normalizarParede(parede: Parede): Parede {
  return parede.tipo === 'porta' ? parede : { ...parede, estado: 'fechada', secreta: false };
}

const pontoValido = (p: Ponto) => Number.isFinite(p.x) && Number.isFinite(p.y);

export function problemaNaParede(parede: Parede): string | null {
  if (parede.id === '') {
    return 'A parede está sem id.';
  }
  if (!pontoValido(parede.a) || !pontoValido(parede.b)) {
    return 'As pontas da parede não são válidas.';
  }
  if (parede.a.x === parede.b.x && parede.a.y === parede.b.y) {
    return 'A parede precisa de duas pontas diferentes.';
  }
  if (!(TIPOS_DE_PAREDE as readonly string[]).includes(parede.tipo)) {
    return 'O tipo da parede não é válido.';
  }
  if (!(ESTADOS_DA_PORTA as readonly string[]).includes(parede.estado)) {
    return 'O estado da porta não é válido.';
  }
  return null;
}

/** Paredes, janelas e portas que não estão abertas barram o movimento. */
export function barraMovimento(parede: Parede): boolean {
  return parede.tipo !== 'porta' || parede.estado !== 'aberta';
}

/** Para o passo 6: janelas e portas abertas deixam ver através. */
export function barraVisao(parede: Parede): boolean {
  return parede.tipo === 'parede' || (parede.tipo === 'porta' && parede.estado !== 'aberta');
}

// ---------- Geometria ----------

const sub = (p: Ponto, q: Ponto): Ponto => ({ x: p.x - q.x, y: p.y - q.y });
const dot = (p: Ponto, q: Ponto) => p.x * q.x + p.y * q.y;

/** O ponto do segmento mais perto de `p`. */
export function pontoMaisProximo(p: Ponto, a: Ponto, b: Ponto): Ponto {
  const s = sub(b, a);
  const l2 = dot(s, s);
  const u = l2 === 0 ? 0 : Math.min(Math.max(dot(sub(p, a), s) / l2, 0), 1);
  return { x: a.x + s.x * u, y: a.y + s.y * u };
}

export function distanciaAoSegmento(p: Ponto, a: Ponto, b: Ponto): number {
  const c = pontoMaisProximo(p, a, b);
  return Math.hypot(p.x - c.x, p.y - c.y);
}

/** O menor `t` em [0, 1] em que `origem + t·d` fica a `raio` do ponto `c`, ou `null`. */
function contatoComPonto(origem: Ponto, d: Ponto, raio: number, c: Ponto): number | null {
  const f = sub(origem, c);
  const qa = dot(d, d);
  const qb = 2 * dot(f, d);
  const qc = dot(f, f) - raio * raio;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) {
    return null;
  }
  const t = (-qb - Math.sqrt(disc)) / (2 * qa);
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * Um círculo de `raio` andando em linha reta de `origem` a `destino`: em que fração do caminho
 * (`t` de 0 a 1) ele encosta pela primeira vez num dos segmentos, ou `null` se passa livre.
 * Um círculo que já começa encostado só é barrado se andar na direção do segmento: assim um token
 * posto em cima de uma parede consegue sair dela.
 */
export function primeiroContato(
  origem: Ponto,
  destino: Ponto,
  raio: number,
  segmentos: readonly { readonly a: Ponto; readonly b: Ponto }[],
): number | null {
  const d = sub(destino, origem);
  if (dot(d, d) < 1e-12) {
    return null;
  }
  let melhor = Infinity;
  for (const { a, b } of segmentos) {
    const inicio = distanciaAoSegmento(origem, a, b);
    if (inicio < raio - 1e-6) {
      if (dot(d, sub(pontoMaisProximo(origem, a, b), origem)) > 0) {
        melhor = 0;
      }
      continue;
    }
    const s = sub(b, a);
    const l2 = dot(s, s);
    if (l2 > 0) {
      // As duas retas paralelas ao segmento, a `raio` de cada lado.
      const comprimento = Math.sqrt(l2);
      const n = { x: -s.y / comprimento, y: s.x / comprimento };
      const dn = dot(d, n);
      if (Math.abs(dn) > 1e-12) {
        for (const lado of [1, -1]) {
          const t = (lado * raio - dot(sub(origem, a), n)) / dn;
          if (t >= 0 && t <= 1) {
            const x = { x: origem.x + d.x * t, y: origem.y + d.y * t };
            const u = dot(sub(x, a), s) / l2;
            if (u >= 0 && u <= 1) {
              melhor = Math.min(melhor, t);
            }
          }
        }
      }
    }
    // As pontas do segmento, como pequenos círculos.
    for (const ponta of [a, b]) {
      const t = contatoComPonto(origem, d, raio, ponta);
      if (t !== null) {
        melhor = Math.min(melhor, t);
      }
    }
  }
  return Number.isFinite(melhor) ? melhor : null;
}

/** Onde o corpo para indo de `origem` a `destino`: logo antes da primeira parede que barra o movimento. */
export function pontoDeParada(origem: Ponto, destino: Ponto, raio: number, paredes: readonly Parede[]): Ponto {
  const t = primeiroContato(origem, destino, raio, paredes.filter(barraMovimento));
  if (t === null) {
    return destino;
  }
  const comprimento = Math.hypot(destino.x - origem.x, destino.y - origem.y);
  const parada = Math.max(0, t - FOLGA / comprimento);
  return { x: origem.x + (destino.x - origem.x) * parada, y: origem.y + (destino.y - origem.y) * parada };
}

/** Se o corpo vai de `origem` a `destino` sem encostar em nada que barre o movimento. */
export function caminhoLivre(origem: Ponto, destino: Ponto, raio: number, paredes: readonly Parede[]): boolean {
  return primeiroContato(origem, destino, raio, paredes.filter(barraMovimento)) === null;
}

/** O raio do corpo em pixels, a partir do diâmetro do token em metros. */
export function raioDoCorpo(diametroMetros: number, metrosPorPixel: number): number {
  return (diametroMetros * FATOR_DO_CORPO) / 2 / metrosPorPixel;
}

/** Se um token (centro e raio desenhado, em pixels) alcança a porta. */
export function alcancaAPorta(centro: Ponto, raioDesenhado: number, porta: Parede, metrosPorPixel: number): boolean {
  return distanciaAoSegmento(centro, porta.a, porta.b) - raioDesenhado <= ALCANCE_DA_PORTA_METROS / metrosPorPixel + 1e-6;
}

/**
 * Para desenhar com Shift: a ponta nova alinhada a 0°, 45° ou 90° a partir da anterior,
 * mantendo a distância.
 */
export function alinharAngulo(de: Ponto, para: Ponto): Ponto {
  const dx = para.x - de.x;
  const dy = para.y - de.y;
  const distancia = Math.hypot(dx, dy);
  const angulo = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: de.x + Math.cos(angulo) * distancia, y: de.y + Math.sin(angulo) * distancia };
}

/** A ponta de parede mais perto de `p`, a até `alcance` pixels, para grudar as paredes. */
export function pontaProxima(p: Ponto, paredes: readonly Parede[], alcance: number): Ponto | null {
  let melhor: Ponto | null = null;
  let menor = alcance;
  for (const parede of paredes) {
    for (const ponta of [parede.a, parede.b]) {
      const d = Math.hypot(ponta.x - p.x, ponta.y - p.y);
      if (d <= menor) {
        menor = d;
        melhor = ponta;
      }
    }
  }
  return melhor;
}

/** Como o jogador recebe as paredes: a porta secreta fechada vira parede comum; aberta, some. */
export function paredeVistaPeloJogador(parede: Parede): Parede | null {
  if (parede.tipo !== 'porta' || !parede.secreta) {
    return parede;
  }
  return parede.estado === 'aberta' ? null : { ...parede, tipo: 'parede', estado: 'fechada', secreta: false };
}

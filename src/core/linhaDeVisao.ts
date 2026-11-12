/**
 * Geometria da linha de visão (Fase 6, passo 6): o que um ponto enxerga quando há paredes no
 * caminho. Serve para a visão dos personagens e para a luz, que as paredes também barram.
 *
 * Duas perguntas: "a linha de A até B passa livre?" (para saber se um token vê outro) e
 * "qual a área que um ponto enxerga?" (um polígono, para desenhar a visão e a luz).
 */
import type { Ponto } from './paredes';

export interface Segmento {
  readonly a: Ponto;
  readonly b: Ponto;
}

const EPS = 1e-9;

const cruz = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

/**
 * Onde a semirreta (ou o segmento, se `tMax` = 1) que sai de `origem` na direção `d` cruza o
 * segmento `s`: a fração `t` do caminho, ou `null` se não cruza.
 */
function cruzamento(origem: Ponto, d: Ponto, s: Segmento): number | null {
  const ex = s.b.x - s.a.x;
  const ey = s.b.y - s.a.y;
  const den = cruz(d.x, d.y, ex, ey);
  if (Math.abs(den) < EPS) {
    return null; // paralelos: uma parede vista de lado não tampa nada
  }
  const fx = s.a.x - origem.x;
  const fy = s.a.y - origem.y;
  const t = cruz(fx, fy, ex, ey) / den;
  const u = cruz(fx, fy, d.x, d.y) / den;
  return t >= 0 && u >= -EPS && u <= 1 + EPS ? t : null;
}

/**
 * Se a linha de `de` até `ate` passa sem cruzar nenhum segmento. Encostar na ponta do caminho
 * não conta: um ponto sobre uma parede é visto do lado de onde se olha.
 */
export function linhaLivre(de: Ponto, ate: Ponto, segmentos: readonly Segmento[]): boolean {
  const d = { x: ate.x - de.x, y: ate.y - de.y };
  if (Math.abs(d.x) < EPS && Math.abs(d.y) < EPS) {
    return true;
  }
  for (const s of segmentos) {
    const t = cruzamento(de, d, s);
    if (t !== null && t > 1e-6 && t < 1 - 1e-6) {
      return false;
    }
  }
  return true;
}

/** As quatro bordas de um retângulo, para a visão nunca sair do mapa. */
export function bordasDoMapa(largura: number, altura: number): Segmento[] {
  const p = [
    { x: 0, y: 0 },
    { x: largura, y: 0 },
    { x: largura, y: altura },
    { x: 0, y: altura },
  ];
  return p.map((a, i) => ({ a, b: p[(i + 1) % 4] }));
}

/** Quantos raios extras por volta completa para desenhar a borda de um círculo de alcance. */
const RAIOS_NO_CIRCULO = 96;

/**
 * A área que `origem` enxerga: um polígono em volta dela, cortado pelas paredes e pelas bordas do
 * mapa. Com `alcance`, a área também para nesse raio (a luz de uma tocha, a visão no escuro).
 *
 * Como funciona: um raio sai da origem na direção de cada ponta de parede (e logo ao lado dela, para
 * passar raspando pela quina), mais raios em volta quando há alcance; cada um para na primeira parede.
 * Ligando as pontas em ordem de ângulo sai o polígono.
 */
export function poligonoDeVisao(
  origem: Ponto,
  paredes: readonly Segmento[],
  largura: number,
  altura: number,
  alcance?: number,
): Ponto[] {
  const segmentos = [...bordasDoMapa(largura, altura), ...paredes];
  const angulos: number[] = [];
  for (const s of segmentos) {
    for (const p of [s.a, s.b]) {
      if (alcance !== undefined && Math.hypot(p.x - origem.x, p.y - origem.y) > alcance * 1.5) {
        continue; // longe demais para mudar o desenho
      }
      const ang = Math.atan2(p.y - origem.y, p.x - origem.x);
      angulos.push(ang - 1e-4, ang, ang + 1e-4);
    }
  }
  if (alcance !== undefined) {
    for (let i = 0; i < RAIOS_NO_CIRCULO; i += 1) {
      angulos.push(-Math.PI + (i * 2 * Math.PI) / RAIOS_NO_CIRCULO);
    }
  }
  angulos.sort((x, y) => x - y);
  const pontos: Ponto[] = [];
  let anterior = NaN;
  for (const ang of angulos) {
    if (Math.abs(ang - anterior) < 1e-7) {
      continue;
    }
    anterior = ang;
    const d = { x: Math.cos(ang), y: Math.sin(ang) };
    let menor = alcance ?? Infinity;
    for (const s of segmentos) {
      const t = cruzamento(origem, d, s);
      // Uma parede que passa pela própria origem não tampa nada: uma tocha presa na parede
      // ilumina os dois lados (o mestre a põe um pouco para dentro da sala).
      if (t !== null && t > 1e-6 && t < menor) {
        menor = t;
      }
    }
    if (!Number.isFinite(menor)) {
      continue;
    }
    pontos.push({ x: origem.x + d.x * menor, y: origem.y + d.y * menor });
  }
  return pontos;
}

/** Se um ponto está dentro de um polígono (regra par-ímpar). */
export function dentroDoPoligono(p: Ponto, poligono: readonly Ponto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i, i += 1) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      dentro = !dentro;
    }
  }
  return dentro;
}

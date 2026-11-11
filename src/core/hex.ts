/** Identidade de um hex no mapa, em coordenadas axiais. */
export interface CoordHex {
  readonly q: number;
  readonly r: number;
}

/** Posição em pixels no "mundo" do mapa, antes de câmera e zoom. */
export interface PontoMundo {
  readonly x: number;
  readonly y: number;
}

/** Retângulo em pixels do mundo. */
export interface AreaMundo {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export type ChaveHex = `${number},${number}`;

/** Distância horizontal entre os centros de dois hexes vizinhos na mesma linha. */
export const LARGURA_COLUNA = 256;
/** Distância vertical entre duas linhas de hexes. */
export const ALTURA_LINHA = 192;
/** Distância do centro do hex até a ponta inferior. */
export const METADE_ALTURA_HEX = 128;

export function chaveHex({ q, r }: CoordHex): ChaveHex {
  return `${q},${r}`;
}

export function coordDaChave(chave: ChaveHex): CoordHex {
  const [q, r] = chave.split(',').map(Number);
  return { q, r };
}

/** Centro do "chão" do hex, em pixels do mundo. */
export function hexParaMundo({ q, r }: CoordHex): PontoMundo {
  return { x: LARGURA_COLUNA * (q + r / 2), y: ALTURA_LINHA * r };
}

/** Ponta inferior do hex: o ponto de snap dos tiles. */
export function pontaInferiorHex(coord: CoordHex): PontoMundo {
  const centro = hexParaMundo(coord);
  return { x: centro.x, y: centro.y + METADE_ALTURA_HEX };
}

const DIRECOES_VIZINHAS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;

/** Os 6 hexes ao redor de um hex. */
export function vizinhosHex({ q, r }: CoordHex): CoordHex[] {
  return DIRECOES_VIZINHAS.map(([dq, dr]) => ({ q: q + dq, r: r + dr }));
}

/** Quantos passos de vizinho em vizinho separam dois hexes. */
export function distanciaHex(a: CoordHex, b: CoordHex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Os seis cantos do hex como lista [x1, y1, x2, y2, ...], em pixels do mundo. */
export function contornoHex(coord: CoordHex): number[] {
  const { x, y } = hexParaMundo(coord);
  const meiaLargura = LARGURA_COLUNA / 2;
  const meiaAltura = METADE_ALTURA_HEX;
  const ombro = METADE_ALTURA_HEX / 2;
  return [
    x, y - meiaAltura,
    x + meiaLargura, y - ombro,
    x + meiaLargura, y + ombro,
    x, y + meiaAltura,
    x - meiaLargura, y + ombro,
    x - meiaLargura, y - ombro,
  ];
}

/** Todos os hexes que podem aparecer, mesmo que em parte, dentro de uma área do mundo. */
export function hexesNaArea({ minX, minY, maxX, maxY }: AreaMundo): CoordHex[] {
  const rMin = Math.floor((minY - METADE_ALTURA_HEX) / ALTURA_LINHA);
  const rMax = Math.ceil((maxY + METADE_ALTURA_HEX) / ALTURA_LINHA);
  const meiaLargura = LARGURA_COLUNA / 2;
  const hexes: CoordHex[] = [];
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor((minX - meiaLargura) / LARGURA_COLUNA - r / 2);
    const qMax = Math.ceil((maxX + meiaLargura) / LARGURA_COLUNA - r / 2);
    for (let q = qMin; q <= qMax; q++) {
      hexes.push({ q, r });
    }
  }
  return hexes;
}

/** Hexes vizinhos em sequência de `a` até `b`, incluindo os dois. */
export function linhaHex(a: CoordHex, b: CoordHex): CoordHex[] {
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  const passos = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
  if (passos === 0) {
    return [a];
  }
  const linha: CoordHex[] = [];
  for (let i = 0; i <= passos; i++) {
    const t = i / passos;
    // O pequeno desvio evita empates quando a linha passa exatamente na borda entre hexes.
    linha.push(arredondarHex(a.q + dq * t + 1e-6, a.r + dr * t + 2e-6));
  }
  return linha;
}

/** Hex que contém um ponto do mundo. */
export function mundoParaHex({ x, y }: PontoMundo): CoordHex {
  const r = y / ALTURA_LINHA;
  const q = x / LARGURA_COLUNA - r / 2;
  return arredondarHex(q, r);
}

/**
 * Arredonda coordenadas fracionárias para o hex mais próximo. Usa a terceira
 * coordenada (s = -q - r): a que mais se afastou do inteiro é recalculada
 * a partir das outras duas, o que mantém a soma das três igual a zero.
 */
function arredondarHex(q: number, r: number): CoordHex {
  const s = -q - r;
  let qInteiro = Math.round(q);
  let rInteiro = Math.round(r);
  const sInteiro = Math.round(s);

  const erroQ = Math.abs(qInteiro - q);
  const erroR = Math.abs(rInteiro - r);
  const erroS = Math.abs(sInteiro - s);

  if (erroQ > erroR && erroQ > erroS) {
    qInteiro = -rInteiro - sInteiro;
  } else if (erroR > erroS) {
    rInteiro = -qInteiro - sInteiro;
  }

  // Somar 0 transforma -0 em 0.
  return { q: qInteiro + 0, r: rInteiro + 0 };
}

import { Graphics } from 'pixi.js';
import { contornoHex, hexParaMundo, type CoordHex } from '../core/hex';
import { temAnotacoes, type EstadoMapa } from '../core/mapa';

const COR_FUNDO = 0x1d2029;
const COR_MARCADOR = 0xf0c870;
const COR_REVELADO = 0x9be08a;
const COR_PORTA = 0xc9a0ff;
const RAIO = 24;
/** Posição do marcador em relação ao centro do hex: no canto superior direito do chão. */
const DESLOCAMENTO_X = 72;
const DESLOCAMENTO_Y = -56;
const MEIA_LARGURA_LINHA = 11;
const ALTURAS_DAS_LINHAS = [-8, 0, 8];

/** Contorna os hexes revelados à mão, enquanto o mestre confere o que está visível. */
export function criarContornoRevelados() {
  const grafico = new Graphics();

  const atualizar = (estado: EstadoMapa, visivel: boolean) => {
    grafico.clear();
    if (!visivel) {
      return;
    }
    for (const hex of Object.values(estado.hexes)) {
      if (hex.revelado) {
        grafico.poly(contornoHex(hex.coord));
      }
    }
    grafico.stroke({ width: 6, color: COR_REVELADO });
  };

  return { grafico, atualizar };
}

/** Mostra quais hexes têm anotações, com um pequeno ícone de texto. */
export function criarCamadaMarcadores() {
  const grafico = new Graphics();

  const atualizar = (estado: EstadoMapa) => {
    grafico.clear();
    for (const hex of Object.values(estado.hexes)) {
      if (!temAnotacoes(hex)) {
        continue;
      }
      const centro = hexParaMundo(hex.coord);
      const x = centro.x + DESLOCAMENTO_X;
      const y = centro.y + DESLOCAMENTO_Y;
      grafico
        .circle(x, y, RAIO)
        .fill(COR_FUNDO)
        .stroke({ width: 4, color: COR_MARCADOR });
      for (const altura of ALTURAS_DAS_LINHAS) {
        grafico
          .moveTo(x - MEIA_LARGURA_LINHA, y + altura)
          .lineTo(x + MEIA_LARGURA_LINHA, y + altura)
          .stroke({ width: 4, color: COR_MARCADOR });
      }
    }
  };

  return { grafico, atualizar };
}

/**
 * Marca, só para o mestre, os hexes que têm instâncias: uma pequena porta no canto superior
 * esquerdo do chão (o marcador de anotações fica no direito).
 */
export function criarCamadaPortas() {
  const grafico = new Graphics();

  const atualizar = (hexes: readonly CoordHex[]) => {
    grafico.clear();
    for (const coord of hexes) {
      const centro = hexParaMundo(coord);
      const x = centro.x - DESLOCAMENTO_X;
      const y = centro.y + DESLOCAMENTO_Y;
      grafico
        .circle(x, y, RAIO)
        .fill(COR_FUNDO)
        .stroke({ width: 4, color: COR_PORTA });
      // A porta: um retângulo com o topo arredondado e a maçaneta.
      grafico
        .roundRect(x - 9, y - 13, 18, 26, 6)
        .stroke({ width: 4, color: COR_PORTA });
      grafico.circle(x + 4, y + 2, 2.5).fill(COR_PORTA);
    }
  };

  return { grafico, atualizar };
}

/**
 * O grupo no mapa: o token (estandarte com as cabeças dos membros), o deslize entre hexes,
 * os custos dos passos nos vizinhos e a trilha que só o mestre vê. Só desenha: quem decide
 * para onde o grupo pode ir são as regras em `core/`.
 */
import { Container, Graphics, Text, type Ticker } from 'pixi.js';
import { formatarDuracao, type PassoPossivel } from '../core/grupo';
import { contornoHex, distanciaHex, hexParaMundo, type CoordHex, type PontoMundo } from '../core/hex';

const COR_ESTANDARTE = 0xf0c870;
const COR_MASTRO = 0x5b4630;
const COR_BORDA = 0x1d2029;
const COR_OK = 0x9be08a;
const COR_MARCHA = 0xff9a5c;
const COR_BLOQUEIO = 0xe05c5c;
const COR_TRILHA = 0xf0c870;
/** Raio em que um clique "pega" o token, em pixels do mundo. */
export const RAIO_DO_TOKEN = 70;
const DURACAO_DESLIZE_MS = 450;

/** Um membro no token. Quando as fichas tiverem imagem, o retrato entra no lugar da inicial. */
export interface CabecaDoGrupo {
  readonly id: string;
  readonly nome: string;
}

/** Uma cor estável por membro, tirada do id, para cada um ser reconhecível. */
export function corDoMembro(id: string): number {
  let hash = 0;
  for (const letra of id) {
    hash = (hash * 31 + letra.charCodeAt(0)) >>> 0;
  }
  const cores = [0x6fa8dc, 0xe06666, 0x93c47d, 0xc27ba0, 0xf6b26b, 0x8e7cc3, 0x76a5af, 0xffd966];
  return cores[hash % cores.length];
}

function desenharEstandarte(): Graphics {
  return (
    new Graphics()
      // Sombra no chão.
      .ellipse(0, 4, 34, 12)
      .fill({ color: 0x000000, alpha: 0.35 })
      // Mastro.
      .roundRect(-4, -118, 8, 122, 3)
      .fill(COR_MASTRO)
      .stroke({ width: 2, color: COR_BORDA })
      // Bandeira com a ponta recortada.
      .poly([4, -112, 62, -112, 50, -92, 62, -72, 4, -72])
      .fill(COR_ESTANDARTE)
      .stroke({ width: 3, color: COR_BORDA })
      .circle(0, -120, 7)
      .fill(COR_ESTANDARTE)
      .stroke({ width: 2, color: COR_BORDA })
  );
}

function criarCabeca(cabeca: CabecaDoGrupo, raio: number): Container {
  const container = new Container();
  container.addChild(
    new Graphics().circle(0, 0, raio).fill(corDoMembro(cabeca.id)).stroke({ width: 3, color: COR_BORDA }),
  );
  const inicial = new Text({
    text: (cabeca.nome.trim()[0] ?? '?').toUpperCase(),
    style: { fontFamily: 'sans-serif', fontSize: raio * 1.1, fontWeight: 'bold', fill: 0xffffff },
  });
  inicial.anchor.set(0.5);
  container.addChild(inicial);
  return container;
}

export function criarCamadaGrupo(ticker: Ticker) {
  const token = new Container();
  token.addChild(desenharEstandarte());
  const cabecas = new Container();
  token.addChild(cabecas);
  token.visible = false;

  const selecao = new Graphics();
  const passos = new Container();
  const trilha = new Graphics();

  let posicao: CoordHex | null = null;
  let deslize: { de: PontoMundo; para: PontoMundo; inicio: number } | null = null;
  let arrastando = false;

  const colocarEm = (ponto: PontoMundo) => token.position.set(ponto.x, ponto.y);

  ticker.add(() => {
    if (!deslize || arrastando) {
      return;
    }
    const t = Math.min(1, (performance.now() - deslize.inicio) / DURACAO_DESLIZE_MS);
    // Começa rápido e chega devagar.
    const suave = 1 - (1 - t) ** 3;
    colocarEm({
      x: deslize.de.x + (deslize.para.x - deslize.de.x) * suave,
      y: deslize.de.y + (deslize.para.y - deslize.de.y) * suave,
    });
    if (t >= 1) {
      deslize = null;
    }
  });

  const deslizarPara = (destino: PontoMundo) => {
    deslize = { de: { x: token.position.x, y: token.position.y }, para: destino, inicio: performance.now() };
  };

  return {
    token,
    selecao,
    passos,
    trilha,

    /** Onde o grupo está. Mudar para um hex vizinho desliza; mais longe, o token salta. */
    atualizar(nova: CoordHex | null) {
      token.visible = nova !== null;
      if (!nova) {
        posicao = null;
        deslize = null;
        return;
      }
      const centro = hexParaMundo(nova);
      const mudou = posicao?.q !== nova.q || posicao?.r !== nova.r;
      const vizinho = posicao !== null && distanciaHex(posicao, nova) === 1;
      if (mudou && vizinho && token.visible) {
        deslizarPara(centro);
      } else if (mudou || (!deslize && !arrastando)) {
        deslize = null;
        colocarEm(centro);
      }
      posicao = nova;
    },

    /** As cabeças dos membros, numa fileira na base do estandarte. */
    definirCabecas(lista: readonly CabecaDoGrupo[]) {
      cabecas.removeChildren().forEach((filho) => filho.destroy({ children: true }));
      const raio = 15;
      const espaco = raio * 1.6;
      const largura = (lista.length - 1) * espaco;
      lista.forEach((cabeca, i) => {
        const desenho = criarCabeca(cabeca, raio);
        desenho.position.set(i * espaco - largura / 2, -20);
        cabecas.addChild(desenho);
      });
    },

    /** O token acompanha o mouse enquanto é arrastado; `null` o devolve ao hex do grupo. */
    moverVisual(ponto: PontoMundo | null) {
      if (ponto) {
        arrastando = true;
        deslize = null;
        colocarEm(ponto);
        return;
      }
      arrastando = false;
      if (posicao) {
        deslizarPara(hexParaMundo(posicao));
      }
    },

    /** Contorno do hex do grupo quando o token está selecionado. */
    marcarSelecionado(selecionado: boolean) {
      selecao.clear();
      if (selecionado && posicao) {
        selecao.poly(contornoHex(posicao)).stroke({ width: 8, color: COR_ESTANDARTE });
      }
    },

    /** Os custos dos passos nos vizinhos; `destaque` é o vizinho sob o mouse. */
    mostrarPassos(lista: readonly PassoPossivel[] | null, destaque: CoordHex | null) {
      passos.removeChildren().forEach((filho) => filho.destroy({ children: true }));
      if (!lista) {
        return;
      }
      for (const passo of lista) {
        const cor = !passo.ok ? COR_BLOQUEIO : passo.marchaForcada ? COR_MARCHA : COR_OK;
        const realce = destaque?.q === passo.coord.q && destaque.r === passo.coord.r;
        passos.addChild(
          new Graphics()
            .poly(contornoHex(passo.coord))
            .fill({ color: cor, alpha: realce ? 0.3 : 0.14 })
            .stroke({ width: realce ? 8 : 4, color: cor }),
        );
        const texto = !passo.ok ? '✕' : passo.marchaForcada ? `${formatarDuracao(passo.minutos)} ⚠` : formatarDuracao(passo.minutos);
        const rotulo = new Text({
          text: texto,
          style: {
            fontFamily: 'sans-serif',
            fontSize: 34,
            fontWeight: 'bold',
            fill: cor,
            stroke: { color: COR_BORDA, width: 6 },
          },
        });
        rotulo.anchor.set(0.5);
        const centro = hexParaMundo(passo.coord);
        rotulo.position.set(centro.x, centro.y);
        passos.addChild(rotulo);
      }
    },

    /** Linha tracejada pelos hexes percorridos; `null` esconde (modo jogador). */
    atualizarTrilha(coords: readonly CoordHex[] | null) {
      trilha.clear();
      if (!coords || coords.length < 2) {
        return;
      }
      const traco = 22;
      const vao = 16;
      for (let i = 1; i < coords.length; i++) {
        const a = hexParaMundo(coords[i - 1]);
        const b = hexParaMundo(coords[i]);
        const comprimento = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = 0; d < comprimento; d += traco + vao) {
          const fim = Math.min(d + traco, comprimento);
          trilha
            .moveTo(a.x + ((b.x - a.x) * d) / comprimento, a.y + ((b.y - a.y) * d) / comprimento)
            .lineTo(a.x + ((b.x - a.x) * fim) / comprimento, a.y + ((b.y - a.y) * fim) / comprimento);
        }
        trilha.circle(a.x, a.y, 7);
      }
      trilha.stroke({ width: 6, color: COR_TRILHA, alpha: 0.75 });
    },
  };
}

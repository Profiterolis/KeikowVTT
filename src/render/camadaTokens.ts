/**
 * Os tokens de uma instância: círculos com a imagem da ficha (ou a inicial), borda pela cor do
 * tipo, barra de PV para quem pode vê-la, nome ao passar o mouse e o arraste com a distância.
 * Só desenha e avisa; quem decide se o movimento vale é a loja das instâncias.
 */
import { Container, FederatedPointerEvent, Graphics, Sprite, Text, Texture, type Ticker } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { PontoMundo } from '../core/hex';
import type { TokenVisto } from '../core/tokens';
import { corDoMembro, type CarregarImagem } from './camadaGrupo';

/** Um token como a tela o recebe, tudo já decidido no `core/` (nome visível, PV ou não, se pode mover). */
export type TokenParaDesenhar = TokenVisto;

export interface EventosDosTokens {
  /**
   * Soltou o token num lugar novo. Devolve se o movimento valeu; se não, o token volta.
   * `ignorarParedes` é o Shift apertado (vale só para o mestre).
   */
  aoMover(tokenId: string, x: number, y: number, ignorarParedes: boolean): boolean;
  /**
   * Até onde o token chega indo até `destino`, deslizando nas paredes (decidido no `core/`),
   * e os pontos onde o caminho muda de direção.
   */
  limitar(tokenId: string, destino: PontoMundo, ignorarParedes: boolean): { final: PontoMundo; caminho: readonly PontoMundo[] };
  /** Clique com o botão direito (sem arrastar), na posição da tela. */
  aoMenu(tokenId: string, clientX: number, clientY: number): void;
  /** Tentou arrastar um token que não pode mover. */
  aoRecusar(tokenId: string): void;
}

export const COR_POR_TIPO: Readonly<Record<TokenParaDesenhar['tipo'], number>> = {
  personagem: 0x6fcf73,
  npc: 0xf2c94c,
  monstro: 0xe05c5c,
};
const COR_SELECAO = 0xffffff;
const COR_LINHA = 0xffc857;
const COR_BLOQUEIO = 0xe05c5c;
const DURACAO_DESLIZE_MS = 250;
/** Abaixo disto (em pixels da tela), o arraste conta como clique. */
const TOLERANCIA_CLIQUE = 4;
const ESTILO_ROTULO = {
  fill: 0xffffff,
  fontSize: 15,
  fontFamily: 'system-ui, sans-serif',
  stroke: { color: 0x000000, width: 4 },
} as const;

function texturaDoEndereco(endereco: string): Promise<Texture | null> {
  return new Promise((resolver) => {
    const imagem = new Image();
    imagem.onload = () => resolver(Texture.from(imagem));
    imagem.onerror = () => resolver(null);
    imagem.src = endereco;
  });
}

function formatarMetros(metros: number): string {
  return `${metros.toLocaleString('pt-BR', { maximumFractionDigits: metros < 10 ? 1 : 0 })} m`;
}

/** Verde com a vida cheia, amarelo pela metade, vermelho perto de zero. */
function corDaVida(fracao: number): number {
  return fracao > 0.5 ? 0x5cc96b : fracao > 0.25 ? 0xf2c94c : 0xe05c5c;
}

interface Visual {
  readonly raiz: Container;
  /** O que muda com os dados (imagem, borda, PV): refeito quando eles mudam. */
  readonly corpo: Container;
  readonly selecao: Graphics;
  readonly rotulo: Text;
  dados: TokenParaDesenhar;
  chave: string;
  deslize: { de: PontoMundo; para: PontoMundo; inicio: number } | null;
}

/** O que desenha o corpo: se nada disto mudou, o corpo não é refeito. */
const chaveDoCorpo = (t: TokenParaDesenhar) =>
  JSON.stringify([t.diametro, t.imagem, t.nome, t.tipo, t.pv, t.escondido, t.travado, t.fichaId]);

export interface CamadaTokens {
  readonly container: Container;
  mostrar(tokens: readonly TokenParaDesenhar[]): void;
  /** Liga ou desliga a interação (a régua usa o botão esquerdo). */
  interativa(ligada: boolean): void;
  /** Mantém o tamanho dos textos na tela quando o zoom muda. */
  ajustarAoZoom(): void;
  /** A escala da instância, para a distância do arraste em metros. */
  definirEscala(metrosPorPixel: number): void;
}

export function criarCamadaTokens(
  camera: Viewport,
  canvas: HTMLCanvasElement,
  ticker: Ticker,
  carregarImagem: CarregarImagem,
  eventos: () => EventosDosTokens | null,
  /** Enquanto um token é arrastado, onde ele está (para a visão acompanhar); `null` quando volta. */
  aoArrastar: (tokenId: string, ponto: PontoMundo | null) => void = () => undefined,
): CamadaTokens {
  const container = new Container();
  const linha = new Graphics();
  const rotuloLinha = new Text({ text: '', style: ESTILO_ROTULO });
  rotuloLinha.visible = false;
  const camadaTokens = new Container();
  container.addChild(linha, camadaTokens, rotuloLinha);

  const visuais = new Map<string, Visual>();
  const texturas = new Map<string, Promise<Texture | null>>();
  let selecionado: string | null = null;
  let sobMouse: string | null = null;
  let ligada = true;
  let metrosPorPixel = 0.015;
  let arraste: {
    id: string;
    origem: PontoMundo;
    /** Diferença entre o ponto pego e o centro do token. */
    desvio: PontoMundo;
    inicioNaTela: PontoMundo;
    movendo: boolean;
    /** Para onde o ponteiro quer levar o token; o token fica onde a parede deixa. */
    pretendido: PontoMundo | null;
    ignorarParedes: boolean;
    /** Os pontos onde o caminho muda de direção, deslizando nas paredes. */
    caminho: readonly PontoMundo[];
  } | null = null;
  let cliqueDireito: { id: string; x: number; y: number } | null = null;

  const texturaDe = (id: string) => {
    let textura = texturas.get(id);
    if (!textura) {
      textura = carregarImagem(id).then((endereco) => (endereco ? texturaDoEndereco(endereco) : null));
      texturas.set(id, textura);
      void textura.then((carregada) => carregada ?? texturas.delete(id));
    }
    return textura;
  };

  const escalaDoTexto = () => 1 / camera.scale.x;

  const mundoDaTela = (clientX: number, clientY: number): PontoMundo => {
    const retangulo = canvas.getBoundingClientRect();
    const { x, y } = camera.toWorld(clientX - retangulo.left, clientY - retangulo.top);
    return { x, y };
  };

  const atualizarRotulo = (visual: Visual) => {
    const raio = visual.dados.diametro / 2;
    const visivel = visual.dados.id === sobMouse || visual.dados.id === selecionado || arraste?.id === visual.dados.id;
    visual.rotulo.visible = visivel;
    visual.rotulo.scale.set(escalaDoTexto());
    // Abaixo do token e da barra de PV.
    visual.rotulo.position.set(0, raio + raio * 0.3 + 4 * escalaDoTexto());
  };

  const desenharSelecao = (visual: Visual) => {
    const raio = visual.dados.diametro / 2;
    visual.selecao.clear();
    if (visual.dados.id === selecionado || arraste?.id === visual.dados.id) {
      visual.selecao.circle(0, 0, raio + Math.max(raio * 0.12, 3 * escalaDoTexto())).stroke({
        color: COR_SELECAO,
        width: Math.max(raio * 0.06, 2 * escalaDoTexto()),
        alpha: 0.9,
      });
    }
  };

  const desenharCorpo = (visual: Visual) => {
    const { corpo, dados } = visual;
    for (const filho of corpo.removeChildren()) {
      filho.destroy({ children: true });
    }
    const raio = dados.diametro / 2;
    const borda = Math.max(raio * 0.1, 1.5);
    // Sombra no chão.
    corpo.addChild(new Graphics().ellipse(raio * 0.08, raio * 0.15, raio, raio * 0.95).fill({ color: 0x000000, alpha: 0.35 }));
    corpo.addChild(new Graphics().circle(0, 0, raio).fill(corDoMembro(dados.fichaId)));
    const inicial = new Text({
      text: (dados.nome.trim()[0] ?? '?').toUpperCase(),
      style: { fontFamily: 'system-ui, sans-serif', fontSize: Math.max(raio * 1.1, 4), fontWeight: 'bold', fill: 0xffffff },
    });
    inicial.anchor.set(0.5);
    corpo.addChild(inicial);
    corpo.addChild(new Graphics().circle(0, 0, raio - borda / 2).stroke({ width: borda, color: COR_POR_TIPO[dados.tipo] }));
    if (dados.imagem) {
      void texturaDe(dados.imagem).then((textura) => {
        // O token pode ter sido refeito enquanto a imagem carregava.
        if (!textura || corpo.destroyed || visual.chave !== chaveDoCorpo(dados)) {
          return;
        }
        const retrato = new Sprite(textura);
        retrato.anchor.set(0.5);
        retrato.scale.set((raio * 2) / Math.min(textura.width, textura.height));
        const mascara = new Graphics().circle(0, 0, raio - borda).fill(0xffffff);
        retrato.mask = mascara;
        inicial.visible = false;
        corpo.addChildAt(mascara, 2);
        corpo.addChildAt(retrato, 3);
      });
    }
    if (dados.pv && dados.pv.maximo > 0) {
      const fracao = Math.min(Math.max(dados.pv.atuais / dados.pv.maximo, 0), 1);
      const largura = raio * 1.6;
      const altura = Math.max(raio * 0.16, 2);
      const y = raio + raio * 0.08;
      corpo.addChild(
        new Graphics()
          .rect(-largura / 2, y, largura, altura)
          .fill({ color: 0x000000, alpha: 0.7 })
          .rect(-largura / 2, y, largura * fracao, altura)
          .fill(corDaVida(fracao)),
      );
    }
    if (dados.travado) {
      const cadeado = new Text({ text: '🔒', style: { fontSize: Math.max(raio * 0.55, 4) } });
      cadeado.anchor.set(0.5);
      cadeado.position.set(raio * 0.72, -raio * 0.72);
      corpo.addChild(cadeado);
    }
    // O mestre vê o token escondido meio transparente; os jogadores nem o recebem.
    corpo.alpha = dados.escondido ? 0.45 : 1;
    visual.raiz.cursor = dados.podeMover ? 'grab' : 'pointer';
  };

  const desenharLinha = (visual: Visual | null) => {
    linha.clear();
    rotuloLinha.visible = false;
    if (!arraste || !arraste.movendo || !visual) {
      return;
    }
    const { origem, pretendido, caminho } = arraste;
    const ate = visual.raiz.position;
    const escala = escalaDoTexto();
    linha.moveTo(origem.x, origem.y);
    for (const ponto of caminho) {
      linha.lineTo(ponto.x, ponto.y);
    }
    linha
      .lineTo(ate.x, ate.y)
      .stroke({ color: COR_LINHA, width: 3 * escala })
      .circle(origem.x, origem.y, 5 * escala)
      .fill(COR_LINHA);
    // Uma parede no caminho: o resto da linha fica vermelho, até onde o ponteiro está.
    if (pretendido && Math.hypot(pretendido.x - ate.x, pretendido.y - ate.y) > 1) {
      linha
        .moveTo(ate.x, ate.y)
        .lineTo(pretendido.x, pretendido.y)
        .stroke({ color: COR_BLOQUEIO, width: 2 * escala, alpha: 0.8 })
        .circle(pretendido.x, pretendido.y, 4 * escala)
        .fill(COR_BLOQUEIO);
    }
    // A distância conta o caminho inteiro, com os desvios.
    const pontos = [origem, ...caminho, { x: ate.x, y: ate.y }];
    const metros = pontos.slice(1).reduce((soma, p, i) => soma + Math.hypot(p.x - pontos[i].x, p.y - pontos[i].y), 0) * metrosPorPixel;
    const deslocamento = visual.dados.deslocamento;
    rotuloLinha.text = formatarMetros(metros) + (deslocamento !== null ? ` · deslocamento ${formatarMetros(deslocamento)}` : '');
    rotuloLinha.scale.set(escala);
    rotuloLinha.position.set(ate.x + visual.dados.diametro / 2 + 8 * escala, ate.y - 10 * escala);
    rotuloLinha.visible = true;
  };

  const criarVisual = (dados: TokenParaDesenhar): Visual => {
    const raiz = new Container();
    const corpo = new Container();
    const selecao = new Graphics();
    const rotulo = new Text({ text: '', style: ESTILO_ROTULO });
    rotulo.anchor.set(0.5, 0);
    raiz.addChild(selecao, corpo, rotulo);
    raiz.eventMode = 'static';
    const visual: Visual = { raiz, corpo, selecao, rotulo, dados, chave: '', deslize: null };

    raiz.on('pointerdown', (evento: FederatedPointerEvent) => {
      if (!ligada || evento.button !== 0) {
        return;
      }
      evento.stopPropagation();
      const ponto = mundoDaTela(evento.clientX, evento.clientY);
      visual.deslize = null;
      arraste = {
        id: visual.dados.id,
        origem: { x: raiz.x, y: raiz.y },
        desvio: { x: ponto.x - raiz.x, y: ponto.y - raiz.y },
        inicioNaTela: { x: evento.clientX, y: evento.clientY },
        movendo: false,
        pretendido: null,
        ignorarParedes: false,
        caminho: [],
      };
      // Fica por cima dos outros enquanto é arrastado.
      camadaTokens.addChild(raiz);
    });
    raiz.on('rightdown', (evento: FederatedPointerEvent) => {
      cliqueDireito = { id: visual.dados.id, x: evento.clientX, y: evento.clientY };
    });
    raiz.on('rightup', (evento: FederatedPointerEvent) => {
      const clique = cliqueDireito;
      cliqueDireito = null;
      // Arrastar com o direito move a câmera: só um clique parado abre o menu.
      if (clique?.id === visual.dados.id && Math.hypot(evento.clientX - clique.x, evento.clientY - clique.y) < TOLERANCIA_CLIQUE) {
        eventos()?.aoMenu(visual.dados.id, evento.clientX, evento.clientY);
      }
    });
    raiz.on('pointerover', () => {
      sobMouse = visual.dados.id;
      atualizarRotulo(visual);
    });
    raiz.on('pointerout', () => {
      if (sobMouse === visual.dados.id) {
        sobMouse = null;
      }
      atualizarRotulo(visual);
    });
    return visual;
  };

  const redesenharSelecoes = () =>
    visuais.forEach((v) => {
      desenharSelecao(v);
      atualizarRotulo(v);
    });

  const aoMoverPonteiro = (evento: PointerEvent) => {
    if (!arraste) {
      return;
    }
    const visual = visuais.get(arraste.id);
    if (!visual) {
      arraste = null;
      return;
    }
    const naTela = Math.hypot(evento.clientX - arraste.inicioNaTela.x, evento.clientY - arraste.inicioNaTela.y);
    if (!arraste.movendo && naTela >= TOLERANCIA_CLIQUE) {
      if (!visual.dados.podeMover) {
        const id = arraste.id;
        arraste = null;
        eventos()?.aoRecusar(id);
        return;
      }
      arraste.movendo = true;
      selecionado = arraste.id;
      redesenharSelecoes();
    }
    if (arraste.movendo) {
      const ponto = mundoDaTela(evento.clientX, evento.clientY);
      const pretendido = { x: ponto.x - arraste.desvio.x, y: ponto.y - arraste.desvio.y };
      arraste.pretendido = pretendido;
      arraste.ignorarParedes = evento.shiftKey;
      // As paredes valem a partir de onde o token estava, em linha reta.
      const limite = eventos()?.limitar(arraste.id, pretendido, evento.shiftKey) ?? { final: pretendido, caminho: [] };
      arraste.caminho = limite.caminho;
      visual.raiz.position.set(limite.final.x, limite.final.y);
      desenharLinha(visual);
      aoArrastar(arraste.id, limite.final);
    }
  };

  const aoSoltar = (evento: PointerEvent) => {
    if (!arraste || evento.button !== 0) {
      return;
    }
    const atual = arraste;
    arraste = null;
    const visual = visuais.get(atual.id);
    desenharLinha(null);
    if (!visual) {
      return;
    }
    if (!atual.movendo) {
      // Um clique marca o token (e mostra o nome); outro clique desmarca.
      selecionado = selecionado === atual.id ? null : atual.id;
      redesenharSelecoes();
      return;
    }
    const valeu = eventos()?.aoMover(atual.id, visual.raiz.x, visual.raiz.y, atual.ignorarParedes) ?? false;
    if (!valeu) {
      // Recusado: volta deslizando para onde estava.
      visual.deslize = { de: { x: visual.raiz.x, y: visual.raiz.y }, para: atual.origem, inicio: performance.now() };
      aoArrastar(atual.id, null);
    }
    redesenharSelecoes();
  };

  window.addEventListener('pointermove', aoMoverPonteiro);
  window.addEventListener('pointerup', aoSoltar);
  // Um clique no chão (fora dos tokens) desmarca.
  canvas.addEventListener('pointerdown', (evento) => {
    if (evento.button === 0 && !arraste && selecionado) {
      selecionado = null;
      redesenharSelecoes();
    }
  });

  ticker.add(() => {
    for (const visual of visuais.values()) {
      const deslize = visual.deslize;
      if (!deslize || arraste?.id === visual.dados.id) {
        continue;
      }
      const t = Math.min(1, (performance.now() - deslize.inicio) / DURACAO_DESLIZE_MS);
      const suave = 1 - (1 - t) ** 3;
      visual.raiz.position.set(deslize.de.x + (deslize.para.x - deslize.de.x) * suave, deslize.de.y + (deslize.para.y - deslize.de.y) * suave);
      if (t >= 1) {
        visual.deslize = null;
      }
    }
  });

  container.on('destroyed', () => {
    window.removeEventListener('pointermove', aoMoverPonteiro);
    window.removeEventListener('pointerup', aoSoltar);
  });

  return {
    container,
    mostrar(tokens) {
      const presentes = new Set(tokens.map((t) => t.id));
      for (const [id, visual] of visuais) {
        if (!presentes.has(id)) {
          visual.raiz.destroy({ children: true });
          visuais.delete(id);
          if (arraste?.id === id) {
            arraste = null;
            desenharLinha(null);
          }
        }
      }
      if (selecionado && !presentes.has(selecionado)) {
        selecionado = null;
      }
      // Os de baixo na tela (maior y) por cima, como pessoas em pé.
      const ordenados = [...tokens].sort((a, b) => a.y - b.y);
      for (const dados of ordenados) {
        let visual = visuais.get(dados.id);
        if (!visual) {
          visual = criarVisual(dados);
          visual.raiz.position.set(dados.x, dados.y);
          visuais.set(dados.id, visual);
        } else if (arraste?.id !== dados.id && (visual.dados.x !== dados.x || visual.dados.y !== dados.y)) {
          // Mudou de lugar (outro jogador, desfazer): desliza da posição atual até a nova.
          visual.deslize = { de: { x: visual.raiz.x, y: visual.raiz.y }, para: { x: dados.x, y: dados.y }, inicio: performance.now() };
        }
        visual.dados = dados;
        const chave = chaveDoCorpo(dados);
        if (chave !== visual.chave) {
          visual.chave = chave;
          visual.rotulo.text = dados.nome;
          desenharCorpo(visual);
        }
        visual.raiz.cursor = dados.podeMover ? 'grab' : 'pointer';
        camadaTokens.addChild(visual.raiz);
      }
      redesenharSelecoes();
    },
    interativa(valor) {
      ligada = valor;
      camadaTokens.eventMode = valor ? 'passive' : 'none';
      if (!valor && arraste) {
        const visual = visuais.get(arraste.id);
        if (visual) {
          visual.raiz.position.set(arraste.origem.x, arraste.origem.y);
        }
        aoArrastar(arraste.id, null);
        arraste = null;
        desenharLinha(null);
      }
    },
    ajustarAoZoom() {
      redesenharSelecoes();
      if (arraste) {
        desenharLinha(visuais.get(arraste.id) ?? null);
      }
    },
    definirEscala(valor) {
      metrosPorPixel = valor;
    },
  };
}

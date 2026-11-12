/**
 * A cena PixiJS de uma instância tática: a imagem de fundo, a câmera, os tokens e as réguas
 * (a de acertar a escala, do mestre, e a de medir distâncias, de todos).
 * É separada da cena do mapa-mundi: cada uma tem a própria câmera e as próprias camadas.
 * Só desenha; quem decide o que muda são as lojas do `core/`.
 */
import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { pixelsEmMetros, type Instancia } from '../core/instancias';
import type { PontoMundo } from '../core/hex';
import type { CarregarImagem } from './camadaGrupo';
import { criarCamadaTokens, type EventosDosTokens, type TokenParaDesenhar } from './camadaTokens';

const ZOOM_MINIMO = 0.02;
const ZOOM_MAXIMO = 8;
const BOTAO_ESQUERDO = 0;
const COR_SEM_IMAGEM = 0x2a2d36;
const COR_BORDA = 0x5b6170;
const COR_REGUA = 0xffc857;
/**
 * Placas de vídeo têm um limite para o tamanho de uma imagem (em geral 8.000 a 16.000 pixels).
 * Imagens maiores que isto são cortadas em pedaços, cada um uma textura própria.
 */
const LADO_DO_PEDACO = 4096;

export interface CenaInstancia {
  /** Desenha esta instância (ou nada). Só recarrega a imagem quando ela muda. */
  mostrar(instancia: Instancia | null): void;
  /** Mostra a instância inteira na tela. */
  enquadrar(): void;
  /**
   * Liga a régua: dois cliques com o botão esquerdo medem uma distância em pixels da imagem.
   * `null` desliga.
   */
  medir(aoMedir: ((pixels: number) => void) | null): void;
  /** Liga a régua de distâncias: apertar, arrastar e soltar mede em metros. */
  regua(ligada: boolean): void;
  tokens(lista: readonly TokenParaDesenhar[]): void;
  aoTokens(eventos: EventosDosTokens | null): void;
  /** Leva a câmera, deslizando, até um ponto da instância (o token de um jogador, no "Ir até"). */
  centralizarEm(x: number, y: number): void;
  /** O ponto da instância sob uma posição da tela (para soltar algo arrastado de fora), ou `null`. */
  paraMundo(clientX: number, clientY: number): PontoMundo | null;
  destruir(): void;
}

function carregarElemento(endereco: string): Promise<HTMLImageElement | null> {
  return new Promise((resolver) => {
    const imagem = new Image();
    imagem.onload = () => resolver(imagem);
    imagem.onerror = () => resolver(null);
    imagem.src = endereco;
  });
}

/** Pedaços de até `LADO_DO_PEDACO` de lado, com a posição de cada um na imagem. */
async function pedacosDaImagem(imagem: HTMLImageElement): Promise<{ textura: Texture; x: number; y: number }[]> {
  const { naturalWidth: largura, naturalHeight: altura } = imagem;
  if (largura <= LADO_DO_PEDACO && altura <= LADO_DO_PEDACO) {
    return [{ textura: Texture.from(imagem), x: 0, y: 0 }];
  }
  const pedacos: Promise<{ textura: Texture; x: number; y: number }>[] = [];
  for (let y = 0; y < altura; y += LADO_DO_PEDACO) {
    for (let x = 0; x < largura; x += LADO_DO_PEDACO) {
      const w = Math.min(LADO_DO_PEDACO, largura - x);
      const h = Math.min(LADO_DO_PEDACO, altura - y);
      pedacos.push(createImageBitmap(imagem, x, y, w, h).then((bitmap) => ({ textura: Texture.from(bitmap), x, y })));
    }
  }
  return Promise.all(pedacos);
}

/** "12,5 m" com vírgula, como no resto do app. */
function formatarMetros(metros: number): string {
  return `${metros.toLocaleString('pt-BR', { maximumFractionDigits: metros < 10 ? 2 : 1 })} m`;
}

export function criarCenaInstancia(container: HTMLElement, carregarImagem: CarregarImagem): CenaInstancia {
  const app = new Application();
  let pronta = false;
  let destruida = false;
  let pendente: Instancia | null = null;
  let controles: Omit<CenaInstancia, 'destruir' | 'aoTokens'> | null = null;
  let medicaoPendente: ((pixels: number) => void) | null = null;
  let reguaPendente = false;
  let tokensPendentes: readonly TokenParaDesenhar[] = [];
  let eventosPendentes: EventosDosTokens | null = null;
  /** Um "Ir até" pedido antes de a cena ficar pronta: vale logo depois do enquadramento. */
  let focoPendente: PontoMundo | null = null;

  const iniciar = async () => {
    await app.init({
      resizeTo: container,
      background: '#14161c',
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    if (destruida) {
      app.destroy(true);
      return;
    }
    pronta = true;
    container.appendChild(app.canvas);
    controles = montar(app, carregarImagem, () => eventosPendentes);
    controles.mostrar(pendente);
    controles.enquadrar();
    if (focoPendente) {
      controles.centralizarEm(focoPendente.x, focoPendente.y);
      focoPendente = null;
    }
    controles.medir(medicaoPendente);
    controles.regua(reguaPendente);
    controles.tokens(tokensPendentes);
  };
  void iniciar();

  return {
    mostrar(instancia) {
      pendente = instancia;
      controles?.mostrar(instancia);
    },
    enquadrar: () => controles?.enquadrar(),
    medir(aoMedir) {
      medicaoPendente = aoMedir;
      controles?.medir(aoMedir);
    },
    regua(ligada) {
      reguaPendente = ligada;
      controles?.regua(ligada);
    },
    tokens(lista) {
      tokensPendentes = lista;
      controles?.tokens(lista);
    },
    aoTokens(eventos) {
      eventosPendentes = eventos;
    },
    centralizarEm(x, y) {
      if (controles) {
        controles.centralizarEm(x, y);
      } else {
        focoPendente = { x, y };
      }
    },
    paraMundo: (clientX, clientY) => controles?.paraMundo(clientX, clientY) ?? null,
    destruir() {
      destruida = true;
      controles = null;
      if (pronta) {
        app.destroy(true, { children: true, texture: true });
      }
    },
  };
}

function montar(
  app: Application,
  carregarImagem: CarregarImagem,
  eventosDosTokens: () => EventosDosTokens | null,
): Omit<CenaInstancia, 'destruir' | 'aoTokens'> {
  const camera = new Viewport({
    screenWidth: app.screen.width,
    screenHeight: app.screen.height,
    events: app.renderer.events,
    disableOnContextMenu: true,
  });
  // Como no mapa-mundi: o botão esquerdo fica livre (tokens, régua), a câmera anda com o direito ou o do meio.
  camera
    .drag({ mouseButtons: 'middle-right' })
    .pinch()
    .wheel()
    .clampZoom({ minScale: ZOOM_MINIMO, maxScale: ZOOM_MAXIMO });
  app.stage.addChild(camera);
  app.renderer.on('resize', (largura: number, altura: number) => camera.resize(largura, altura));

  const fundo = new Container();
  const semImagem = new Graphics();
  const borda = new Graphics();
  /** Os tokens; as paredes e a luz entram aqui também, entre o fundo e a régua, nos próximos passos. */
  const objetos = new Container();
  const camadaTokens = criarCamadaTokens(camera, app.canvas, app.ticker, carregarImagem, eventosDosTokens);
  objetos.addChild(camadaTokens.container);
  const regua = new Graphics();
  const rotuloRegua = new Text({
    text: '',
    style: { fill: 0xffffff, fontSize: 16, fontFamily: 'system-ui, sans-serif', stroke: { color: 0x000000, width: 4 } },
  });
  rotuloRegua.visible = false;
  camera.addChild(semImagem, fundo, borda, objetos, regua, rotuloRegua);

  let atual: Instancia | null = null;
  let imagemCarregada: string | null = null;
  /** Cada carga recebe um número; uma carga antiga que termina depois de uma nova é ignorada. */
  let numeroDaCarga = 0;

  const limparFundo = () => {
    for (const filho of fundo.removeChildren()) {
      filho.destroy({ texture: true, textureSource: true });
    }
  };

  const desenharMoldura = (instancia: Instancia | null) => {
    semImagem.clear();
    borda.clear();
    if (!instancia) {
      return;
    }
    if (!instancia.imagem) {
      semImagem.rect(0, 0, instancia.largura, instancia.altura).fill(COR_SEM_IMAGEM);
    }
    borda
      .rect(0, 0, instancia.largura, instancia.altura)
      .stroke({ color: COR_BORDA, width: 2, pixelLine: true });
  };

  const carregarFundo = async (instancia: Instancia) => {
    const numero = ++numeroDaCarga;
    const endereco = instancia.imagem ? await carregarImagem(instancia.imagem).catch(() => null) : null;
    const elemento = endereco ? await carregarElemento(endereco) : null;
    const pedacos = elemento ? await pedacosDaImagem(elemento).catch(() => []) : [];
    if (numero !== numeroDaCarga) {
      pedacos.forEach((p) => p.textura.destroy(true));
      return;
    }
    limparFundo();
    if (!elemento || pedacos.length === 0) {
      return;
    }
    // A imagem ocupa o tamanho da instância, mesmo que o mestre tenha mudado o tamanho à mão.
    const escalaX = atual ? atual.largura / elemento.naturalWidth : 1;
    const escalaY = atual ? atual.altura / elemento.naturalHeight : 1;
    for (const { textura, x, y } of pedacos) {
      const sprite = new Sprite(textura);
      sprite.position.set(x * escalaX, y * escalaY);
      sprite.scale.set(escalaX, escalaY);
      fundo.addChild(sprite);
    }
  };

  const mostrar = (instancia: Instancia | null) => {
    if (instancia) {
      camadaTokens.definirEscala(instancia.metrosPorPixel);
    }
    const mudouTamanho = instancia?.largura !== atual?.largura || instancia?.altura !== atual?.altura;
    atual = instancia;
    desenharMoldura(instancia);
    const imagem = instancia?.imagem ?? null;
    if (imagem !== imagemCarregada || (mudouTamanho && imagem)) {
      imagemCarregada = imagem;
      limparFundo();
      numeroDaCarga += 1;
      if (instancia && imagem) {
        void carregarFundo(instancia);
      }
    }
  };

  const enquadrar = () => {
    if (!atual) {
      return;
    }
    // Uma pequena margem em volta, para a borda não colar na tela.
    camera.fit(true, atual.largura * 1.08, atual.altura * 1.08);
    camera.moveCenter(atual.largura / 2, atual.altura / 2);
  };

  // ---------- Réguas ----------
  let aoMedir: ((pixels: number) => void) | null = null;
  let reguaLivre = false;
  /** Na régua de distâncias, o botão está apertado (arrastando). */
  let medindoLivre = false;
  let inicio: PontoMundo | null = null;

  const mundoDoEvento = (evento: PointerEvent): PontoMundo => {
    const { x, y } = camera.toWorld(evento.offsetX, evento.offsetY);
    return { x, y };
  };

  const desenharRegua = (ate: PontoMundo | null) => {
    regua.clear();
    rotuloRegua.visible = false;
    if (!inicio || !ate) {
      return;
    }
    // A espessura acompanha o zoom, para a linha ter sempre o mesmo tamanho na tela.
    const espessura = 3 / camera.scale.x;
    regua.moveTo(inicio.x, inicio.y).lineTo(ate.x, ate.y).stroke({ color: COR_REGUA, width: espessura });
    regua.circle(inicio.x, inicio.y, 5 / camera.scale.x).fill(COR_REGUA);
    const pixels = Math.hypot(ate.x - inicio.x, ate.y - inicio.y);
    const metros = atual ? formatarMetros(pixelsEmMetros(atual, pixels)) : '';
    // A régua de distâncias mostra só os metros; a da escala mostra também os pixels da imagem.
    rotuloRegua.text = aoMedir ? `${Math.round(pixels)} px ≈ ${metros}` : metros;
    rotuloRegua.scale.set(1 / camera.scale.x);
    rotuloRegua.position.set(ate.x + 10 / camera.scale.x, ate.y + 10 / camera.scale.x);
    rotuloRegua.visible = true;
  };

  app.canvas.addEventListener('pointerdown', (evento) => {
    if (evento.button !== BOTAO_ESQUERDO) {
      return;
    }
    if (reguaLivre && !aoMedir) {
      inicio = mundoDoEvento(evento);
      medindoLivre = true;
      desenharRegua(inicio);
      return;
    }
    if (!aoMedir) {
      return;
    }
    const ponto = mundoDoEvento(evento);
    if (!inicio) {
      inicio = ponto;
      desenharRegua(ponto);
      return;
    }
    const pixels = Math.hypot(ponto.x - inicio.x, ponto.y - inicio.y);
    inicio = null;
    desenharRegua(null);
    if (pixels > 0) {
      aoMedir(pixels);
    }
  });
  app.canvas.addEventListener('pointermove', (evento) => {
    if ((aoMedir || medindoLivre) && inicio) {
      desenharRegua(mundoDoEvento(evento));
    }
  });
  // Soltar o botão deixa a medida na tela até o próximo clique.
  window.addEventListener('pointerup', (evento) => {
    if (evento.button === BOTAO_ESQUERDO) {
      medindoLivre = false;
    }
  });
  camera.on('zoomed', () => {
    camadaTokens.ajustarAoZoom();
  });

  /** Com uma régua ligada, o botão esquerdo é dela: os tokens não respondem. */
  const atualizarModo = () => {
    const comRegua = aoMedir !== null || reguaLivre;
    camadaTokens.interativa(!comRegua);
    // O PixiJS controla o cursor da tela: a cruz da régua passa por ele.
    app.renderer.events.cursorStyles.default = comRegua ? 'crosshair' : 'inherit';
    app.renderer.events.setCursor(comRegua ? 'crosshair' : 'inherit');
  };

  return {
    mostrar,
    enquadrar,
    medir(funcao) {
      aoMedir = funcao;
      inicio = null;
      desenharRegua(null);
      atualizarModo();
    },
    regua(ligada) {
      reguaLivre = ligada;
      medindoLivre = false;
      inicio = null;
      desenharRegua(null);
      atualizarModo();
    },
    tokens: (lista) => camadaTokens.mostrar(lista),
    centralizarEm(x, y) {
      // Aproxima até um token comum ficar com uns 60 pixels na tela, se a câmera estiver mais longe.
      const escala = atual ? Math.min(Math.max(camera.scale.x, 60 / (1.5 / atual.metrosPorPixel)), ZOOM_MAXIMO) : camera.scale.x;
      camera.animate({ position: { x, y }, scale: escala, time: 450, ease: 'easeInOutSine', removeOnInterrupt: true });
    },
    paraMundo(clientX, clientY) {
      const retangulo = app.canvas.getBoundingClientRect();
      const { x, y } = camera.toWorld(clientX - retangulo.left, clientY - retangulo.top);
      return { x, y };
    },
  };
}

/**
 * A luz e a visão de uma instância na tela (Fase 6, passo 6). Só desenha o que o `core/` decidiu
 * (`visaoTatica.ts`): as áreas que cada token vê, as luzes e a visão no escuro.
 *
 * Como funciona: um "mapa de luz" (uma textura do tamanho do mapa, em escala menor) guarda quanto
 * cada ponto fica claro, de preto a branco, e é multiplicado sobre o fundo. Ele junta duas imagens:
 * - a luz: o ambiente, a visão no escuro, a penumbra e a luz clara de cada fonte;
 * - o que se vê: branco dentro da linha de visão dos tokens do jogador; fora dela, escurecido
 *   (ou preto onde nunca se viu, na névoa de masmorra).
 * A luz só vale dentro da linha de visão (multiplica); fora dela, entra o escurecido (soma).
 * A visão no escuro mostra o fundo em preto e branco (uma cópia cinza do fundo, por baixo do
 * colorido, que some onde só a visão no escuro enxerga). As chamas ganham um brilho que tremula.
 */
import {
  BlurFilter,
  Container,
  Graphics,
  Matrix,
  RenderTexture,
  Sprite,
  Texture,
  type Renderer,
  type Ticker,
} from 'pixi.js';
import { poligonoDeVisao } from '../core/linhaDeVisao';
import type { Ponto } from '../core/paredes';
import { celulaExplorada } from '../core/exploracao';
import type { GradeDaExploracao, LuzNoMapa, Observador, VisaoNaInstancia } from '../core/visaoTatica';

/** O que a tela recebe para desenhar a luz. */
export interface VisaoParaDesenhar {
  readonly visao: VisaoNaInstancia;
  /**
   * Quanto a escuridão pesa: 1 para os jogadores; menos na prévia do mestre, que precisa
   * enxergar o mapa mesmo no escuro.
   */
  readonly forca: number;
  /** Névoa de masmorra: o que o jogador já viu (`bits` nulos: nunca viu nada). */
  readonly memoria: { readonly grade: GradeDaExploracao; readonly bits: Uint8Array | null } | null;
}

/** Quanto cada coisa fica clara (multiplica o fundo). */
const COR_CLARA = 0xffffff;
const COR_PENUMBRA = 0xa0a0a0;
/** O escuro visto pela visão no escuro (em preto e branco, como penumbra). */
const COR_NO_ESCURO = 0x8c8c8c;
/** Fora da visão: o mapa continua aparecendo, escurecido. */
const COR_FORA = 0x5c5c5c;
/** A escuridão na prévia do mestre (com a força menor da prévia, fica bem mais clara). */
const COR_ESCURIDAO_DO_MESTRE = 0x202020;
/** O maior lado do mapa de luz: mapas grandes são desenhados em escala menor (as bordas ficam suaves). */
const LADO_MAXIMO = 2048;
const BRILHO_DA_CHAMA = 0.28;

export interface CamadaLuz {
  /** Por cima do fundo: escurece. */
  readonly sombra: Container;
  /** Por cima da sombra: o brilho das luzes. */
  readonly brilho: Container;
  mostrar(dados: VisaoParaDesenhar | null): void;
  /** Um token está sendo arrastado: a visão e a luz dele acompanham (`null` quando solta). */
  moverToken(tokenId: string, ponto: Ponto | null): void;
  destruir(): void;
}

/** Uma bola branca que some para as bordas, para o brilho das luzes. */
function texturaDoBrilho(): Texture {
  const tela = document.createElement('canvas');
  tela.width = tela.height = 256;
  const ctx = tela.getContext('2d')!;
  const gradiente = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  gradiente.addColorStop(0, 'rgba(255,255,255,1)');
  gradiente.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  gradiente.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradiente;
  ctx.fillRect(0, 0, 256, 256);
  return Texture.from(tela);
}

const plano = (poligono: readonly Ponto[]) => poligono.flatMap((p) => [p.x, p.y]);

/** A área da luz clara: a área da luz com cada ponta trazida para dentro do raio menor. */
function areaClara(luz: LuzNoMapa): Ponto[] {
  return luz.area.map((p) => {
    const d = Math.hypot(p.x - luz.x, p.y - luz.y);
    if (d <= luz.clara || d === 0) {
      return p;
    }
    const f = luz.clara / d;
    return { x: luz.x + (p.x - luz.x) * f, y: luz.y + (p.y - luz.y) * f };
  });
}

export function criarCamadaLuz(
  renderer: Renderer,
  ticker: Ticker,
  /** O fundo colorido (ganha a máscara do preto e branco) e a cópia cinza por baixo dele. */
  fundoCor: Container,
  fundoCinza: Container,
): CamadaLuz {
  const sombra = new Container();
  const brilho = new Container();
  const desfoque = new BlurFilter({ strength: 4, quality: 3 });
  // Com um filtro, o sprite é desenhado numa textura à parte: a multiplicação fica no filtro, que
  // junta o resultado à tela (no sprite, ela multiplicaria sobre o vazio).
  desfoque.blendMode = 'multiply';
  let texturas: {
    luz: RenderTexture;
    visto: RenderTexture;
    fora: RenderTexture;
    cor: RenderTexture;
    escala: number;
    largura: number;
    altura: number;
  } | null = null;
  const spriteLuz = new Sprite();
  spriteLuz.filters = [desfoque];
  const spriteVisto = new Sprite();
  spriteVisto.blendMode = 'multiply';
  const spriteFora = new Sprite();
  spriteFora.blendMode = 'add';
  // A mistura de um sprite vale em relação ao contêiner dele: desenhado sozinho, como raiz, ela é
  // ignorada. Por isso cada um vai dentro de um contêiner só seu.
  const passoVisto = new Container();
  passoVisto.addChild(spriteVisto);
  const passoFora = new Container();
  passoFora.addChild(spriteFora);

  const spriteCor = new Sprite();
  const mascaraDoBrilho = new Graphics();
  const luzesDoBrilho = new Container();
  sombra.addChild(spriteLuz, spriteCor);
  brilho.addChild(luzesDoBrilho, mascaraDoBrilho);
  const brilhoTextura = texturaDoBrilho();
  const desenho = new Graphics();

  let dados: VisaoParaDesenhar | null = null;
  /** O token sendo arrastado e onde ele está agora. */
  let arrastado: { id: string; ponto: Ponto } | null = null;
  let pedido = false;
  /** Depois de destruída, um desenho que estava marcado para o próximo quadro não faz nada. */
  let destruida = false;
  /** As chamas que tremulam, com uma fase própria cada uma. */
  let chamas: { sprite: Sprite; base: number; tamanho: number; fase: number }[] = [];

  const garantirTexturas = (largura: number, altura: number) => {
    if (texturas && texturas.largura === largura && texturas.altura === altura) {
      return texturas;
    }
    texturas?.luz.destroy(true);
    texturas?.visto.destroy(true);
    texturas?.fora.destroy(true);
    texturas?.cor.destroy(true);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(largura, altura));
    // Sem mipmaps: o app liga as versões reduzidas para todas as texturas (as dos hexes), mas estas são
    // desenhadas por nós e as versões reduzidas nunca seriam preenchidas; de longe, a placa de vídeo
    // leria uma versão vazia e a luz sumiria.
    const w = Math.max(1, Math.ceil(largura * escala));
    const h = Math.max(1, Math.ceil(altura * escala));
    texturas = {
      luz: RenderTexture.create({ width: w, height: h, autoGenerateMipmaps: false }),
      visto: RenderTexture.create({ width: w, height: h, autoGenerateMipmaps: false }),
      fora: RenderTexture.create({ width: w, height: h, autoGenerateMipmaps: false }),
      cor: RenderTexture.create({ width: w, height: h, autoGenerateMipmaps: false }),
      escala,
      largura,
      altura,
    };
    spriteLuz.texture = texturas.luz;
    spriteVisto.texture = texturas.visto;
    spriteFora.texture = texturas.fora;
    spriteCor.texture = texturas.cor;
    spriteLuz.scale.set(1 / escala);
    spriteCor.scale.set(1 / escala);
    return texturas;
  };

  /** A visão com o token arrastado no lugar novo: a área dele e a luz que ele leva são refeitas. */
  const visaoAtual = (): VisaoNaInstancia | null => {
    if (!dados) {
      return null;
    }
    const v = dados.visao;
    if (!arrastado) {
      return v;
    }
    const { id, ponto } = arrastado;
    const observadores = v.observadores.map((o): Observador =>
      o.tokenId !== id
        ? o
        : {
            ...o,
            x: ponto.x,
            y: ponto.y,
            area: poligonoDeVisao(ponto, v.bloqueios, v.largura, v.altura),
            areaNoEscuro: o.noEscuro > 0 ? poligonoDeVisao(ponto, v.bloqueios, v.largura, v.altura, o.noEscuro) : [],
          },
    );
    const luzes = v.luzes.map((l): LuzNoMapa =>
      l.id !== `token:${id}` ? l : { ...l, x: ponto.x, y: ponto.y, area: poligonoDeVisao(ponto, v.bloqueios, v.largura, v.altura, l.alcance) },
    );
    return { ...v, observadores, luzes };
  };

  /** O que já foi visto, em faixas por linha da grade (uma faixa por sequência de células). */
  const desenharMemoria = (g: Graphics, memoria: NonNullable<VisaoParaDesenhar['memoria']>, cor: number) => {
    const { grade, bits } = memoria;
    if (!bits) {
      return;
    }
    for (let l = 0; l < grade.linhas; l += 1) {
      let inicio = -1;
      for (let c = 0; c <= grade.colunas; c += 1) {
        const vista = c < grade.colunas && celulaExplorada(bits, l * grade.colunas + c);
        if (vista && inicio < 0) {
          inicio = c;
        } else if (!vista && inicio >= 0) {
          g.rect(inicio * grade.celula, l * grade.celula, (c - inicio) * grade.celula, grade.celula).fill(cor);
          inicio = -1;
        }
      }
    }
  };

  const limparBrilho = () => {
    for (const filho of luzesDoBrilho.removeChildren()) {
      filho.destroy({ children: true });
    }
    chamas = [];
  };

  const desenhar = () => {
    pedido = false;
    if (destruida) {
      return;
    }
    const visao = visaoAtual();
    if (!dados || !visao) {
      sombra.visible = brilho.visible = false;
      fundoCor.mask = null;
      fundoCinza.visible = false;
      limparBrilho();
      return;
    }
    const t = garantirTexturas(visao.largura, visao.altura);
    const transformacao = new Matrix().scale(t.escala, t.escala);
    const { todos } = visao;
    const naMasmorra = !todos && visao.modo === 'masmorra' && dados.memoria !== null;
    const corDaEscuridao = dados.forca < 1 ? COR_ESCURIDAO_DO_MESTRE : COR_FORA;
    const comVisaoNoEscuro = !todos && visao.ambiente === 'escuridao' && visao.observadores.some((o) => o.noEscuro > 0);

    // 1. A luz: escuridão (ou o que já foi visto, na masmorra), ambiente, visão no escuro, penumbra e luz clara,
    //    do mais escuro ao mais claro, cada um por cima do anterior.
    desenho.clear();
    if (naMasmorra) {
      desenharMemoria(desenho, dados.memoria!, COR_FORA);
    } else {
      desenho.rect(0, 0, visao.largura, visao.altura).fill(corDaEscuridao);
    }
    if (visao.ambiente !== 'escuridao') {
      desenho.rect(0, 0, visao.largura, visao.altura).fill(visao.ambiente === 'clara' ? COR_CLARA : COR_PENUMBRA);
    }
    // Na visão no escuro, a escuridão vira penumbra e a penumbra vira luz clara.
    const corNoEscuro = visao.ambiente === 'escuridao' ? COR_NO_ESCURO : COR_CLARA;
    const comPenumbra = visao.luzes.filter((l) => l.alcance > l.clara);
    if (corNoEscuro !== COR_CLARA) {
      visao.observadores.forEach((o) => o.areaNoEscuro.length > 2 && desenho.poly(plano(o.areaNoEscuro)).fill(corNoEscuro));
    }
    comPenumbra.forEach((l) => l.area.length > 2 && desenho.poly(plano(l.area)).fill(COR_PENUMBRA));
    if (corNoEscuro === COR_CLARA) {
      visao.observadores.forEach((o) => o.areaNoEscuro.length > 2 && desenho.poly(plano(o.areaNoEscuro)).fill(COR_CLARA));
    }
    visao.luzes.forEach((l) => l.clara > 0 && l.area.length > 2 && desenho.poly(plano(areaClara(l))).fill(COR_CLARA));
    renderer.render({ container: desenho, target: t.luz, clear: true, clearColor: 0x000000, transform: transformacao });

    // 2. Só vale a luz dentro da linha de visão: multiplica por uma imagem branca nela e preta fora.
    //    Depois soma o que fica fora: escurecido (ou, na masmorra, o que já foi visto) e preto dentro.
    if (!todos) {
      desenho.clear();
      visao.observadores.forEach((o) => o.area.length > 2 && desenho.poly(plano(o.area)).fill(COR_CLARA));
      renderer.render({ container: desenho, target: t.visto, clear: true, clearColor: 0x000000, transform: transformacao });
      renderer.render({ container: passoVisto, target: t.luz, clear: false });
      desenho.clear();
      if (naMasmorra) {
        desenharMemoria(desenho, dados.memoria!, COR_FORA);
      } else {
        desenho.rect(0, 0, visao.largura, visao.altura).fill(COR_FORA);
      }
      visao.observadores.forEach((o) => o.area.length > 2 && desenho.poly(plano(o.area)).fill(0x000000));
      renderer.render({ container: desenho, target: t.fora, clear: true, clearColor: 0x000000, transform: transformacao });
      renderer.render({ container: passoFora, target: t.luz, clear: false });
    }
    sombra.visible = true;
    spriteLuz.alpha = dados.forca;

    // 3. Preto e branco onde só a visão no escuro enxerga.
    if (comVisaoNoEscuro) {
      desenho.clear();
      desenho.rect(0, 0, visao.largura, visao.altura).fill(0xffffff);
      visao.observadores.forEach((o) => o.areaNoEscuro.length > 2 && desenho.poly(plano(o.areaNoEscuro)).fill(0x000000));
      visao.luzes.forEach((l) => l.area.length > 2 && desenho.poly(plano(l.area)).fill(0xffffff));
      renderer.render({ container: desenho, target: t.cor, clear: true, clearColor: 0xffffff, transform: transformacao });
      spriteCor.visible = true;
      fundoCor.mask = spriteCor;
      fundoCinza.visible = true;
    } else {
      fundoCor.mask = null;
      spriteCor.visible = false;
      fundoCinza.visible = false;
    }

    // 4. O brilho das luzes, cortado pelas paredes; para o jogador, só dentro da linha de visão.
    limparBrilho();
    brilho.visible = true;
    for (const luz of visao.luzes) {
      if (luz.area.length < 3) {
        continue;
      }
      const sprite = new Sprite(brilhoTextura);
      sprite.anchor.set(0.5);
      sprite.position.set(luz.x, luz.y);
      sprite.width = sprite.height = luz.alcance * 2;
      sprite.tint = luz.cor;
      sprite.blendMode = 'add';
      sprite.alpha = BRILHO_DA_CHAMA;
      const corte = new Graphics().poly(plano(luz.area)).fill(0xffffff);
      sprite.mask = corte;
      luzesDoBrilho.addChild(corte, sprite);
      if (luz.tremular) {
        chamas.push({ sprite, base: BRILHO_DA_CHAMA, tamanho: luz.alcance * 2, fase: Math.random() * 100 });
      }
    }
    mascaraDoBrilho.clear();
    if (todos) {
      luzesDoBrilho.mask = null;
      mascaraDoBrilho.visible = false;
    } else {
      visao.observadores.forEach((o) => o.area.length > 2 && mascaraDoBrilho.poly(plano(o.area)).fill(0xffffff));
      mascaraDoBrilho.visible = true;
      luzesDoBrilho.mask = mascaraDoBrilho;
    }
  };

  const pedirDesenho = () => {
    if (!pedido) {
      pedido = true;
      requestAnimationFrame(desenhar);
    }
  };

  // Chamas tremulam: o brilho e o tamanho variam um pouco, com ondas de períodos diferentes.
  const tremular = () => {
    if (chamas.length === 0) {
      return;
    }
    const agora = performance.now() / 1000;
    for (const chama of chamas) {
      const onda = Math.sin(agora * 7.3 + chama.fase) * 0.5 + Math.sin(agora * 13.1 + chama.fase * 2) * 0.3 + Math.sin(agora * 2.1 + chama.fase) * 0.2;
      chama.sprite.alpha = chama.base * (0.85 + 0.15 * onda);
      chama.sprite.width = chama.sprite.height = chama.tamanho * (1 + 0.025 * onda);
    }
  };
  ticker.add(tremular);

  return {
    sombra,
    brilho,
    mostrar(novos) {
      dados = novos;
      // O estado novo já traz o token onde ele foi solto.
      arrastado = null;
      pedirDesenho();
    },
    moverToken(tokenId, ponto) {
      arrastado = ponto ? { id: tokenId, ponto } : null;
      pedirDesenho();
    },
    destruir() {
      destruida = true;
      ticker.remove(tremular);
      limparBrilho();
      texturas?.luz.destroy(true);
      texturas?.visto.destroy(true);
      texturas?.fora.destroy(true);
      texturas?.cor.destroy(true);
      brilhoTextura.destroy(true);
    },
  };
}

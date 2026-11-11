import { Application } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import type { LojaGrupo } from '../core/grupo';
import {
  hexParaMundo,
  linhaHex,
  mundoParaHex,
  type AreaMundo,
  type CoordHex,
  type PontoMundo,
} from '../core/hex';
import type { LojaMapa } from '../core/loja';
import { centroDoMapa, type EstadoMapa } from '../core/mapa';
import type { Manifesto } from '../core/manifesto';
import { visaoDoJogador } from '../core/visibilidade';
import { carregarCatalogo, type Catalogo } from './assets';
import { criarCamadaDecoracoes, type DecoracaoEncontrada } from './camadaDecoracoes';
import { criarCamadaFundoOculto } from './camadaFundoOculto';
import { criarCamadaGrid, criarDestaqueHex, criarSelecaoHex } from './camadaGrid';
import {
  criarCamadaMarcadores,
  criarContornoRevelados,
} from './camadaMarcadores';
import { criarCamadaGrupo, type CabecaDoGrupo, type CarregarImagem } from './camadaGrupo';
import { trilhaDoGrupo, type PassoPossivel } from '../core/grupo';
import { criarCamadaTiles } from './camadaTiles';

const ZOOM_MINIMO = 0.15;
const ZOOM_MAXIMO = 2;
const ZOOM_INICIAL = 0.6;
const BOTAO_ESQUERDO = 0;
/** Abaixo desta distância na tela, apertar e soltar o botão conta como um clique. */
const LIMITE_ARRASTO_PX = 5;
const COR_HEX_OCULTO = 0x4a4d5c;

export interface OpcoesCena {
  readonly loja: LojaMapa;
  readonly lojaGrupo: LojaGrupo;
  readonly manifesto: Manifesto;
  /** Chamada quando o hex sob o mouse muda; recebe `null` quando o mouse sai do mapa. */
  readonly aoMudarHexSobMouse: (coord: CoordHex | null) => void;
  /** Chamada quando o ponto do mundo sob o mouse muda. */
  readonly aoMoverPonteiro: (ponto: PontoMundo | null) => void;
  /** O botão esquerdo foi apertado neste ponto. */
  readonly aoIniciarTraco: (ponto: PontoMundo) => void;
  /** Com o botão apertado, o mouse chegou a este hex. */
  readonly aoContinuarTraco: (coord: CoordHex) => void;
  /** Com o botão apertado, o mouse se moveu para este ponto. */
  readonly aoMoverDuranteTraco: (ponto: PontoMundo) => void;
  readonly aoTerminarTraco: () => void;
  /** O botão esquerdo foi apertado e solto neste ponto, sem arrastar. Vem após `aoTerminarTraco`. */
  readonly aoClicar: (ponto: PontoMundo) => void;
  /** Os membros do grupo, para as cabeças no token. */
  readonly obterCabecasDoGrupo: () => readonly CabecaDoGrupo[];
  /** O endereço de uma imagem guardada (retratos e tokens). */
  readonly carregarImagem: CarregarImagem;
}

interface ControlesCena {
  mundoEm(x: number, y: number): PontoMundo;
  mostrarPrevia(assetId: string, coord: CoordHex): void;
  mostrarPreviaDecoracao(assetId: string, posicao: PontoMundo): void;
  limparPrevia(): void;
  decoracaoEm(ponto: PontoMundo): DecoracaoEncontrada | null;
  moverDecoracaoVisual(decoracaoId: string, posicao: PontoMundo): void;
  sincronizarDecoracoes(): void;
  centralizarNoMapa(): void;
  selecionarHex(coord: CoordHex | null): void;
  /** Liga ou desliga o escurecimento dos hexes que os jogadores não veriam. */
  definirConferenciaDeVisao(ativa: boolean): void;
  /**
   * Passa a desenhar o mapa exatamente como este jogador o veria; `null` volta ao modo mestre.
   * `alcance` é até onde aquele jogador enxerga no mapa (1 são os vizinhos).
   */
  definirModoJogador(participanteId: string | null, alcance?: number): void;
  /** Os custos dos passos nos vizinhos do grupo; `null` esconde. */
  mostrarPassos(passos: readonly PassoPossivel[] | null, destaque: CoordHex | null): void;
  marcarGrupoSelecionado(selecionado: boolean): void;
  /** O token acompanha o mouse; `null` o devolve ao hex do grupo. */
  moverTokenVisual(ponto: PontoMundo | null): void;
  /** Redesenha o token, por exemplo quando um membro muda de nome. */
  atualizarGrupo(): void;
  /** Leva a câmera, deslizando, até o hex do grupo. */
  centralizarNoGrupo(): void;
  /**
   * Leva a câmera, deslizando, até um hex, como o de uma linha do diário. `desvioNaTela`
   * (em pixels) põe o hex mais à esquerda, para ele não ficar atrás de um painel à direita.
   */
  centralizarEm(coord: CoordHex, desvioNaTela?: number): void;
  cancelarAssinatura(): void;
}

export interface CenaMapa extends Omit<ControlesCena, 'mundoEm' | 'cancelarAssinatura'> {
  /** Ponto do mundo em uma posição da tela, ou `null` enquanto a cena está carregando. */
  mundoEm(x: number, y: number): PontoMundo | null;
  destruir(): void;
}

/**
 * Cria a cena do mapa dentro de `container`.
 * A inicialização é assíncrona, então a cena pode ser destruída antes de ficar pronta.
 */
export function createMapScene(container: HTMLElement, opcoes: OpcoesCena): CenaMapa {
  const app = new Application();
  let ready = false;
  let disposed = false;
  let controles: ControlesCena | null = null;

  const iniciar = async () => {
    await app.init({
      resizeTo: container,
      background: '#14161c',
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    if (disposed) {
      app.destroy(true);
      return;
    }
    ready = true;
    container.appendChild(app.canvas);

    const catalogo = await carregarCatalogo(opcoes.manifesto);
    if (!disposed) {
      controles = montarCena(app, catalogo, opcoes);
    }
  };
  void iniciar();

  return {
    mundoEm: (x, y) => controles?.mundoEm(x, y) ?? null,
    mostrarPrevia: (assetId, coord) => controles?.mostrarPrevia(assetId, coord),
    mostrarPreviaDecoracao: (assetId, posicao) =>
      controles?.mostrarPreviaDecoracao(assetId, posicao),
    limparPrevia: () => controles?.limparPrevia(),
    decoracaoEm: (ponto) => controles?.decoracaoEm(ponto) ?? null,
    moverDecoracaoVisual: (decoracaoId, posicao) =>
      controles?.moverDecoracaoVisual(decoracaoId, posicao),
    sincronizarDecoracoes: () => controles?.sincronizarDecoracoes(),
    centralizarNoMapa: () => controles?.centralizarNoMapa(),
    selecionarHex: (coord) => controles?.selecionarHex(coord),
    definirConferenciaDeVisao: (ativa) => controles?.definirConferenciaDeVisao(ativa),
    definirModoJogador: (participanteId, alcance) => controles?.definirModoJogador(participanteId, alcance),
    mostrarPassos: (passos, destaque) => controles?.mostrarPassos(passos, destaque),
    marcarGrupoSelecionado: (selecionado) => controles?.marcarGrupoSelecionado(selecionado),
    moverTokenVisual: (ponto) => controles?.moverTokenVisual(ponto),
    atualizarGrupo: () => controles?.atualizarGrupo(),
    centralizarNoGrupo: () => controles?.centralizarNoGrupo(),
    centralizarEm: (coord, desvioNaTela) => controles?.centralizarEm(coord, desvioNaTela),
    destruir() {
      disposed = true;
      controles?.cancelarAssinatura();
      controles = null;
      if (ready) {
        app.destroy(true, { children: true });
      }
    },
  };
}

/** Hexes do mapa que os jogadores não veriam agora. */
function chavesOcultas(estado: EstadoMapa, posicao: CoordHex | null): ReadonlySet<string> {
  const visao = visaoDoJogador(estado, posicao ? [posicao] : []);
  return new Set(Object.keys(estado.hexes).filter((chave) => !(chave in visao.hexes)));
}

function montarCena(app: Application, catalogo: Catalogo, opcoes: OpcoesCena): ControlesCena {
  const camera = new Viewport({
    screenWidth: app.screen.width,
    screenHeight: app.screen.height,
    events: app.renderer.events,
    disableOnContextMenu: true,
  });
  // O botão esquerdo fica livre para editar o mapa.
  camera
    .drag({ mouseButtons: 'middle-right' })
    .pinch()
    .wheel()
    .clampZoom({ minScale: ZOOM_MINIMO, maxScale: ZOOM_MAXIMO });
  camera.setZoom(ZOOM_INICIAL, true);
  camera.moveCenter(0, 0);
  app.stage.addChild(camera);
  app.renderer.on('resize', (largura: number, altura: number) => camera.resize(largura, altura));

  const fundoOculto = criarCamadaFundoOculto(catalogo, (cor) => {
    app.renderer.background.color = cor;
  });
  const grid = criarCamadaGrid();
  const tiles = criarCamadaTiles(catalogo);
  const decoracoes = criarCamadaDecoracoes(catalogo, tiles.container);
  const marcadores = criarCamadaMarcadores();
  const contornoRevelados = criarContornoRevelados();
  const grupo = criarCamadaGrupo(app.ticker, opcoes.carregarImagem);
  const selecao = criarSelecaoHex();
  const destaque = criarDestaqueHex();
  camera.addChild(
    fundoOculto.atras,
    grid.grafico,
    tiles.container,
    decoracoes.container,
    fundoOculto.frente,
    contornoRevelados.grafico,
    marcadores.grafico,
    grupo.trilha,
    grupo.passos,
    grupo.selecao,
    selecao.grafico,
    destaque.grafico,
    grupo.token,
  );

  let conferindoVisao = false;
  /** O jogador cuja visão está sendo desenhada, ou `null` no modo mestre. */
  let jogadorId: string | null = null;
  let alcanceDoJogador = 1;

  const atualizarCamadas = () => {
    const estadoDoMestre = opcoes.loja.obterEstado();
    const estadoGrupo = opcoes.lojaGrupo.obterEstado();
    const { posicao } = estadoGrupo;
    // No modo jogador, todas as camadas desenham só a visão filtrada: o que está oculto não chega aqui.
    const modoJogador = jogadorId !== null;
    const estado = modoJogador
      ? visaoDoJogador(estadoDoMestre, posicao ? [posicao] : [], jogadorId ?? '', alcanceDoJogador)
      : estadoDoMestre;
    const conferir = conferindoVisao && !modoJogador;

    tiles.atualizar(estado);
    decoracoes.atualizar(estado);
    marcadores.atualizar(estado);
    grupo.atualizar(posicao);
    grupo.definirCabecas(opcoes.obterCabecasDoGrupo());
    // A trilha é só do mestre: no modo jogador, ela some.
    grupo.atualizarTrilha(modoJogador ? null : trilhaDoGrupo(estadoGrupo));
    contornoRevelados.atualizar(estado, conferir);

    const ocultos = conferir ? chavesOcultas(estado, posicao) : null;
    tiles.escurecer(ocultos, COR_HEX_OCULTO);
    decoracoes.escurecer(ocultos, COR_HEX_OCULTO);

    grid.grafico.visible = fundoOculto.atualizar(
      modoJogador ? estado.aparenciaOculta : null,
      Object.values(estado.hexes).map((hex) => hex.coord),
    );
  };
  atualizarCamadas();
  const cancelarAssinaturaMapa = opcoes.loja.assinar(atualizarCamadas);
  const cancelarAssinaturaGrupo = opcoes.lojaGrupo.assinar(atualizarCamadas);

  const centralizarNoMapa = () => {
    const centro = centroDoMapa(opcoes.loja.obterEstado());
    if (centro) {
      camera.moveCenter(centro.x, centro.y);
    }
  };
  // Um mapa guardado pode estar longe da origem e parecer vazio ao abrir.
  centralizarNoMapa();

  const deslizarAte = (coord: CoordHex, desvioNaTela = 0) => {
    const centro = hexParaMundo(coord);
    // O desvio é em pixels da tela; no mundo, depende do zoom.
    const x = centro.x + desvioNaTela / camera.scale.x;
    camera.animate({ position: { x, y: centro.y }, time: 450, ease: 'easeInOutSine', removeOnInterrupt: true });
  };

  const mundoDoEvento = (evento: PointerEvent): PontoMundo => {
    const { x, y } = camera.toWorld(evento.offsetX, evento.offsetY);
    return { x, y };
  };

  const dentroDaTela = (evento: PointerEvent) =>
    evento.offsetX >= 0 &&
    evento.offsetY >= 0 &&
    evento.offsetX < app.screen.width &&
    evento.offsetY < app.screen.height;

  let ultimoHexDoTraco: CoordHex | null = null;
  let inicioDoTraco: { telaX: number; telaY: number; ponto: PontoMundo } | null = null;
  let arrastou = false;

  app.canvas.addEventListener('pointerdown', (evento) => {
    if (evento.button !== BOTAO_ESQUERDO) {
      return;
    }
    // Mantém o traço mesmo se o mouse sair do mapa enquanto o botão está apertado.
    app.canvas.setPointerCapture(evento.pointerId);
    const ponto = mundoDoEvento(evento);
    ultimoHexDoTraco = mundoParaHex(ponto);
    inicioDoTraco = { telaX: evento.offsetX, telaY: evento.offsetY, ponto };
    arrastou = false;
    opcoes.aoIniciarTraco(ponto);
  });

  const continuarTraco = (evento: PointerEvent) => {
    if (!ultimoHexDoTraco || !inicioDoTraco || !dentroDaTela(evento)) {
      return;
    }
    const ponto = mundoDoEvento(evento);
    // Um movimento rápido pode saltar vários hexes entre dois eventos do mouse.
    const [, ...novos] = linhaHex(ultimoHexDoTraco, mundoParaHex(ponto));
    novos.forEach(opcoes.aoContinuarTraco);
    ultimoHexDoTraco = novos[novos.length - 1] ?? ultimoHexDoTraco;

    arrastou ||=
      Math.hypot(evento.offsetX - inicioDoTraco.telaX, evento.offsetY - inicioDoTraco.telaY) >=
      LIMITE_ARRASTO_PX;
    if (arrastou) {
      opcoes.aoMoverDuranteTraco(ponto);
    }
  };

  const terminarTraco = () => {
    if (ultimoHexDoTraco) {
      ultimoHexDoTraco = null;
      opcoes.aoTerminarTraco();
    }
  };
  app.canvas.addEventListener('pointerup', () => {
    const clique = ultimoHexDoTraco && !arrastou ? inicioDoTraco : null;
    terminarTraco();
    if (clique) {
      opcoes.aoClicar(clique.ponto);
    }
  });
  app.canvas.addEventListener('pointercancel', terminarTraco);

  let ponteiro: { x: number; y: number } | null = null;
  app.canvas.addEventListener('pointermove', (evento) => {
    ponteiro = dentroDaTela(evento) ? { x: evento.offsetX, y: evento.offsetY } : null;
    continuarTraco(evento);
  });
  app.canvas.addEventListener('pointerleave', () => {
    ponteiro = null;
  });

  let hexAtual: CoordHex | null = null;
  let pontoAtual: PontoMundo | null = null;
  // Roda a cada quadro para acompanhar também o zoom e o arrasto, com o mouse parado.
  app.ticker.add((ticker) => {
    const areaVisivel: AreaMundo = {
      minX: camera.left,
      minY: camera.top,
      maxX: camera.right,
      maxY: camera.bottom,
    };
    grid.atualizar(areaVisivel);
    fundoOculto.aoQuadro(areaVisivel, ticker.deltaMS);

    const mundo = ponteiro ? camera.toWorld(ponteiro.x, ponteiro.y) : null;
    if (mundo?.x !== pontoAtual?.x || mundo?.y !== pontoAtual?.y) {
      pontoAtual = mundo && { x: mundo.x, y: mundo.y };
      opcoes.aoMoverPonteiro(pontoAtual);
    }

    const hex = pontoAtual ? mundoParaHex(pontoAtual) : null;
    if (hex?.q !== hexAtual?.q || hex?.r !== hexAtual?.r) {
      hexAtual = hex;
      destaque.atualizar(hex);
      opcoes.aoMudarHexSobMouse(hex);
    }
  });

  const limparPrevia = () => {
    tiles.limparPrevia();
    decoracoes.limparPrevia();
  };

  return {
    mundoEm: (x, y) => {
      const mundo = camera.toWorld(x, y);
      return { x: mundo.x, y: mundo.y };
    },
    mostrarPrevia: (assetId, coord) => {
      decoracoes.limparPrevia();
      tiles.mostrarPrevia(assetId, coord);
    },
    mostrarPreviaDecoracao: (assetId, posicao) => {
      tiles.limparPrevia();
      decoracoes.mostrarPrevia(assetId, posicao);
    },
    limparPrevia,
    decoracaoEm: decoracoes.decoracaoEm,
    moverDecoracaoVisual: decoracoes.moverVisual,
    sincronizarDecoracoes: atualizarCamadas,
    centralizarNoMapa,
    selecionarHex: selecao.atualizar,
    definirConferenciaDeVisao: (ativa) => {
      conferindoVisao = ativa;
      atualizarCamadas();
    },
    mostrarPassos: grupo.mostrarPassos,
    marcarGrupoSelecionado: grupo.marcarSelecionado,
    moverTokenVisual: grupo.moverVisual,
    atualizarGrupo: atualizarCamadas,
    centralizarNoGrupo: () => {
      const { posicao } = opcoes.lojaGrupo.obterEstado();
      if (posicao) {
        deslizarAte(posicao);
      }
    },
    centralizarEm: deslizarAte,
    definirModoJogador: (participanteId, alcance = 1) => {
      jogadorId = participanteId;
      alcanceDoJogador = alcance;
      atualizarCamadas();
    },
    cancelarAssinatura: () => {
      cancelarAssinaturaMapa();
      cancelarAssinaturaGrupo();
    },
  };
}

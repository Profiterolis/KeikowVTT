/**
 * As paredes de uma instância na tela: linhas coloridas por tipo (só para o mestre), o ícone de
 * cada porta (para todos que a conhecem) e as ferramentas do mestre para desenhar e ajustar.
 * Só desenha e avisa; quem decide o que muda são as lojas do `core/`.
 */
import { Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { alinharAngulo, distanciaAoSegmento, pontaProxima, type Parede, type Ponto, type TipoDeParede } from '../core/paredes';

/** O que a ferramenta do mestre está fazendo: desenhar um tipo de parede ou selecionar. */
export type ModoParedes =
  | { readonly tipo: 'desenhar'; readonly tipoDeParede: TipoDeParede; readonly secreta: boolean }
  | { readonly tipo: 'selecionar' }
  | null;

export interface EventosDasParedes {
  /** Uma linha desenhada ponto a ponto (pelo menos dois pontos). */
  /** `encaixe`: a distância (em pixels da instância) em que uma porta ou janela abre vão numa parede. */
  aoCriar(pontos: readonly Ponto[], tipo: TipoDeParede, secreta: boolean, encaixe: number): void;
  aoSelecionar(paredeId: string | null): void;
  /** Uma ponta arrastada: todas as paredes com uma ponta em `de` passam a ter a ponta em `para`. */
  aoMoverPonta(de: Ponto, para: Ponto): void;
  aoClicarPorta(paredeId: string): void;
  aoMenuPorta(paredeId: string, clientX: number, clientY: number): void;
  /** Começou ou terminou uma linha (para o Esc saber se termina a linha ou sai da ferramenta). */
  aoMudarDesenho(desenhando: boolean): void;
}

const COR_PAREDE = 0xffd166;
const COR_JANELA = 0x7fd4ff;
const COR_PORTA: Readonly<Record<Parede['estado'], number>> = { aberta: 0x6fcf73, fechada: 0xff9a5c, trancada: 0xe05c5c };
const COR_SECRETA = 0xc27ba0;
const COR_SELECAO = 0xffffff;
const COR_PREVIA = 0xffffff;
/** Em pixels da tela: grudar numa ponta, achar uma parede com o clique e o raio do ícone de porta. */
const ALCANCE_DA_PONTA = 12;
const ALCANCE_DA_PAREDE = 8;
const RAIO_DO_ICONE = 13;
const TOLERANCIA_CLIQUE = 4;
const BOTAO_ESQUERDO = 0;
const BOTAO_DIREITO = 2;

function corDa(parede: Parede): number {
  if (parede.tipo === 'parede') {
    return COR_PAREDE;
  }
  if (parede.tipo === 'janela') {
    return COR_JANELA;
  }
  return parede.secreta ? COR_SECRETA : COR_PORTA[parede.estado];
}

/** Uma linha tracejada (o PixiJS não tem traço pontilhado pronto). */
function tracejar(g: Graphics, a: Ponto, b: Ponto, traco: number, espaco: number) {
  const total = Math.hypot(b.x - a.x, b.y - a.y);
  const ux = (b.x - a.x) / total;
  const uy = (b.y - a.y) / total;
  for (let d = 0; d < total; d += traco + espaco) {
    const fim = Math.min(d + traco, total);
    g.moveTo(a.x + ux * d, a.y + uy * d).lineTo(a.x + ux * fim, a.y + uy * fim);
  }
}

const mesmoPonto = (p: Ponto, q: Ponto) => Math.abs(p.x - q.x) < 1e-6 && Math.abs(p.y - q.y) < 1e-6;

export interface CamadaParedes {
  /** As linhas, abaixo dos tokens. */
  readonly linhas: Container;
  /** Os ícones das portas, entre as linhas e os tokens. */
  readonly icones: Container;
  /** `verLinhas`: o mestre vê as paredes; os jogadores, só as portas. */
  mostrar(paredes: readonly Parede[], verLinhas: boolean): void;
  definirModo(modo: ModoParedes): void;
  selecionar(paredeId: string | null): void;
  /** Termina a linha que está sendo desenhada (Esc, botão direito ou troca de ferramenta). */
  terminarDesenho(): void;
  ajustarAoZoom(): void;
}

export function criarCamadaParedes(
  camera: Viewport,
  canvas: HTMLCanvasElement,
  eventos: () => EventosDasParedes | null,
): CamadaParedes {
  const linhas = new Container();
  const grafico = new Graphics();
  const previa = new Graphics();
  linhas.addChild(grafico, previa);
  const icones = new Container();

  let paredes: readonly Parede[] = [];
  let verLinhas = false;
  let modo: ModoParedes = null;
  let selecionada: string | null = null;
  /** Os pontos da linha que está sendo desenhada. */
  let desenho: Ponto[] = [];
  let mouse: Ponto | null = null;
  let shift = false;
  /** Uma ponta sendo arrastada no modo Selecionar. */
  let arrasteDePonta: { de: Ponto; para: Ponto } | null = null;
  let cliqueDireito: Ponto | null = null;

  const escala = () => 1 / camera.scale.x;

  const mundoDaTela = (clientX: number, clientY: number): Ponto => {
    const retangulo = canvas.getBoundingClientRect();
    const { x, y } = camera.toWorld(clientX - retangulo.left, clientY - retangulo.top);
    return { x, y };
  };

  /** As paredes como estão na tela: com a ponta arrastada já no lugar novo. */
  const paredesNaTela = (): readonly Parede[] => {
    if (!arrasteDePonta) {
      return paredes;
    }
    const { de, para } = arrasteDePonta;
    return paredes.map((p) => ({ ...p, a: mesmoPonto(p.a, de) ? para : p.a, b: mesmoPonto(p.b, de) ? para : p.b }));
  };

  /** Onde vai cair um ponto novo: numa ponta próxima, ou alinhado a 45° com Shift. */
  const pontoAjustado = (p: Ponto, anterior: Ponto | null, ignorar: Ponto | null = null): Ponto => {
    const outras = ignorar ? paredes.filter((w) => !mesmoPonto(w.a, ignorar) && !mesmoPonto(w.b, ignorar)) : paredes;
    const candidatas = [...outras, ...desenho.map((q, i) => ({ id: `d${i}`, a: q, b: q }) as Parede)];
    const grudada = pontaProxima(p, candidatas, ALCANCE_DA_PONTA * escala());
    if (grudada) {
      return grudada;
    }
    return shift && anterior ? alinharAngulo(anterior, p) : p;
  };

  const desenharLinhas = () => {
    grafico.clear();
    if (!verLinhas) {
      return;
    }
    const largura = 4 * escala();
    const emEdicao = modo !== null;
    for (const parede of paredesNaTela()) {
      if (parede.id === selecionada) {
        grafico.moveTo(parede.a.x, parede.a.y).lineTo(parede.b.x, parede.b.y).stroke({ color: COR_SELECAO, width: largura * 2.2 });
      }
      if (parede.tipo === 'porta' && parede.secreta) {
        tracejar(grafico, parede.a, parede.b, 14 * escala(), 8 * escala());
        grafico.stroke({ color: corDa(parede), width: largura });
      } else {
        grafico.moveTo(parede.a.x, parede.a.y).lineTo(parede.b.x, parede.b.y).stroke({ color: corDa(parede), width: largura });
      }
      if (emEdicao) {
        for (const ponta of [parede.a, parede.b]) {
          grafico.circle(ponta.x, ponta.y, 4 * escala()).fill(parede.id === selecionada ? COR_SELECAO : corDa(parede));
        }
      }
    }
  };

  const desenharPrevia = () => {
    previa.clear();
    if (modo?.tipo !== 'desenhar') {
      return;
    }
    const cor = modo.tipoDeParede === 'parede' ? COR_PAREDE : modo.tipoDeParede === 'janela' ? COR_JANELA : modo.secreta ? COR_SECRETA : COR_PORTA.fechada;
    const largura = 4 * escala();
    for (let i = 1; i < desenho.length; i++) {
      previa.moveTo(desenho[i - 1].x, desenho[i - 1].y).lineTo(desenho[i].x, desenho[i].y);
    }
    if (desenho.length > 1) {
      previa.stroke({ color: cor, width: largura });
    }
    const ultimo = desenho.at(-1) ?? null;
    if (mouse) {
      const alvo = pontoAjustado(mouse, ultimo);
      if (ultimo) {
        previa.moveTo(ultimo.x, ultimo.y).lineTo(alvo.x, alvo.y).stroke({ color: cor, width: largura, alpha: 0.6 });
      }
      previa.circle(alvo.x, alvo.y, 6 * escala()).stroke({ color: COR_PREVIA, width: 2 * escala() });
    }
    for (const ponto of desenho) {
      previa.circle(ponto.x, ponto.y, 4 * escala()).fill(cor);
    }
  };

  const desenharIcones = () => {
    for (const filho of icones.removeChildren()) {
      filho.destroy({ children: true });
    }
    const interativos = modo === null;
    for (const parede of paredesNaTela()) {
      if (parede.tipo !== 'porta') {
        continue;
      }
      const icone = new Container();
      icone.position.set((parede.a.x + parede.b.x) / 2, (parede.a.y + parede.b.y) / 2);
      icone.scale.set(escala());
      const cor = corDa(parede);
      icone.addChild(
        new Graphics()
          .circle(0, 0, RAIO_DO_ICONE)
          .fill({ color: 0x14161c, alpha: 0.85 })
          .stroke({ color: cor, width: 2.5 }),
      );
      const simbolo = new Text({
        text: parede.secreta ? '?' : parede.estado === 'trancada' ? '🔒' : parede.estado === 'aberta' ? '⤢' : '🚪',
        style: { fontSize: 14, fill: cor, fontFamily: 'system-ui, sans-serif', fontWeight: 'bold' },
      });
      simbolo.anchor.set(0.5);
      icone.addChild(simbolo);
      if (interativos) {
        icone.eventMode = 'static';
        icone.cursor = 'pointer';
        icone.on('pointertap', (evento: FederatedPointerEvent) => {
          if (evento.button === BOTAO_ESQUERDO) {
            evento.stopPropagation();
            eventos()?.aoClicarPorta(parede.id);
          }
        });
        icone.on('rightdown', (evento: FederatedPointerEvent) => {
          cliqueDireito = { x: evento.clientX, y: evento.clientY };
        });
        icone.on('rightup', (evento: FederatedPointerEvent) => {
          const inicio = cliqueDireito;
          cliqueDireito = null;
          if (inicio && Math.hypot(evento.clientX - inicio.x, evento.clientY - inicio.y) < TOLERANCIA_CLIQUE) {
            eventos()?.aoMenuPorta(parede.id, evento.clientX, evento.clientY);
          }
        });
      } else {
        icone.eventMode = 'none';
      }
      icones.addChild(icone);
    }
  };

  const redesenhar = () => {
    desenharLinhas();
    desenharPrevia();
    desenharIcones();
  };

  const terminarDesenho = () => {
    const pontos = desenho;
    desenho = [];
    desenharPrevia();
    if (pontos.length > 0) {
      eventos()?.aoMudarDesenho(false);
    }
    if (modo?.tipo === 'desenhar' && pontos.length >= 2) {
      eventos()?.aoCriar(pontos, modo.tipoDeParede, modo.secreta, ALCANCE_DA_PONTA * escala());
    }
  };

  /** A parede mais perto do ponto, a até alguns pixels da tela. */
  const paredeEm = (p: Ponto): Parede | null => {
    let melhor: Parede | null = null;
    let menor = ALCANCE_DA_PAREDE * escala();
    for (const parede of paredes) {
      const d = distanciaAoSegmento(p, parede.a, parede.b);
      if (d <= menor) {
        menor = d;
        melhor = parede;
      }
    }
    return melhor;
  };

  // ---------- Ponteiro (só nas ferramentas do mestre) ----------
  let direitoNaTela: Ponto | null = null;

  canvas.addEventListener('pointerdown', (evento) => {
    shift = evento.shiftKey;
    if (!modo) {
      return;
    }
    if (evento.button === BOTAO_DIREITO) {
      direitoNaTela = { x: evento.clientX, y: evento.clientY };
      return;
    }
    if (evento.button !== BOTAO_ESQUERDO) {
      return;
    }
    const p = mundoDaTela(evento.clientX, evento.clientY);
    if (modo.tipo === 'desenhar') {
      const ponto = pontoAjustado(p, desenho.at(-1) ?? null);
      // Um clique na mesma ponta não cria uma parede sem tamanho.
      if (!desenho.length || !mesmoPonto(ponto, desenho[desenho.length - 1])) {
        desenho.push(ponto);
        if (desenho.length === 1) {
          eventos()?.aoMudarDesenho(true);
        }
      }
      desenharPrevia();
      return;
    }
    // Selecionar: uma ponta (da parede marcada primeiro) começa um arraste; senão, marca a parede.
    const marcada = paredes.find((w) => w.id === selecionada) ?? null;
    const pontaDaMarcada = marcada ? pontaProxima(p, [marcada], ALCANCE_DA_PONTA * escala()) : null;
    const ponta = pontaDaMarcada ?? pontaProxima(p, paredes, ALCANCE_DA_PONTA * escala());
    if (ponta) {
      arrasteDePonta = { de: ponta, para: ponta };
      if (!marcada || !(mesmoPonto(marcada.a, ponta) || mesmoPonto(marcada.b, ponta))) {
        const dona = paredes.find((w) => mesmoPonto(w.a, ponta) || mesmoPonto(w.b, ponta)) ?? null;
        selecionada = dona?.id ?? null;
        eventos()?.aoSelecionar(selecionada);
      }
      redesenhar();
      return;
    }
    selecionada = paredeEm(p)?.id ?? null;
    eventos()?.aoSelecionar(selecionada);
    redesenhar();
  });

  const aoMoverPonteiro = (evento: PointerEvent) => {
    shift = evento.shiftKey;
    if (!modo) {
      return;
    }
    mouse = mundoDaTela(evento.clientX, evento.clientY);
    if (arrasteDePonta) {
      arrasteDePonta.para = pontoAjustado(mouse, null, arrasteDePonta.de);
      desenharLinhas();
      desenharIcones();
      return;
    }
    if (modo.tipo === 'desenhar') {
      desenharPrevia();
    }
  };

  const aoSoltar = (evento: PointerEvent) => {
    if (evento.button === BOTAO_DIREITO && direitoNaTela) {
      const parado = Math.hypot(evento.clientX - direitoNaTela.x, evento.clientY - direitoNaTela.y) < TOLERANCIA_CLIQUE;
      direitoNaTela = null;
      // Botão direito parado termina a linha (arrastado, só moveu a câmera).
      if (parado && modo?.tipo === 'desenhar') {
        terminarDesenho();
      }
      return;
    }
    if (evento.button !== BOTAO_ESQUERDO || !arrasteDePonta) {
      return;
    }
    const { de, para } = arrasteDePonta;
    arrasteDePonta = null;
    if (!mesmoPonto(de, para)) {
      eventos()?.aoMoverPonta(de, para);
    }
    redesenhar();
  };

  window.addEventListener('pointermove', aoMoverPonteiro);
  window.addEventListener('pointerup', aoSoltar);
  canvas.addEventListener('dblclick', () => {
    if (modo?.tipo === 'desenhar') {
      terminarDesenho();
    }
  });
  linhas.on('destroyed', () => {
    window.removeEventListener('pointermove', aoMoverPonteiro);
    window.removeEventListener('pointerup', aoSoltar);
  });

  return {
    linhas,
    icones,
    mostrar(lista, ver) {
      paredes = lista;
      verLinhas = ver;
      if (selecionada && !lista.some((p) => p.id === selecionada)) {
        selecionada = null;
      }
      redesenhar();
    },
    definirModo(novo) {
      // Trocar de ferramenta guarda a linha que estava sendo desenhada.
      if (modo?.tipo === 'desenhar' && JSON.stringify(novo) !== JSON.stringify(modo)) {
        terminarDesenho();
      }
      modo = novo;
      arrasteDePonta = null;
      if (modo?.tipo !== 'selecionar' && selecionada) {
        selecionada = null;
        eventos()?.aoSelecionar(null);
      }
      redesenhar();
    },
    selecionar(id) {
      selecionada = id;
      redesenhar();
    },
    terminarDesenho,
    ajustarAoZoom: redesenhar,
  };
}

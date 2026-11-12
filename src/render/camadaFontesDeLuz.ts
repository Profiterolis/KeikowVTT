/**
 * As fontes de luz do mapa como o mestre as vê: um marcador em cada luz (aceso na cor dela, cinza
 * quando apagada) e, na luz marcada, os círculos da luz clara e da penumbra. Com a ferramenta
 * "💡 Luzes", o mestre põe uma luz clicando no mapa, marca clicando numa luz, arrasta para mover e
 * acende ou apaga com o botão direito. Só desenha e avisa; quem decide é a loja das instâncias.
 */
import { Container, Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { FonteDeLuz } from '../core/luz';
import type { Ponto } from '../core/paredes';

export interface EventosDasLuzes {
  aoCriar(ponto: Ponto): void;
  aoMover(luzId: string, ponto: Ponto): void;
  aoSelecionar(luzId: string | null): void;
  /** Botão direito parado sobre uma luz. */
  aoAlternar(luzId: string): void;
}

/** O raio do marcador e do clique, em pixels da tela. */
const RAIO_DO_MARCADOR = 9;
const ALCANCE_DO_CLIQUE = 14;
const TOLERANCIA_CLIQUE = 4;
const BOTAO_ESQUERDO = 0;
const BOTAO_DIREITO = 2;

export interface CamadaFontesDeLuz {
  readonly container: Container;
  mostrar(luzes: readonly FonteDeLuz[], metrosPorPixel: number): void;
  /** Liga a ferramenta (o botão esquerdo passa a ser dela). */
  definirAtiva(ativa: boolean): void;
  selecionar(luzId: string | null): void;
  ajustarAoZoom(): void;
}

export function criarCamadaFontesDeLuz(
  camera: Viewport,
  canvas: HTMLCanvasElement,
  eventos: () => EventosDasLuzes | null,
): CamadaFontesDeLuz {
  const container = new Container();
  const desenho = new Graphics();
  container.addChild(desenho);
  let luzes: readonly FonteDeLuz[] = [];
  let escalaMetros = 0.015;
  let ativa = false;
  let selecionada: string | null = null;
  let arraste: { id: string; inicioNaTela: Ponto; ponto: Ponto; movendo: boolean } | null = null;
  let direito: Ponto | null = null;

  const escala = () => 1 / camera.scale.x;
  const mundoDaTela = (clientX: number, clientY: number): Ponto => {
    const r = canvas.getBoundingClientRect();
    const { x, y } = camera.toWorld(clientX - r.left, clientY - r.top);
    return { x, y };
  };
  const luzSob = (p: Ponto): FonteDeLuz | null => {
    let melhor: FonteDeLuz | null = null;
    let menor = ALCANCE_DO_CLIQUE * escala();
    for (const luz of luzes) {
      const d = Math.hypot(luz.x - p.x, luz.y - p.y);
      if (d <= menor) {
        menor = d;
        melhor = luz;
      }
    }
    return melhor;
  };

  const desenhar = () => {
    desenho.clear();
    const e = escala();
    for (const luz of luzes) {
      const posicao = arraste?.id === luz.id && arraste.movendo ? arraste.ponto : luz;
      if (luz.id === selecionada) {
        const clara = luz.clara / escalaMetros;
        const total = (luz.clara + luz.penumbra) / escalaMetros;
        if (total > 0) {
          desenho.circle(posicao.x, posicao.y, total).stroke({ color: 0xffffff, width: 1.5 * e, alpha: 0.5 });
        }
        if (clara > 0) {
          desenho.circle(posicao.x, posicao.y, clara).stroke({ color: 0xffffff, width: 2 * e, alpha: 0.9 });
        }
      }
      desenho
        .circle(posicao.x, posicao.y, RAIO_DO_MARCADOR * e)
        .fill({ color: luz.ligada ? luz.cor : 0x555555 })
        .stroke({ color: luz.id === selecionada ? 0xffffff : 0x000000, width: 2 * e });
      // Um "raio" em volta do marcador aceso, para ele parecer uma lâmpada.
      if (luz.ligada) {
        for (let i = 0; i < 8; i += 1) {
          const ang = (i * Math.PI) / 4;
          const r1 = (RAIO_DO_MARCADOR + 3) * e;
          const r2 = (RAIO_DO_MARCADOR + 7) * e;
          desenho
            .moveTo(posicao.x + Math.cos(ang) * r1, posicao.y + Math.sin(ang) * r1)
            .lineTo(posicao.x + Math.cos(ang) * r2, posicao.y + Math.sin(ang) * r2)
            .stroke({ color: luz.cor, width: 2 * e });
        }
      }
    }
  };

  canvas.addEventListener('pointerdown', (evento) => {
    if (!ativa) {
      return;
    }
    const p = mundoDaTela(evento.clientX, evento.clientY);
    if (evento.button === BOTAO_DIREITO) {
      direito = { x: evento.clientX, y: evento.clientY };
      return;
    }
    if (evento.button !== BOTAO_ESQUERDO) {
      return;
    }
    const luz = luzSob(p);
    if (luz) {
      arraste = { id: luz.id, inicioNaTela: { x: evento.clientX, y: evento.clientY }, ponto: p, movendo: false };
      return;
    }
    eventos()?.aoCriar(p);
  });
  canvas.addEventListener('pointermove', (evento) => {
    if (!arraste) {
      return;
    }
    if (!arraste.movendo && Math.hypot(evento.clientX - arraste.inicioNaTela.x, evento.clientY - arraste.inicioNaTela.y) >= TOLERANCIA_CLIQUE) {
      arraste.movendo = true;
    }
    if (arraste.movendo) {
      arraste.ponto = mundoDaTela(evento.clientX, evento.clientY);
      desenhar();
    }
  });
  window.addEventListener('pointerup', (evento) => {
    if (evento.button === BOTAO_DIREITO && direito && ativa) {
      const parado = Math.hypot(evento.clientX - direito.x, evento.clientY - direito.y) < TOLERANCIA_CLIQUE;
      const luz = parado ? luzSob(mundoDaTela(evento.clientX, evento.clientY)) : null;
      direito = null;
      if (luz) {
        eventos()?.aoAlternar(luz.id);
      }
      return;
    }
    if (evento.button !== BOTAO_ESQUERDO || !arraste) {
      return;
    }
    const atual = arraste;
    arraste = null;
    if (atual.movendo) {
      eventos()?.aoMover(atual.id, atual.ponto);
    }
    eventos()?.aoSelecionar(atual.id);
    desenhar();
  });

  return {
    container,
    mostrar(novas, metrosPorPixel) {
      luzes = novas;
      escalaMetros = metrosPorPixel;
      desenhar();
    },
    definirAtiva(valor) {
      ativa = valor;
      arraste = null;
      desenhar();
    },
    selecionar(id) {
      selecionada = id;
      desenhar();
    },
    ajustarAoZoom: desenhar,
  };
}

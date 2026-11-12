import { useEffect, useRef, type DragEvent } from 'react';
import type { PontoMundo } from '../core/hex';
import type { Instancia } from '../core/instancias';
import type { TokenVisto } from '../core/tokens';
import type { EventosDosTokens } from '../render/camadaTokens';
import { criarCenaInstancia, type CenaInstancia } from '../render/cenaInstancia';
import { useBancoDeImagens } from './contextoImagens';

/** O tipo dos dados arrastados da gaveta de tokens até o mapa. */
export const TIPO_ARRASTE_TOKEN = 'application/x-keikow-token';

/** O que se arrasta da gaveta: uma ficha que já existe ou um monstro do compêndio. */
export type ArrasteDeToken = { readonly tipo: 'ficha'; readonly fichaId: string } | { readonly tipo: 'monstro'; readonly entradaId: string };

export function lerArrasteDeToken(texto: string): ArrasteDeToken | null {
  try {
    const dados = JSON.parse(texto) as Record<string, unknown>;
    if (dados.tipo === 'ficha' && typeof dados.fichaId === 'string') {
      return { tipo: 'ficha', fichaId: dados.fichaId };
    }
    if (dados.tipo === 'monstro' && typeof dados.entradaId === 'string') {
      return { tipo: 'monstro', entradaId: dados.entradaId };
    }
  } catch {
    // Algo que não veio da gaveta.
  }
  return null;
}

/**
 * A área que mostra uma instância, no lugar do mapa-mundi. A cena PixiJS é criada uma vez e
 * só troca o que desenha; ao abrir outra instância, a câmera a mostra inteira.
 */
export function VistaInstancia({
  instancia,
  aoMedir,
  regua,
  tokens,
  eventos,
  aoSoltar,
  foco,
}: {
  readonly instancia: Instancia;
  /** Com a régua da escala ligada, recebe a distância medida em pixels; `null` desliga a régua. */
  readonly aoMedir: ((pixels: number) => void) | null;
  /** A régua de distâncias, de todos. */
  readonly regua: boolean;
  readonly tokens: readonly TokenVisto[];
  readonly eventos: EventosDosTokens | null;
  /** Algo arrastado da gaveta de tokens foi solto no mapa; `null` quando ninguém pode soltar. */
  readonly aoSoltar: ((arraste: ArrasteDeToken, ponto: PontoMundo) => void) | null;
  /** O "Ir até": um ponto para a câmera ir; `vez` muda a cada pedido, mesmo para o mesmo ponto. */
  readonly foco: { readonly x: number; readonly y: number; readonly vez: number } | null;
}) {
  const banco = useBancoDeImagens();
  const areaRef = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<CenaInstancia | null>(null);

  useEffect(() => {
    const cena = criarCenaInstancia(areaRef.current!, async (id) => (banco ? banco.endereco(id) : null));
    cenaRef.current = cena;
    return () => {
      cena.destruir();
      cenaRef.current = null;
    };
  }, [banco]);

  useEffect(() => {
    cenaRef.current?.mostrar(instancia);
  }, [instancia]);

  // Outra instância (ou outro tamanho): a câmera mostra o mapa inteiro.
  useEffect(() => {
    cenaRef.current?.enquadrar();
  }, [instancia.id, instancia.largura, instancia.altura]);

  // Depois do enquadramento (acima), para ir até o token mesmo ao abrir outra instância.
  useEffect(() => {
    if (foco) {
      cenaRef.current?.centralizarEm(foco.x, foco.y);
    }
    // Só um pedido novo move a câmera: o ponto sozinho não muda nada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foco?.vez]);

  useEffect(() => {
    cenaRef.current?.medir(aoMedir);
  }, [aoMedir]);

  useEffect(() => {
    cenaRef.current?.regua(regua);
  }, [regua]);

  useEffect(() => {
    cenaRef.current?.tokens(tokens);
  }, [tokens]);

  useEffect(() => {
    cenaRef.current?.aoTokens(eventos);
  }, [eventos]);

  const aoArrastarPorCima = (evento: DragEvent<HTMLDivElement>) => {
    if (aoSoltar && evento.dataTransfer.types.includes(TIPO_ARRASTE_TOKEN)) {
      evento.preventDefault();
      evento.dataTransfer.dropEffect = 'copy';
    }
  };

  const aoSoltarAqui = (evento: DragEvent<HTMLDivElement>) => {
    const arraste = lerArrasteDeToken(evento.dataTransfer.getData(TIPO_ARRASTE_TOKEN));
    const ponto = cenaRef.current?.paraMundo(evento.clientX, evento.clientY) ?? null;
    if (!aoSoltar || !arraste || !ponto) {
      return;
    }
    evento.preventDefault();
    aoSoltar(arraste, ponto);
  };

  return <div className="vista-instancia" ref={areaRef} onDragOver={aoArrastarPorCima} onDrop={aoSoltarAqui} />;
}

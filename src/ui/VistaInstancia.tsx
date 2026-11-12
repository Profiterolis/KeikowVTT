import { useEffect, useRef } from 'react';
import type { Instancia } from '../core/instancias';
import { criarCenaInstancia, type CenaInstancia } from '../render/cenaInstancia';
import { useBancoDeImagens } from './contextoImagens';

/**
 * A área que mostra uma instância, no lugar do mapa-mundi. A cena PixiJS é criada uma vez e
 * só troca o que desenha; ao abrir outra instância, a câmera a mostra inteira.
 */
export function VistaInstancia({
  instancia,
  aoMedir,
}: {
  readonly instancia: Instancia;
  /** Com a régua ligada, recebe a distância medida em pixels; `null` desliga a régua. */
  readonly aoMedir: ((pixels: number) => void) | null;
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

  useEffect(() => {
    cenaRef.current?.medir(aoMedir);
  }, [aoMedir]);

  return <div className="vista-instancia" ref={areaRef} />;
}

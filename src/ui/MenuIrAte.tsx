import { useEffect, useRef, useState } from 'react';

export interface DestinoIrAte {
  readonly chave: string;
  readonly rotulo: string;
  /** Onde está, como "Cripta" ou "mapa-mundi". */
  readonly onde?: string;
  readonly aoEscolher: () => void;
  readonly desativado?: boolean;
  readonly dica?: string;
}

/**
 * "📍 Ir até ▾": leva a câmera até o grupo ou até um jogador, que pode estar no mapa-mundi ou
 * numa instância (o grupo pode estar separado). Fecha ao escolher, ao clicar fora ou com Esc.
 */
export function MenuIrAte({ destinos }: { readonly destinos: readonly DestinoIrAte[] }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) {
      return;
    }
    const fora = (evento: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    };
    const tecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        // Não deixa o Esc chegar aos atalhos do mapa (que, para um jogador, sairiam do modo jogador).
        evento.stopPropagation();
        setAberto(false);
      }
    };
    document.addEventListener('mousedown', fora);
    window.addEventListener('keydown', tecla, true);
    return () => {
      document.removeEventListener('mousedown', fora);
      window.removeEventListener('keydown', tecla, true);
    };
  }, [aberto]);

  return (
    <div className="menu-ir-ate" ref={caixa}>
      <button
        type="button"
        aria-expanded={aberto}
        disabled={destinos.length === 0}
        title="Leva a câmera até o grupo ou até um jogador"
        onClick={() => setAberto(!aberto)}
      >
        📍 Ir até ▾
      </button>
      {aberto && (
        <ul className="menu-ir-ate-lista" role="menu">
          {destinos.map((destino) => (
            <li key={destino.chave}>
              <button
                type="button"
                role="menuitem"
                disabled={destino.desativado}
                title={destino.dica}
                onClick={() => {
                  setAberto(false);
                  destino.aoEscolher();
                }}
              >
                <span>{destino.rotulo}</span>
                {destino.onde && <small>{destino.onde}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

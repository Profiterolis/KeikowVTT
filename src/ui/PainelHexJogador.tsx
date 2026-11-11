import { useSyncExternalStore } from 'react';
import type { LojaGrupo } from '../core/grupo';
import type { CoordHex } from '../core/hex';
import type { LojaMapa } from '../core/loja';
import { hexEm } from '../core/mapa';
import { visaoDoJogador } from '../core/visibilidade';
import { nomeAmigavel } from './nomeAmigavel';

interface PainelHexJogadorProps {
  readonly loja: LojaMapa;
  readonly lojaGrupo: LojaGrupo;
  /** O jogador que está olhando: as notas mostradas só a ele aparecem. */
  readonly participanteId: string;
  readonly coord: CoordHex;
  /** Até onde este jogador enxerga no mapa (1 são os vizinhos do grupo). */
  readonly alcance: number;
  readonly aoFechar: () => void;
}

/** O que o jogador lê sobre um hex. Só recebe dados da visão filtrada, nunca o mapa do mestre. */
export function PainelHexJogador({ loja, lojaGrupo, participanteId, coord, alcance, aoFechar }: PainelHexJogadorProps) {
  const estado = useSyncExternalStore(loja.assinar, loja.obterEstado);
  const { posicao } = useSyncExternalStore(lojaGrupo.assinar, lojaGrupo.obterEstado);
  const hex = hexEm(visaoDoJogador(estado, posicao ? [posicao] : [], participanteId, alcance), coord);
  if (!hex) {
    return null;
  }

  const grupoEstaAqui = posicao?.q === coord.q && posicao.r === coord.r;
  const terreno = nomeAmigavel(hex.terreno);
  const semInformacao = !hex.descricao.trim() && !hex.notas.some((nota) => nota.texto.trim());

  return (
    <aside className="painel-hex" aria-label="O que se sabe sobre este lugar">
      <header>
        <div>
          <h2>{hex.nome || terreno}</h2>
          <p className="painel-coordenada">
            {hex.nome && `${terreno} · `}
            {grupoEstaAqui ? 'Vocês estão aqui' : 'Avistado de longe'}
          </p>
        </div>
        <button type="button" aria-label="Fechar painel" onClick={aoFechar}>
          ×
        </button>
      </header>

      {!grupoEstaAqui && <p>Vocês conseguem ver este lugar, mas não sabem mais sobre ele.</p>}
      {grupoEstaAqui && semInformacao && <p>Nada de especial foi registrado aqui.</p>}
      {hex.descricao.trim() && <p className="painel-texto">{hex.descricao}</p>}
      {hex.notas.some((nota) => nota.texto.trim()) && (
        <section className="painel-secao">
          <h3>Notas</h3>
          <ul>
            {hex.notas
              .filter((nota) => nota.texto.trim())
              .map((nota) => (
                <li key={nota.id} className="painel-texto">
                  {nota.texto}
                </li>
              ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

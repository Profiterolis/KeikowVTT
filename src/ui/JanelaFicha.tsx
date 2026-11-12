import { useMemo, useState, useSyncExternalStore } from 'react';
import type { Participante } from '../core/campanha';
import type { LojaCompendio } from '../core/compendio';
import type { LojaFichas } from '../core/fichas';
import { podeReceberPresente, podeVerFicha } from '../core/permissoes';
import type { LojaRolagens } from '../core/rolagens';
import { PainelRolagens } from './PainelRolagens';
import { EditorFicha } from './TelaFichas';

/**
 * A ficha de um token aberta sobre a instância, sem sair do mapa: a mesma ficha da tela Fichas,
 * com as rolagens ao lado. Some sozinha se a ficha for apagada ou deixar de ser visível.
 */
export function JanelaFicha({
  fichaId,
  lojaFichas,
  lojaCompendio,
  lojaRolagens,
  participantes,
  agindoComoId,
  aoFechar,
}: {
  readonly fichaId: string;
  readonly lojaFichas: LojaFichas;
  readonly lojaCompendio: LojaCompendio;
  readonly lojaRolagens: LojaRolagens;
  readonly participantes: readonly Participante[];
  readonly agindoComoId: string;
  readonly aoFechar: () => void;
}) {
  const estado = useSyncExternalStore(lojaFichas.assinar, lojaFichas.obterEstado);
  const compendio = useSyncExternalStore(lojaCompendio.assinar, lojaCompendio.obterEstado);
  const [secreta, setSecreta] = useState(false);
  const ficha = estado.fichas[fichaId];
  const outras = useMemo(
    () =>
      Object.values(estado.fichas)
        .filter((f) => f.id !== fichaId && podeReceberPresente(f, agindoComoId))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })),
    [estado, fichaId, agindoComoId],
  );
  if (!ficha || !podeVerFicha(ficha, agindoComoId)) {
    return null;
  }
  return (
    <div className="janela-ficha" role="dialog" aria-label={`Ficha: ${ficha.nome.trim() || 'Sem nome'}`}>
      <header>
        <h2>{ficha.nome.trim() || 'Sem nome'}</h2>
        <button type="button" aria-label="Fechar a ficha" onClick={aoFechar}>
          ×
        </button>
      </header>
      <div className="janela-ficha-corpo">
        <main className="compendio-editor">
          {ficha.emCriacao ? (
            <p className="tela-dica">Esta ficha ainda está em criação: termine-a na tela Fichas.</p>
          ) : (
            <EditorFicha
              key={ficha.id}
              ficha={ficha}
              compendio={compendio}
              participantes={participantes}
              lojaFichas={lojaFichas}
              lojaRolagens={lojaRolagens}
              autorId={agindoComoId}
              secreta={secreta}
              outras={outras}
              aoApagar={aoFechar}
            />
          )}
        </main>
        <PainelRolagens lojaRolagens={lojaRolagens} agindoComoId={agindoComoId} secreta={secreta} aoMudarSecreta={setSecreta} />
      </div>
    </div>
  );
}

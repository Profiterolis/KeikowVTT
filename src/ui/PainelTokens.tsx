import { useMemo, useState, type DragEvent } from 'react';
import { buscarEntradas, normalizarBusca, type EstadoCompendio } from '../core/compendio';
import type { EntradaDe } from '../core/entradas';
import type { EstadoFichas, Ficha, TipoFicha } from '../core/fichas';
import type { EstadoInstancias, Instancia } from '../core/instancias';
import { tokenDaFicha } from '../core/tokens';
import { TIPO_ARRASTE_TOKEN, type ArrasteDeToken } from './VistaInstancia';

const ROTULO_TIPO: Readonly<Record<TipoFicha, string>> = { personagem: 'Personagem', npc: 'NPC', monstro: 'Monstro' };
/** O compêndio do SRD tem centenas de monstros: a lista mostra só os primeiros da busca. */
const MAXIMO_MONSTROS = 40;

const nomeDe = (ficha: Ficha) => ficha.nome.trim() || 'Sem nome';

function arrastar(evento: DragEvent<HTMLElement>, arraste: ArrasteDeToken) {
  evento.dataTransfer.setData(TIPO_ARRASTE_TOKEN, JSON.stringify(arraste));
  evento.dataTransfer.effectAllowed = 'copy';
}

/**
 * A gaveta de tokens, só do mestre: o que está neste mapa e o que se pode arrastar para ele
 * (fichas que já existem e monstros do compêndio, que ganham uma ficha própria ao cair no mapa).
 */
export function PainelTokens({
  instancia,
  estado,
  fichas,
  compendio,
  aoTirar,
  aoAbrirFicha,
  aoFechar,
}: {
  readonly instancia: Instancia;
  readonly estado: EstadoInstancias;
  readonly fichas: EstadoFichas;
  readonly compendio: EstadoCompendio;
  readonly aoTirar: (tokenId: string) => void;
  readonly aoAbrirFicha: (fichaId: string) => void;
  readonly aoFechar: () => void;
}) {
  const [busca, setBusca] = useState('');
  const texto = normalizarBusca(busca);
  const passa = (nome: string) => texto === '' || normalizarBusca(nome).includes(texto);

  const noMapa = Object.values(instancia.tokens)
    .map((token) => ({ token, ficha: fichas.fichas[token.fichaId] }))
    .filter((t): t is { token: typeof t.token; ficha: Ficha } => t.ficha !== undefined && passa(t.ficha.nome))
    .sort((a, b) => nomeDe(a.ficha).localeCompare(nomeDe(b.ficha), 'pt-BR'));

  // Personagens e NPCs primeiro; monstros já criados (de outras instâncias ou da tela Fichas) depois.
  const ordemTipo: Readonly<Record<TipoFicha, number>> = { personagem: 0, npc: 1, monstro: 2 };
  const disponiveis = Object.values(fichas.fichas)
    .filter((f) => !Object.values(instancia.tokens).some((t) => t.fichaId === f.id) && !f.emCriacao && passa(f.nome))
    .sort((a, b) => ordemTipo[a.tipo] - ordemTipo[b.tipo] || nomeDe(a).localeCompare(nomeDe(b), 'pt-BR'));

  const monstros = useMemo(
    () => buscarEntradas(compendio, { tipos: ['monstro'], texto: busca }) as EntradaDe<'monstro'>[],
    [compendio, busca],
  );

  /** Onde está o token de uma ficha que está em outro mapa. */
  const ondeEsta = (ficha: Ficha) => {
    const onde = tokenDaFicha(estado, ficha.id);
    return onde ? ` · 📍 ${onde.instancia.nome.trim() || 'outra instância'}` : '';
  };

  return (
    <aside className="painel-hex painel-grupo painel-tokens" aria-label="Tokens">
      <header>
        <div>
          <h2>🧍 Tokens</h2>
          <p className="painel-coordenada">Arraste uma ficha ou um monstro para o mapa.</p>
        </div>
        <button type="button" aria-label="Fechar painel" onClick={aoFechar}>
          ×
        </button>
      </header>

      <input
        type="search"
        className="painel-instancias-busca"
        placeholder="Buscar pelo nome"
        value={busca}
        onChange={(evento) => setBusca(evento.target.value)}
      />

      <section className="painel-grupo-secao">
        <h3>Neste mapa ({Object.keys(instancia.tokens).length})</h3>
        {noMapa.length === 0 ? (
          <p className="tela-dica">Nenhum token aqui{texto ? ' com esse nome' : ''}.</p>
        ) : (
          <ul className="painel-tokens-lista">
            {noMapa.map(({ token, ficha }) => (
              <li key={token.id}>
                <button type="button" className="painel-tokens-nome" onClick={() => aoAbrirFicha(ficha.id)} title="Abrir a ficha">
                  <span className={`painel-tokens-tipo tipo-${ficha.tipo}`} aria-hidden="true" />
                  {nomeDe(ficha)}
                  {token.nomeNoMapa.trim() && <small> “{token.nomeNoMapa.trim()}”</small>}
                  {token.escondido && <small title="Escondido dos jogadores"> 👁️‍🗨️</small>}
                  {token.travado && <small title="Travado"> 🔒</small>}
                </button>
                <button type="button" onClick={() => aoTirar(token.id)}>
                  Tirar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel-grupo-secao">
        <h3>Fichas</h3>
        {disponiveis.length === 0 ? (
          <p className="tela-dica">Nenhuma ficha fora deste mapa{texto ? ' com esse nome' : ''}.</p>
        ) : (
          <ul className="painel-tokens-lista">
            {disponiveis.map((ficha) => (
              <li
                key={ficha.id}
                draggable
                className="painel-tokens-arrastavel"
                onDragStart={(evento) => arrastar(evento, { tipo: 'ficha', fichaId: ficha.id })}
              >
                <span className={`painel-tokens-tipo tipo-${ficha.tipo}`} aria-hidden="true" />
                <span>
                  {nomeDe(ficha)}
                  <small>
                    {' '}
                    {ROTULO_TIPO[ficha.tipo]}
                    {ondeEsta(ficha)}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="painel-grupo-secao">
        <h3>Monstros do compêndio</h3>
        <p className="tela-dica">Cada monstro solto no mapa ganha uma ficha própria, numerada (“Goblin 1”, “Goblin 2”).</p>
        {monstros.length === 0 ? (
          <p className="tela-dica">
            {Object.values(compendio.entradas).some((e) => e.tipo === 'monstro')
              ? 'Nenhum monstro com esse nome.'
              : 'Nenhum monstro no compêndio. Importe o SRD 5.1 no Compêndio.'}
          </p>
        ) : (
          <ul className="painel-tokens-lista">
            {monstros.slice(0, MAXIMO_MONSTROS).map((monstro) => (
              <li
                key={monstro.id}
                draggable
                className="painel-tokens-arrastavel"
                onDragStart={(evento) => arrastar(evento, { tipo: 'monstro', entradaId: monstro.id })}
              >
                <span className="painel-tokens-tipo tipo-monstro" aria-hidden="true" />
                <span>{monstro.nome || '(sem nome)'}</span>
              </li>
            ))}
            {monstros.length > MAXIMO_MONSTROS && (
              <li className="tela-dica">E mais {monstros.length - MAXIMO_MONSTROS}: busque pelo nome.</li>
            )}
          </ul>
        )}
      </section>
    </aside>
  );
}

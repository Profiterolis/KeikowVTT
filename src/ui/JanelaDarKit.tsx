import { useState } from 'react';
import type { EstadoCompendio } from '../core/compendio';
import type { Ficha } from '../core/fichas';
import { conteudoDoKit, textoDasMoedas, todosOsKits } from '../core/kits';

interface Props {
  readonly compendio: EstadoCompendio;
  /** As fichas que podem receber o kit, em ordem. */
  readonly fichas: readonly Ficha[];
  readonly aoFechar: () => void;
  /** Entrega o kit às fichas escolhidas; devolve os itens que não estavam mais no compêndio. */
  readonly aoDar: (kitId: string, fichaIds: readonly string[]) => readonly string[];
}

/**
 * O mestre dá um kit a uma ou mais fichas. Cada ficha recebe os itens separados, como pilhas
 * comuns, e as moedas: o jogador nunca vê o kit, só o que veio nele.
 */
export function JanelaDarKit({ compendio, fichas, aoFechar, aoDar }: Props) {
  const kits = todosOsKits(compendio);
  const [kitId, setKitId] = useState(kits[0]?.id ?? '');
  const [escolhidas, setEscolhidas] = useState<ReadonlySet<string>>(new Set());
  const [resultado, setResultado] = useState<string | null>(null);
  const kit = kits.find((k) => k.id === kitId);

  const alternar = (id: string) => {
    const novas = new Set(escolhidas);
    if (novas.has(id)) {
      novas.delete(id);
    } else {
      novas.add(id);
    }
    setEscolhidas(novas);
  };

  const dar = () => {
    if (!kit) {
      return;
    }
    const ids = fichas.filter((f) => escolhidas.has(f.id) && !f.emCriacao).map((f) => f.id);
    const faltando = aoDar(kit.id, ids);
    const nomes = fichas.filter((f) => escolhidas.has(f.id)).map((f) => f.nome || '(sem nome)');
    setResultado(
      `${kit.nome || 'Kit'} entregue a ${nomes.join(', ')}.` +
        (faltando.length > 0 ? ` ${faltando.length} item(ns) do kit não estão mais no compêndio e ficaram de fora.` : ''),
    );
    setEscolhidas(new Set());
  };

  const moedas = kit ? textoDasMoedas(kit) : '';
  return (
    <div className="janela-fundo" role="dialog" aria-label="Dar kit">
      <div className="janela">
        <h3>Dar kit</h3>
        {kits.length === 0 ? (
          <p className="tela-dica">Não há kits no compêndio. Crie um no Compêndio (tipo Kit) ou importe o SRD.</p>
        ) : (
          <>
            <label className="campo">
              <span>Kit</span>
              <select value={kitId} onChange={(e) => setKitId(e.target.value)}>
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nome || '(sem nome)'}
                  </option>
                ))}
              </select>
            </label>
            {kit && (
              <ul className="assistente-kit">
                {conteudoDoKit(kit, compendio).map((linha) => (
                  <li key={linha.entradaId} className={linha.existe ? undefined : 'aviso'}>
                    {linha.quantidade} × {linha.nome}
                  </li>
                ))}
                {moedas && <li>{moedas}</li>}
                {kit.dados.itens.length === 0 && !moedas && <li>Kit vazio.</li>}
              </ul>
            )}
            <fieldset className="janela-kit-fichas">
              <legend>Para quem (cada ficha recebe um kit inteiro)</legend>
              {fichas.map((f) => (
                // Uma ficha em criação é remontada pelo assistente a cada escolha: um kit dado
                // agora sumiria. O equipamento dela vem dos kits da classe, no assistente.
                <label key={f.id} title={f.emCriacao ? 'Em criação: o equipamento vem do assistente.' : undefined}>
                  <input type="checkbox" disabled={f.emCriacao} checked={escolhidas.has(f.id)} onChange={() => alternar(f.id)} />
                  {f.nome || '(sem nome)'}
                  {f.emCriacao && <small> (em criação)</small>}
                </label>
              ))}
            </fieldset>
          </>
        )}
        {resultado && <p className="mensagem-info">{resultado}</p>}
        <div className="tela-cabecalho-acoes">
          <button type="button" onClick={aoFechar}>
            Fechar
          </button>
          <button type="button" disabled={!kit || escolhidas.size === 0} onClick={dar}>
            Dar o kit
          </button>
        </div>
      </div>
    </div>
  );
}

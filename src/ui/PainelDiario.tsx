import { useMemo, useState, useSyncExternalStore } from 'react';
import type { Participante } from '../core/campanha';
import {
  CATEGORIAS_DO_DIARIO,
  diarioEmTexto,
  diarioPorDias,
  resumoDoDia,
  type CategoriaDoDiario,
  type NomesDoDiario,
} from '../core/diarioDeViagem';
import { formatarRelogio, type LojaGrupo } from '../core/grupo';
import type { CoordHex } from '../core/hex';
import type { LojaMapa } from '../core/loja';
import { hexEm } from '../core/mapa';
import { useRegras } from './contextoRegras';

interface PainelDiarioProps {
  readonly loja: LojaMapa;
  readonly lojaGrupo: LojaGrupo;
  readonly participantes: readonly Participante[];
  /** Leva a câmera até o hex de uma linha. */
  readonly aoIrAte: (coord: CoordHex) => void;
  readonly aoFechar: () => void;
}

const TODAS = new Set<CategoriaDoDiario>(CATEGORIAS_DO_DIARIO.map((c) => c.id));

/**
 * O diário de viagem, só do mestre: cada passo, descanso e mudança de relógio, por dia, com
 * as anotações dele. Os jogadores não veem; eles usam as próprias anotações.
 */
export function PainelDiario({ loja, lojaGrupo, participantes, aoIrAte, aoFechar }: PainelDiarioProps) {
  const grupo = useSyncExternalStore(lojaGrupo.assinar, lojaGrupo.obterEstado);
  const mapa = useSyncExternalStore(loja.assinar, loja.obterEstado);
  const { viagem } = useRegras();
  const [categorias, setCategorias] = useState<ReadonlySet<CategoriaDoDiario>>(TODAS);
  const [anotacao, setAnotacao] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const nomes = useMemo<NomesDoDiario>(
    () => ({
      nomeDoHex: (coord) => hexEm(mapa, coord)?.nome ?? '',
      nomeDoAutor: (id) => participantes.find((p) => p.id === id)?.nome ?? 'Participante removido',
      viagem,
    }),
    [mapa, participantes, viagem],
  );
  const dias = useMemo(() => diarioPorDias(grupo.historico, nomes, categorias), [grupo.historico, nomes, categorias]);

  const alternar = (id: CategoriaDoDiario) => {
    const novas = new Set(categorias);
    if (novas.has(id)) {
      novas.delete(id);
    } else {
      novas.add(id);
    }
    setCategorias(novas);
  };

  const anotar = () => {
    if (lojaGrupo.despachar({ tipo: 'AnotarNaViagem', texto: anotacao })) {
      setAnotacao('');
    }
  };

  const copiar = async () => {
    const texto = diarioEmTexto(grupo.historico, nomes);
    let copiou = false;
    try {
      await navigator.clipboard.writeText(texto);
      copiou = true;
    } catch {
      // Alguns navegadores recusam a área de transferência moderna; o jeito antigo ainda funciona neles.
      const campo = document.createElement('textarea');
      campo.value = texto;
      campo.style.position = 'fixed';
      campo.style.opacity = '0';
      document.body.appendChild(campo);
      campo.select();
      copiou = document.execCommand('copy');
      campo.remove();
    }
    setAviso(
      copiou
        ? 'Diário copiado. Cole onde quiser, como num resumo da sessão.'
        : 'O navegador não deixou copiar. Tente de novo com a janela em foco.',
    );
  };

  return (
    <aside className="painel-hex painel-grupo painel-diario" aria-label="Diário de viagem">
      <header>
        <div>
          <h2>📜 Diário de viagem</h2>
          <p className="painel-coordenada">
            Só o mestre vê · agora: {formatarRelogio(grupo.relogio)}
          </p>
        </div>
        <button type="button" aria-label="Fechar painel" onClick={aoFechar}>
          ✕
        </button>
      </header>

      <form
        className="painel-diario-anotar"
        onSubmit={(evento) => {
          evento.preventDefault();
          anotar();
        }}
      >
        <textarea
          rows={2}
          placeholder="Anotar no diário, como &quot;emboscada de goblins&quot;"
          value={anotacao}
          onChange={(e) => setAnotacao(e.target.value)}
          onKeyDown={(e) => {
            // Enter anota; Shift+Enter quebra a linha.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              anotar();
            }
          }}
        />
        <button type="submit" disabled={anotacao.trim() === ''}>
          Anotar
        </button>
      </form>

      <div className="painel-diario-filtros" role="group" aria-label="Mostrar">
        {CATEGORIAS_DO_DIARIO.map((c) => (
          <label key={c.id}>
            <input type="checkbox" checked={categorias.has(c.id)} onChange={() => alternar(c.id)} />
            {c.nome}
          </label>
        ))}
      </div>

      <div className="painel-grupo-linha">
        <button type="button" disabled={grupo.historico.length === 0} onClick={() => void copiar()}>
          Copiar o diário
        </button>
        {aviso && <small className="painel-diario-aviso">{aviso}</small>}
      </div>

      {grupo.historico.length === 0 ? (
        <p>Nada aconteceu ainda. Posicione o grupo e comece a viagem.</p>
      ) : dias.length === 0 ? (
        <p>Nenhuma linha com os filtros escolhidos.</p>
      ) : (
        dias.map((dia) => {
          const resumo = resumoDoDia(dia);
          return (
            <section key={dia.dia} className="painel-grupo-secao">
              <h3>
                Dia {dia.dia}
                {resumo && <small> · {resumo}</small>}
              </h3>
              <ol className="painel-diario-linhas">
                {dia.linhas.map((linha) => (
                  <li key={linha.id}>
                    <button
                      type="button"
                      disabled={!linha.coord}
                      title={linha.coord ? 'Mostrar este lugar no mapa' : undefined}
                      onClick={() => linha.coord && aoIrAte(linha.coord)}
                    >
                      <span className="painel-diario-icone" aria-hidden>
                        {linha.icone}
                      </span>
                      <span className="painel-diario-texto">
                        <span className="painel-diario-hora">{linha.hora}</span>
                        <span>{linha.texto}</span>
                        {linha.detalhe && <small>{linha.detalhe}</small>}
                        <small className="painel-diario-autor">{linha.autor}</small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          );
        })
      )}

      <p className="painel-diario-rodape">
        O "Desfazer" da barra do grupo tira a última linha, voltando a posição e o relógio. O diário guarda as
        últimas 1000 linhas.
      </p>
    </aside>
  );
}

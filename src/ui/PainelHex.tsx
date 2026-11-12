import { useRef, useState, useSyncExternalStore } from 'react';
import type { LojaGrupo } from '../core/grupo';
import { chaveHex, type CoordHex } from '../core/hex';
import type { LojaMapa } from '../core/loja';
import { hexEm, type Nota } from '../core/mapa';
import type { Participante } from '../core/campanha';
import {
  nivelDeVisao,
  SO_MESTRE,
  VISIVEL_A_TODOS,
  type NivelDeVisao,
  type Visibilidade,
} from '../core/visibilidade';
import { instanciasDoHex, novaInstancia, type LojaInstancias } from '../core/instancias';
import { nomeAmigavel } from './nomeAmigavel';
import { SeletorVisibilidade } from './SeletorVisibilidade';

interface PainelHexProps {
  readonly loja: LojaMapa;
  readonly lojaGrupo: LojaGrupo;
  /** Para escolher a quais jogadores uma nota é mostrada. */
  readonly participantes: readonly Participante[];
  readonly coord: CoordHex;
  readonly aoFechar: () => void;
  readonly lojaInstancias: LojaInstancias;
  readonly aoAbrirInstancia: (instanciaId: string) => void;
}

/** As instâncias presas a este hex, com "Criar instância aqui". */
function SecaoInstanciasDoHex({
  lojaInstancias,
  coord,
  nomeDoHex,
  aoAbrir,
}: {
  readonly lojaInstancias: LojaInstancias;
  readonly coord: CoordHex;
  readonly nomeDoHex: string;
  readonly aoAbrir: (instanciaId: string) => void;
}) {
  const estado = useSyncExternalStore(lojaInstancias.assinar, lojaInstancias.obterEstado);
  const lista = instanciasDoHex(estado, coord);
  const criar = () => {
    const instancia = novaInstancia(crypto.randomUUID(), nomeDoHex ? `Instância em ${nomeDoHex}` : 'Nova instância', coord);
    lojaInstancias.despachar({ tipo: 'CriarInstancia', instancia });
    aoAbrir(instancia.id);
  };
  return (
    <section className="painel-secao painel-instancias-do-hex">
      <h3>🚪 Instâncias deste hex</h3>
      <ul>
        {lista.map((instancia) => (
          <li key={instancia.id}>
            <button type="button" className="painel-adicionar" onClick={() => aoAbrir(instancia.id)}>
              {instancia.nome.trim() || 'Sem nome'} → abrir
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="painel-adicionar" onClick={criar}>
        + Criar instância aqui
      </button>
    </section>
  );
}

const DESCRICAO_NIVEL: Readonly<Record<NivelDeVisao, string>> = {
  completo: 'O grupo está aqui: os jogadores veem tudo o que é público.',
  avistado: 'Os jogadores veem só o terreno e as decorações.',
  oculto: 'Os jogadores não veem este hex.',
};

export function PainelHex({ loja, lojaGrupo, participantes, coord, aoFechar, lojaInstancias, aoAbrirInstancia }: PainelHexProps) {
  const estado = useSyncExternalStore(loja.assinar, loja.obterEstado);
  const { posicao } = useSyncExternalStore(lojaGrupo.assinar, lojaGrupo.obterEstado);
  const hex = hexEm(estado, coord);
  const grupoEstaAqui = posicao?.q === coord.q && posicao.r === coord.r;
  // Cada vez que um campo recebe o foco começa um novo passo de desfazer.
  const sessaoDeFoco = useRef(0);
  const [notaRecemCriada, setNotaRecemCriada] = useState<string | null>(null);

  const grupoDoCampo = (campo: string) =>
    `${chaveHex(coord)}:${campo}:${sessaoDeFoco.current}`;

  const adicionarNota = (visibilidade: Visibilidade) => {
    const id = crypto.randomUUID();
    loja.despachar({ tipo: 'AdicionarNota', coord, nota: { id, texto: '', visibilidade } });
    setNotaRecemCriada(id);
  };

  const renderizarNota = (nota: Nota) => {
    return (
      <li key={nota.id}>
        <textarea
          aria-label="Texto da nota"
          rows={2}
          value={nota.texto}
          autoFocus={nota.id === notaRecemCriada}
          onChange={(evento) =>
            loja.despachar(
              { tipo: 'EditarNota', coord, notaId: nota.id, texto: evento.target.value },
              grupoDoCampo(nota.id),
            )
          }
        />
        <div className="painel-nota-acoes">
          <SeletorVisibilidade
            rotulo="Quem vê"
            valor={nota.visibilidade}
            participantes={participantes}
            aoMudar={(visibilidade) =>
              loja.despachar({ tipo: 'DefinirVisibilidadeNota', coord, notaId: nota.id, visibilidade })
            }
          />
          <button
            type="button"
            onClick={() => loja.despachar({ tipo: 'RemoverNota', coord, notaId: nota.id })}
          >
            Apagar
          </button>
        </div>
      </li>
    );
  };

  const renderizarSecao = (
    titulo: string,
    classe: string,
    visibilidade: Visibilidade,
    rotuloAdicionar: string,
  ) => (
    <section className={`painel-secao ${classe}`}>
      <h3>{titulo}</h3>
      <ul>
        {hex?.notas
          .filter((n) => (n.visibilidade.tipo === 'todos') === (visibilidade.tipo === 'todos'))
          .map(renderizarNota)}
      </ul>
      <button type="button" className="painel-adicionar" onClick={() => adicionarNota(visibilidade)}>
        {rotuloAdicionar}
      </button>
    </section>
  );

  return (
    <aside
      className="painel-hex"
      aria-label="Informações do hex"
      onFocus={() => {
        sessaoDeFoco.current += 1;
      }}
    >
      <header>
        <div>
          <h2>{hex ? hex.nome || nomeAmigavel(hex.terreno) : 'Hex vazio'}</h2>
          <p className="painel-coordenada">
            {hex && `${nomeAmigavel(hex.terreno)} · `}q {coord.q}, r {coord.r}
          </p>
        </div>
        <button type="button" aria-label="Fechar painel" onClick={aoFechar}>
          ×
        </button>
      </header>

      {!hex && <p>Pinte um terreno neste hex para poder guardar informações nele.</p>}

      {hex && (
        <>
          <section className="painel-visao">
            <p>
              {DESCRICAO_NIVEL[nivelDeVisao(hex, posicao ? [posicao] : [])]}
              {hex.revelado && ' Revelado por você.'}
            </p>
            <div className="painel-nota-acoes">
              <button
                type="button"
                onClick={() =>
                  loja.despachar({ tipo: hex.revelado ? 'OcultarHex' : 'RevelarHex', coord })
                }
              >
                {hex.revelado ? 'Ocultar' : 'Revelar'}
              </button>
              <button
                type="button"
                disabled={grupoEstaAqui}
                onClick={() => lojaGrupo.despachar({ tipo: 'PosicionarGrupo', coord })}
              >
                Colocar o grupo aqui
              </button>
            </div>
          </section>
          <label className="painel-campo">
            Nome
            <input
              type="text"
              value={hex.nome}
              placeholder="Sem nome"
              onChange={(evento) =>
                loja.despachar(
                  { tipo: 'EditarInformacaoHex', coord, campos: { nome: evento.target.value } },
                  grupoDoCampo('nome'),
                )
              }
            />
          </label>
          <label className="painel-campo">
            Descrição
            <textarea
              rows={3}
              value={hex.descricao}
              placeholder="O que os jogadores veem aqui"
              onChange={(evento) =>
                loja.despachar(
                  {
                    tipo: 'EditarInformacaoHex',
                    coord,
                    campos: { descricao: evento.target.value },
                  },
                  grupoDoCampo('descricao'),
                )
              }
            />
          </label>
          {renderizarSecao(
            'Notas públicas',
            'painel-publicas',
            VISIVEL_A_TODOS,
            '+ Adicionar nota pública',
          )}
          {renderizarSecao(
            'Notas secretas (só o mestre ou alguns jogadores)',
            'painel-secretas',
            SO_MESTRE,
            '+ Adicionar nota secreta',
          )}
          <SecaoInstanciasDoHex
            lojaInstancias={lojaInstancias}
            coord={coord}
            nomeDoHex={hex.nome.trim()}
            aoAbrir={aoAbrirInstancia}
          />
        </>
      )}
    </aside>
  );
}

import { useState, useSyncExternalStore } from 'react';
import type { Participante } from '../core/campanha';
import type { CoordHex } from '../core/hex';
import {
  CENA_MAPA,
  cenaNaInstancia,
  instanciasEmOrdem,
  novaInstancia,
  quemEstaNaCena,
  situacaoDoHex,
  type Instancia,
  type LojaInstancias,
} from '../core/instancias';
import type { EstadoMapa } from '../core/mapa';

type Filtro = 'todas' | 'hex' | 'universais';

/** "q 1, r 2", "universal" ou o hex sem terreno. */
export function textoDoHex(instancia: Instancia, mapa: EstadoMapa): string {
  if (!instancia.hex) {
    return 'Universal';
  }
  const hex = mapa.hexes[`${instancia.hex.q},${instancia.hex.r}`];
  const nome = hex?.nome.trim();
  const local = `q ${instancia.hex.q}, r ${instancia.hex.r}`;
  if (situacaoDoHex(instancia, mapa) === 'hexSemTerreno') {
    return `${local} (hex sem terreno)`;
  }
  return nome ? `${nome} (${local})` : local;
}

/**
 * A lista das instâncias, só do mestre: buscar, filtrar, criar, abrir e escolher a cena inicial.
 * Fica no mesmo lugar dos painéis do grupo e do hex.
 */
export function PainelInstancias({
  lojaInstancias,
  mapa,
  participantes,
  hexSelecionado,
  aoAbrir,
  aoFechar,
}: {
  readonly lojaInstancias: LojaInstancias;
  readonly mapa: EstadoMapa;
  readonly participantes: readonly Participante[];
  /** O hex marcado no mapa-mundi, para o filtro e para criar uma instância nele. */
  readonly hexSelecionado: CoordHex | null;
  readonly aoAbrir: (instanciaId: string) => void;
  readonly aoFechar: () => void;
}) {
  const estado = useSyncExternalStore(lojaInstancias.assinar, lojaInstancias.obterEstado);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>(hexSelecionado ? 'hex' : 'todas');
  const jogadores = participantes.filter((p) => p.papel === 'jogador').map((p) => p.id);

  const termo = busca.trim().toLocaleLowerCase('pt-BR');
  const lista = instanciasEmOrdem(estado).filter((instancia) => {
    if (termo && !instancia.nome.toLocaleLowerCase('pt-BR').includes(termo)) {
      return false;
    }
    if (filtro === 'universais') {
      return instancia.hex === null;
    }
    if (filtro === 'hex') {
      return hexSelecionado !== null && instancia.hex?.q === hexSelecionado.q && instancia.hex.r === hexSelecionado.r;
    }
    return true;
  });

  const criar = () => {
    const instancia = novaInstancia(crypto.randomUUID(), 'Nova instância', filtro === 'hex' ? hexSelecionado : null);
    lojaInstancias.despachar({ tipo: 'CriarInstancia', instancia });
    aoAbrir(instancia.id);
  };

  const cenaInicial = estado.cenaInicial.tipo === 'instancia' ? estado.cenaInicial.instanciaId : '';

  return (
    <aside className="painel-hex painel-grupo painel-instancias" aria-label="Instâncias">
      <header>
        <div>
          <h2>🚪 Instâncias</h2>
          <p className="painel-coordenada">
            {Object.keys(estado.instancias).length === 0
              ? 'Nenhuma instância ainda'
              : `${Object.keys(estado.instancias).length} no total`}
          </p>
        </div>
        <button type="button" aria-label="Fechar painel" onClick={aoFechar}>
          ×
        </button>
      </header>

      <label className="painel-campo">
        ⭐ Cena inicial (onde começa quem ainda não tem cena)
        <select
          value={cenaInicial}
          onChange={(evento) =>
            lojaInstancias.despachar({
              tipo: 'DefinirCenaInicial',
              cena: evento.target.value ? cenaNaInstancia(evento.target.value) : CENA_MAPA,
            })
          }
        >
          <option value="">Mapa-mundi</option>
          {instanciasEmOrdem(estado).map((i) => (
            <option key={i.id} value={i.id}>
              {i.nome.trim() || 'Sem nome'}
            </option>
          ))}
        </select>
      </label>

      <section className="painel-grupo-secao">
        <input
          type="search"
          className="painel-instancias-busca"
          placeholder="Buscar pelo nome"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
        />
        <div className="painel-diario-filtros" role="group" aria-label="Mostrar">
          <button type="button" aria-pressed={filtro === 'todas'} onClick={() => setFiltro('todas')}>
            Todas
          </button>
          <button
            type="button"
            aria-pressed={filtro === 'hex'}
            disabled={!hexSelecionado}
            title={hexSelecionado ? undefined : 'Clique num hex do mapa-mundi para ver as instâncias dele'}
            onClick={() => setFiltro('hex')}
          >
            {hexSelecionado ? `Do hex q ${hexSelecionado.q}, r ${hexSelecionado.r}` : 'Do hex'}
          </button>
          <button type="button" aria-pressed={filtro === 'universais'} onClick={() => setFiltro('universais')}>
            Universais
          </button>
        </div>
        <button type="button" className="painel-instancias-criar" onClick={criar}>
          {filtro === 'hex' && hexSelecionado ? '+ Nova instância neste hex' : '+ Nova instância universal'}
        </button>
        {lista.length === 0 ? (
          <p className="tela-dica">Nenhuma instância aqui.</p>
        ) : (
          <ul className="painel-instancias-lista">
            {lista.map((instancia) => {
              const dentro = quemEstaNaCena(estado, cenaNaInstancia(instancia.id), jogadores).length;
              return (
                <li key={instancia.id}>
                  <button type="button" onClick={() => aoAbrir(instancia.id)}>
                    <strong>{instancia.nome.trim() || 'Sem nome'}</strong>
                    {cenaInicial === instancia.id && ' ⭐'}
                    <small>
                      {textoDoHex(instancia, mapa)}
                      {dentro > 0 && ` · ${dentro} ${dentro === 1 ? 'jogador' : 'jogadores'} aqui`}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}

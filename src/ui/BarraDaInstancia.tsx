import { useState } from 'react';
import type { Participante } from '../core/campanha';
import {
  CENA_MAPA,
  cenaDe,
  cenaNaInstancia,
  quemEstaNaCena,
  type EstadoInstancias,
  type Instancia,
  type LojaInstancias,
} from '../core/instancias';
import type { EstadoMapa } from '../core/mapa';
import { MenuIrAte, type DestinoIrAte } from './MenuIrAte';
import { textoDoHex } from './PainelInstancias';

const nomeDe = (p: Participante) => p.nome.trim() || 'Sem nome';

/**
 * A barra no topo de uma instância. Todos veem o nome, a régua e o botão do mapa-mundi; o mestre
 * também vê quem está ali, leva jogadores para cá (ou de volta), abre os tokens e a configuração
 * e trava o movimento dos jogadores.
 */
export function BarraDaInstancia({
  instancia,
  estado,
  lojaInstancias,
  mapa,
  participantes,
  mestre,
  configurando,
  aoAlternarConfiguracao,
  tokensAbertos,
  aoAlternarTokens,
  regua,
  aoAlternarRegua,
  destinosIrAte,
  aoIrAoMapa,
}: {
  readonly instancia: Instancia;
  readonly estado: EstadoInstancias;
  readonly lojaInstancias: LojaInstancias;
  readonly mapa: EstadoMapa;
  readonly participantes: readonly Participante[];
  readonly mestre: boolean;
  readonly configurando: boolean;
  readonly aoAlternarConfiguracao: () => void;
  readonly tokensAbertos: boolean;
  readonly aoAlternarTokens: () => void;
  readonly regua: boolean;
  readonly aoAlternarRegua: () => void;
  /** O mestre vai até o grupo ou um jogador; o jogador, até um personagem desta instância. */
  readonly destinosIrAte: readonly DestinoIrAte[];
  /** O mestre volta a ver o mapa-mundi; o jogador só espia, sem sair da instância. */
  readonly aoIrAoMapa: () => void;
}) {
  const [escolhendo, setEscolhendo] = useState(false);
  const [marcados, setMarcados] = useState<readonly string[]>([]);
  const jogadores = participantes.filter((p) => p.papel === 'jogador');
  const aqui = cenaNaInstancia(instancia.id);
  const dentro = new Set(quemEstaNaCena(estado, aqui, jogadores.map((p) => p.id)));
  const fora = jogadores.filter((p) => !dentro.has(p.id));

  const levar = (ids: readonly string[]) => {
    lojaInstancias.despachar({ tipo: 'LevarParaCena', participanteIds: ids, cena: aqui });
    setMarcados([]);
    setEscolhendo(false);
  };

  /** Onde está um jogador que não está aqui: no mapa-mundi ou em outra instância. */
  const ondeEsta = (id: string) => {
    const cena = cenaDe(estado, id);
    return cena.tipo === 'mapa' ? 'no mapa-mundi' : `em ${estado.instancias[cena.instanciaId]?.nome.trim() || 'outra instância'}`;
  };

  return (
    <div className="barra-grupo barra-instancia">
      <div className="barra-grupo-linha">
        <strong className="barra-instancia-nome">🚪 {instancia.nome.trim() || 'Sem nome'}</strong>
        {mestre && <span className="barra-instancia-hex">{textoDoHex(instancia, mapa)}</span>}
        <button type="button" onClick={aoIrAoMapa} title={mestre ? undefined : 'Só para olhar: você continua aqui'}>
          {mestre ? '← Mapa-mundi' : '🗺️ Espiar o mapa-mundi'}
        </button>
        <MenuIrAte destinos={destinosIrAte} />
        <button
          type="button"
          aria-pressed={regua}
          onClick={aoAlternarRegua}
          title="Aperte, arraste e solte no mapa para medir em metros (Esc desliga)"
        >
          📏 Régua
        </button>
        {mestre && (
          <button type="button" aria-pressed={tokensAbertos} onClick={aoAlternarTokens}>
            🧍 Tokens
          </button>
        )}
        {mestre && (
          <button
            type="button"
            aria-pressed={instancia.movimentoTravado}
            title="Travado, nenhum jogador move tokens aqui; o mestre continua movendo"
            onClick={() =>
              lojaInstancias.despachar({
                tipo: 'EditarInstancia',
                instanciaId: instancia.id,
                mudancas: { movimentoTravado: !instancia.movimentoTravado },
              })
            }
          >
            {instancia.movimentoTravado ? '⛔ Movimento travado' : '🔓 Movimento livre'}
          </button>
        )}
        {!mestre && instancia.movimentoTravado && <span className="barra-grupo-aviso">⛔ O mestre travou o movimento</span>}
        {mestre && (
          <button type="button" aria-pressed={configurando} onClick={aoAlternarConfiguracao}>
            ⚙️ Configurar
          </button>
        )}
      </div>
      {mestre && (
        <div className="barra-grupo-linha barra-instancia-jogadores">
          <span>
            Aqui:{' '}
            {dentro.size === 0
              ? 'nenhum jogador'
              : jogadores
                  .filter((p) => dentro.has(p.id))
                  .map(nomeDe)
                  .join(', ')}
          </span>
          <button type="button" disabled={fora.length === 0} aria-expanded={escolhendo} onClick={() => setEscolhendo(!escolhendo)}>
            Levar jogadores para cá ▾
          </button>
          {dentro.size > 0 && (
            <button
              type="button"
              onClick={() => lojaInstancias.despachar({ tipo: 'LevarParaCena', participanteIds: [...dentro], cena: CENA_MAPA })}
            >
              Mandar todos de volta ao mapa-mundi
            </button>
          )}
        </div>
      )}
      {mestre && escolhendo && fora.length > 0 && (
        <div className="barra-instancia-escolha">
          {fora.map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={marcados.includes(p.id)}
                onChange={(evento) =>
                  setMarcados(evento.target.checked ? [...marcados, p.id] : marcados.filter((id) => id !== p.id))
                }
              />
              {nomeDe(p)} <small>({ondeEsta(p.id)})</small>
            </label>
          ))}
          <div className="barra-grupo-linha">
            <button type="button" disabled={marcados.length === 0} onClick={() => levar(marcados)}>
              Levar {marcados.length > 0 ? marcados.length : ''}
            </button>
            <button type="button" onClick={() => levar(fora.map((p) => p.id))}>
              Levar todos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

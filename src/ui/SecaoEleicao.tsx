import {
  candidatos,
  contagemDaEleicao,
  eleitores,
  votosValidos,
  type ContextoDoGrupo,
  type EstadoGrupo,
  type LojaGrupo,
  type ResultadoDaEleicao,
} from '../core/grupo';
import { ehMestre } from '../core/visibilidade';

interface SecaoEleicaoProps {
  /** O grupo como quem age o vê: um jogador não sabe em quem os outros votaram. */
  readonly grupo: EstadoGrupo;
  readonly lojaGrupo: LojaGrupo;
  readonly contexto: ContextoDoGrupo;
  readonly autorId: string;
  readonly nomeDaFicha: (id: string) => string;
  readonly nomeDoParticipante: (id: string) => string;
}

const votos = (n: number) => (n === 1 ? '1 voto' : `${n} votos`);

/** "Bia lidera (Bia 2 · Ana 1)", com o desempate do mestre quando houve. */
function textoDoResultado(resultado: ResultadoDaEleicao, nomeDaFicha: (id: string) => string): string {
  if (resultado.vencedorId === null) {
    return 'Ninguém votou; a liderança não mudou.';
  }
  const placar = Object.entries(resultado.contagem)
    .sort(([, a], [, b]) => b - a)
    .map(([id, n]) => `${nomeDaFicha(id)} ${n}`)
    .join(' · ');
  const desempate = resultado.desempatePeloMestre ? ', desempate do mestre' : '';
  return `${nomeDaFicha(resultado.vencedorId)} lidera (${placar}${desempate}).`;
}

/**
 * A eleição do líder no painel do grupo. Cada jogador com personagem no grupo vota uma vez
 * (pode trocar até acabar); o voto é secreto; o mestre encerra, cancela e desempata.
 */
export function SecaoEleicao({ grupo, lojaGrupo, contexto, autorId, nomeDaFicha, nomeDoParticipante }: SecaoEleicaoProps) {
  const mestre = ehMestre(autorId);
  const quemVota = eleitores(grupo, contexto);
  const emQuem = candidatos(grupo, contexto);
  const { eleicao, ultimaEleicao } = grupo;
  const participa = mestre || quemVota.includes(autorId);

  if (!eleicao) {
    return (
      <section className="painel-grupo-secao">
        <h3>Eleição do líder</h3>
        {ultimaEleicao && <p className="painel-eleicao-resultado">Última eleição: {textoDoResultado(ultimaEleicao, nomeDaFicha)}</p>}
        {participa ? (
          <button
            type="button"
            disabled={emQuem.length < 2}
            title={
              emQuem.length < 2
                ? 'Uma eleição precisa de pelo menos dois personagens de jogadores no grupo.'
                : 'Cada jogador com personagem no grupo vota uma vez, em segredo.'
            }
            onClick={() => lojaGrupo.despachar({ tipo: 'PedirEleicao' })}
          >
            🗳️ Pedir eleição
          </button>
        ) : (
          !ultimaEleicao && <p>Quem tem personagem no grupo pode pedir uma eleição.</p>
        )}
      </section>
    );
  }

  const validos = votosValidos(grupo, contexto);
  const contagem = contagemDaEleicao(grupo, contexto);
  const meuVoto = validos[autorId];
  const eleitor = quemVota.includes(autorId);
  const { empatados } = eleicao;

  return (
    <section className="painel-grupo-secao painel-eleicao">
      <h3>🗳️ Eleição do líder</h3>
      <p className="painel-coordenada">Pedida por {nomeDoParticipante(eleicao.pedidaPor)} · o voto é secreto</p>

      {empatados ? (
        <p className="aviso">
          Empate entre {empatados.map(nomeDaFicha).join(' e ')}
          {mestre ? ': escolha quem lidera.' : ': o mestre decide.'}
        </p>
      ) : (
        eleitor && <p>{meuVoto ? 'Você pode trocar o voto até a eleição acabar.' : 'Escolha em quem votar:'}</p>
      )}

      <ul className="painel-grupo-membros">
        {emQuem.map((id) => (
          <li key={id}>
            <span className="painel-grupo-nome">
              {nomeDaFicha(id)}
              <small>
                {nomeDoParticipante(contexto.obterDonoDaFicha(id) ?? '')}
                {/* O mestre acompanha a contagem; os jogadores só veem o resultado. */}
                {mestre && ` · ${votos(contagem[id] ?? 0)}`}
              </small>
            </span>
            <span className="painel-grupo-acoes">
              {eleitor && !empatados && (
                <button
                  type="button"
                  aria-pressed={meuVoto === id}
                  onClick={() => lojaGrupo.despachar({ tipo: 'Votar', fichaId: id })}
                >
                  {meuVoto === id ? '✓ Seu voto' : 'Votar'}
                </button>
              )}
              {mestre && empatados?.includes(id) && (
                <button type="button" onClick={() => lojaGrupo.despachar({ tipo: 'DesempatarEleicao', fichaId: id })}>
                  Escolher
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <p className="painel-eleicao-votantes">
        {quemVota.map((id) => `${nomeDoParticipante(id)} ${id in validos ? '✓' : '…'}`).join(' · ')}
      </p>

      <div className="painel-grupo-linha">
        {mestre && !empatados && (
          <button type="button" title="Conta os votos dados até agora" onClick={() => lojaGrupo.despachar({ tipo: 'EncerrarEleicao' })}>
            Encerrar e contar
          </button>
        )}
        {(mestre || eleicao.pedidaPor === autorId) && (
          <button type="button" onClick={() => lojaGrupo.despachar({ tipo: 'CancelarEleicao' })}>
            Cancelar eleição
          </button>
        )}
      </div>
    </section>
  );
}

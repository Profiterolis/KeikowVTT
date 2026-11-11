import { useState, useSyncExternalStore } from 'react';
import { descansoCurto, descansoLongo, rolarTeste } from '../core/acoesDaFicha';
import { calcularFicha } from '../core/calculoDaFicha';
import type { Participante } from '../core/campanha';
import type { LojaFichas } from '../core/fichas';
import {
  formatarDuracao,
  grupoNumPovoado,
  grupoVistoPor,
  liderPresente,
  membrosPresentes,
  quemConduz,
  type ContextoDoGrupo,
  type LojaGrupo,
  type LugarDoDescanso,
  type TipoDeDescanso,
} from '../core/grupo';
import type { Ficha } from '../core/fichas';
import type { LojaRolagens, RolagemRegistrada } from '../core/rolagens';
import { ehMestre, VISIVEL_A_TODOS } from '../core/visibilidade';
import { corDoMembro } from '../render/camadaGrupo';
import { useRegras } from './contextoRegras';
import { SecaoEleicao } from './SecaoEleicao';
import { SecaoNoite } from './SecaoNoite';
import type { LojaCompendio } from '../core/compendio';
import type { LojaNotificacoes } from '../core/notificacoes';

interface PainelGrupoProps {
  readonly lojaGrupo: LojaGrupo;
  readonly lojaFichas: LojaFichas;
  readonly lojaRolagens: LojaRolagens;
  readonly lojaCompendio: LojaCompendio;
  readonly lojaNotificacoes: LojaNotificacoes;
  readonly contexto: ContextoDoGrupo;
  readonly participantes: readonly Participante[];
  /** Quem está agindo agora: o mestre, o jogador que controla o líder ou outro jogador. */
  readonly autorId: string;
  readonly aoFechar: () => void;
}

const corCss = (id: string) => `#${corDoMembro(id).toString(16).padStart(6, '0')}`;

/**
 * O painel do grupo: quem viaja junto, quem lidera, o ritmo e o teste do grupo.
 * O mestre escolhe os membros, dá visão extra e trava o movimento; quem controla o líder
 * muda o ritmo, passa a liderança e rola pelo grupo; os demais só leem.
 */
export function PainelGrupo({
  lojaGrupo,
  lojaFichas,
  lojaRolagens,
  lojaCompendio,
  lojaNotificacoes,
  contexto,
  participantes,
  autorId,
  aoFechar,
}: PainelGrupoProps) {
  const compendio = useSyncExternalStore(lojaCompendio.assinar, lojaCompendio.obterEstado);
  const grupo = useSyncExternalStore(lojaGrupo.assinar, lojaGrupo.obterEstado);
  const { fichas } = useSyncExternalStore(lojaFichas.assinar, lojaFichas.obterEstado);
  const regras = useRegras();
  const mestre = ehMestre(autorId);
  const condutor = quemConduz(grupo, contexto);
  const conduz = mestre || condutor === autorId;
  const membros = membrosPresentes(grupo, contexto);
  const lider = liderPresente(grupo, contexto);
  const nomeDoParticipante = (id: string) => participantes.find((p) => p.id === id)?.nome ?? 'Participante removido';
  const nomeDaFicha = (id: string) => fichas[id]?.nome.trim() || 'Sem nome';

  const foraDoGrupo = Object.values(fichas).filter((f) => f.tipo !== 'monstro' && !membros.includes(f.id));
  const [novoMembro, setNovoMembro] = useState('');
  const [pericia, setPericia] = useState(regras.pericias.find((p) => p.id === 'sobrevivencia')?.id ?? regras.pericias[0]?.id ?? '');
  const [ultimoTeste, setUltimoTeste] = useState<RolagemRegistrada | null>(null);
  const [erroDoTeste, setErroDoTeste] = useState<string | null>(null);
  const [lugar, setLugar] = useState<LugarDoDescanso>('acampamento');
  const [nomeDoLugar, setNomeDoLugar] = useState('');
  const numPovoado = grupoNumPovoado(grupo, contexto);
  // Fora de um povoado, só o mestre oferece abrigo (um convite numa fazenda isolada, por exemplo).
  const podeAbrigo = mestre || numPovoado;

  const descansar = (descanso: TipoDeDescanso) => {
    lojaGrupo.despachar({ tipo: 'Descansar', descanso, lugar: podeAbrigo ? lugar : 'acampamento', nomeDoLugar });
  };

  const comDescanso = (ficha: Ficha, descanso: TipoDeDescanso) =>
    descanso === 'longo' ? descansoLongo(ficha) : descansoCurto(ficha);

  /** Aplica o descanso pendente na ficha (usos, espaços, PV) e tira a pendência. */
  const aplicarDescanso = (id: string) => {
    const ficha = fichas[id];
    const descanso = grupo.descansosPendentes[id];
    if (!ficha || !descanso) {
      return;
    }
    lojaFichas.despachar({ tipo: 'EditarFicha', ficha: comDescanso(ficha, descanso) });
    lojaGrupo.despachar({ tipo: 'ConcluirDescanso', fichaId: id });
  };

  /** O mestre aplica em todas as fichas de uma vez, num só passo de desfazer das fichas. */
  const aplicarEmTodos = () => {
    const pendentes = membros.filter((id) => grupo.descansosPendentes[id] && fichas[id]);
    lojaFichas.despachar({
      tipo: 'EditarFichas',
      fichas: pendentes.map((id) => comDescanso(fichas[id], grupo.descansosPendentes[id])),
    });
    pendentes.forEach((id) => lojaGrupo.despachar({ tipo: 'ConcluirDescanso', fichaId: id }));
  };
  const algumPendente = membros.some((id) => grupo.descansosPendentes[id]);

  const rolarTesteDoGrupo = () => {
    const ficha = lider ? fichas[lider] : undefined;
    const definicao = regras.pericias.find((p) => p.id === pericia);
    if (!ficha || !definicao) {
      return;
    }
    const feito = rolarTeste(calcularFicha(ficha, regras), definicao.id, `Teste do grupo: ${definicao.nome}`);
    if (!feito.ok) {
      setErroDoTeste(feito.erro);
      return;
    }
    setErroDoTeste(null);
    // O teste do grupo é público: todos acompanham a decisão do líder.
    setUltimoTeste(
      lojaRolagens.registrar({
        autorId,
        fichaId: ficha.id,
        quem: ficha.nome || 'Sem nome',
        rotulo: feito.feita.rotulo,
        formula: feito.feita.formula,
        dados: feito.feita.rolagem.dados,
        total: feito.feita.rolagem.total,
        visibilidade: VISIVEL_A_TODOS,
      }),
    );
  };

  return (
    <aside className="painel-hex painel-grupo" aria-label="Grupo">
      <header>
        <div>
          <h2>Grupo</h2>
          <p className="painel-coordenada">
            {membros.length === 0
              ? 'Ninguém no grupo ainda'
              : `${membros.length} ${membros.length === 1 ? 'membro' : 'membros'}`}
            {lider && ` · conduzido por ${nomeDoParticipante(condutor ?? '')}`}
          </p>
        </div>
        <button type="button" aria-label="Fechar painel" onClick={aoFechar}>
          ✕
        </button>
      </header>

      {!conduz && (
        <p>Quem move o grupo, muda o ritmo e rola pelo grupo é o líder. Combinem o caminho com ele.</p>
      )}

      <section className="painel-grupo-secao">
        <h3>Membros</h3>
        {membros.length === 0 && <p>{mestre ? 'Ponha fichas no grupo abaixo.' : 'O mestre ainda não montou o grupo.'}</p>}
        <ul className="painel-grupo-membros">
          {membros.map((id) => {
            const dono = fichas[id]?.donoId ?? '';
            const extra = grupo.visaoExtra[id] ?? 0;
            return (
              <li key={id}>
                <span className="painel-grupo-cabeca" style={{ background: corCss(id) }} aria-hidden>
                  {(nomeDaFicha(id)[0] ?? '?').toUpperCase()}
                </span>
                <span className="painel-grupo-nome">
                  {id === lider && <span title="Líder">👑 </span>}
                  {nomeDaFicha(id)}
                  <small>{nomeDoParticipante(dono)}</small>
                  {grupo.descansosPendentes[id] && (
                    <span className="painel-grupo-pendente">
                      💤 Descanso {grupo.descansosPendentes[id]} pendente
                      {(mestre || dono === autorId) && (
                        <button
                          type="button"
                          title="Aplica o descanso nesta ficha: usos, espaços de magia e (no longo) PV"
                          onClick={() => aplicarDescanso(id)}
                        >
                          Fazer
                        </button>
                      )}
                    </span>
                  )}
                </span>
                <span className="painel-grupo-acoes">
                  {id !== lider && conduz && (
                    <button
                      type="button"
                      title={mestre ? 'Este membro passa a liderar' : 'Passar a liderança para este membro'}
                      onClick={() => lojaGrupo.despachar({ tipo: 'DefinirLider', fichaId: id })}
                    >
                      Liderar
                    </button>
                  )}
                  {mestre && (
                    <>
                      <label title="Hexes a mais de visão enquanto durar um efeito, como voar. Só o jogador desta ficha vê mais longe.">
                        👁 +
                        <input
                          type="number"
                          min={0}
                          value={extra}
                          onChange={(e) => {
                            const valor = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            lojaGrupo.despachar({ tipo: 'DefinirVisaoExtra', fichaId: id, extra: valor });
                          }}
                        />
                      </label>
                      <button type="button" title="Tirar do grupo" onClick={() => lojaGrupo.despachar({ tipo: 'RemoverMembro', fichaId: id })}>
                        Tirar
                      </button>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {mestre && foraDoGrupo.length > 0 && (
          <div className="painel-grupo-linha">
            <select value={novoMembro} onChange={(e) => setNovoMembro(e.target.value)} aria-label="Ficha para pôr no grupo">
              <option value="">Escolha uma ficha…</option>
              {foraDoGrupo.map((f) => (
                <option key={f.id} value={f.id}>
                  {(f.nome.trim() || 'Sem nome') + ` (${nomeDoParticipante(f.donoId)})`}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={novoMembro === ''}
              onClick={() => {
                lojaGrupo.despachar({ tipo: 'AdicionarMembro', fichaId: novoMembro });
                // O primeiro membro já começa liderando, para o grupo poder andar.
                if (!lider) {
                  lojaGrupo.despachar({ tipo: 'DefinirLider', fichaId: novoMembro });
                }
                setNovoMembro('');
              }}
            >
              Pôr no grupo
            </button>
          </div>
        )}
        {mestre && membros.length > 0 && !lider && <p className="aviso">Sem líder, só o mestre move o grupo.</p>}
      </section>

      <SecaoEleicao
        grupo={grupoVistoPor(grupo, autorId)}
        lojaGrupo={lojaGrupo}
        contexto={contexto}
        autorId={autorId}
        nomeDaFicha={nomeDaFicha}
        nomeDoParticipante={nomeDoParticipante}
      />

      <section className="painel-grupo-secao">
        <h3>Ritmo</h3>
        <div className="ferramentas">
          {regras.viagem.ritmos.map((ritmo) => (
            <button
              key={ritmo.id}
              type="button"
              aria-pressed={grupo.ritmo === ritmo.id}
              disabled={!conduz}
              title={`${ritmo.kmPorHora.toString().replace('.', ',')} km/h${ritmo.nota ? ` · ${ritmo.nota}` : ''}`}
              onClick={() => lojaGrupo.despachar({ tipo: 'DefinirRitmo', ritmo: ritmo.id })}
            >
              {ritmo.nome}
            </button>
          ))}
        </div>
        {regras.viagem.ritmos.find((r) => r.id === grupo.ritmo)?.nota && (
          <p>{regras.viagem.ritmos.find((r) => r.id === grupo.ritmo)?.nota}</p>
        )}
      </section>

      <SecaoNoite
        grupo={grupoVistoPor(grupo, autorId, (id) => fichas[id]?.donoId ?? null)}
        lojaGrupo={lojaGrupo}
        lojaFichas={lojaFichas}
        lojaRolagens={lojaRolagens}
        lojaNotificacoes={lojaNotificacoes}
        compendio={compendio}
        contexto={contexto}
        fichas={fichas}
        autorId={autorId}
      />

      <section className="painel-grupo-secao">
        <h3>Descanso</h3>
        {conduz ? (
          <>
            <div className="ferramentas">
              <button type="button" aria-pressed={lugar === 'acampamento'} onClick={() => setLugar('acampamento')}>
                ⛺ Acampamento
              </button>
              <button
                type="button"
                aria-pressed={lugar === 'abrigo' && podeAbrigo}
                disabled={!podeAbrigo}
                title={podeAbrigo ? 'Quarto alugado, casa, convite para dormir…' : 'Só num povoado; fora dele, o mestre decide se há abrigo.'}
                onClick={() => setLugar('abrigo')}
              >
                🏠 Abrigo
              </button>
            </div>
            {lugar === 'abrigo' && podeAbrigo && (
              <input
                className="painel-grupo-texto"
                value={nomeDoLugar}
                placeholder="Onde? (opcional, ex.: Estalagem do Javali)"
                onChange={(e) => setNomeDoLugar(e.target.value)}
              />
            )}
            <div className="painel-grupo-linha">
              <button
                type="button"
                disabled={membros.length === 0}
                title={`Passa ${formatarDuracao(regras.viagem.horasDeDescansoCurto * 60)}; não zera as horas de viagem do dia.`}
                onClick={() => descansar('curto')}
              >
                Descanso curto
              </button>
              <button
                type="button"
                disabled={membros.length === 0}
                title={`Até a partida seguinte, com ao menos ${formatarDuracao(regras.viagem.horasDeDescanso * 60)}; zera as horas de viagem do dia.`}
                onClick={() => descansar('longo')}
              >
                Descanso longo
              </button>
            </div>
            <div className="painel-grupo-linha">
              <button
                type="button"
                className="painel-noite-comecar"
                disabled={membros.length === 0 || !!grupo.noite || (grupo.noitesBloqueadas && !mestre)}
                title={
                  grupo.noitesBloqueadas
                    ? 'O mestre bloqueou as ações noturnas.'
                    : `A noite em ${regras.noite.turnos} turnos: cada um escolhe o que fazer (descansar, vigiar, furtar, estudar…); no fim, o grupo acorda pela manhã.`
                }
                onClick={() => lojaGrupo.despachar({ tipo: 'ComecarNoite', lugar: podeAbrigo ? lugar : 'acampamento', nomeDoLugar })}
              >
                🌙 Passar a noite
              </button>
            </div>
            {!mestre && !numPovoado && <p>Abrigo (quarto, casa, convite) só num povoado, ou quando o mestre oferecer.</p>}
          </>
        ) : (
          <p>O líder decide quando e onde o grupo descansa.</p>
        )}
        {mestre && algumPendente && (
          <div className="painel-grupo-linha">
            <button type="button" onClick={aplicarEmTodos} title="Aplica os descansos pendentes em todas as fichas do grupo">
              Aplicar descansos em todos
            </button>
          </div>
        )}
      </section>

      {mestre && (
        <section className="painel-grupo-secao">
          <h3>Movimento</h3>
          <button
            type="button"
            className="trava-mapa"
            aria-pressed={grupo.movimentoTravado}
            title="Enquanto travado, o líder não move o grupo; o mestre continua podendo."
            onClick={() => lojaGrupo.despachar({ tipo: 'TravarMovimento', travado: !grupo.movimentoTravado })}
          >
            {grupo.movimentoTravado ? '⛔ Movimento do líder travado' : '🚶 Líder pode mover o grupo'}
          </button>
          <button
            type="button"
            className="trava-mapa"
            aria-pressed={grupo.noitesBloqueadas}
            title="Um acontecimento impede o grupo de passar a noite: ninguém começa a noite nem escolhe ações noturnas (o mestre continua podendo)."
            onClick={() => lojaGrupo.despachar({ tipo: 'BloquearNoite', bloqueado: !grupo.noitesBloqueadas })}
          >
            {grupo.noitesBloqueadas ? '🚫 Ações noturnas bloqueadas' : '🌙 Ações noturnas liberadas'}
          </button>
        </section>
      )}

      <section className="painel-grupo-secao">
        <h3>Teste do grupo</h3>
        {!lider ? (
          <p>O teste do grupo é rolado pelo líder, com a ficha dele.</p>
        ) : (
          <>
            <div className="painel-grupo-linha">
              <select value={pericia} onChange={(e) => setPericia(e.target.value)} aria-label="Perícia do teste" disabled={!conduz}>
                {regras.pericias.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              <button type="button" disabled={!conduz} onClick={rolarTesteDoGrupo} title={`Rola com a ficha de ${nomeDaFicha(lider)}`}>
                Rolar
              </button>
            </div>
            {erroDoTeste && <p className="aviso">{erroDoTeste}</p>}
            {ultimoTeste && (
              <p className="painel-grupo-resultado">
                {ultimoTeste.rotulo}: <strong>{ultimoTeste.total}</strong> ({ultimoTeste.formula})
                {ultimoTeste.natural === 20 && ' · 20 natural!'}
                {ultimoTeste.natural === 1 && ' · 1 natural'}
              </p>
            )}
          </>
        )}
      </section>
    </aside>
  );
}

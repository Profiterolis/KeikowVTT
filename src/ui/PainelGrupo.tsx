import { useState, useSyncExternalStore } from 'react';
import { rolarTeste } from '../core/acoesDaFicha';
import { calcularFicha } from '../core/calculoDaFicha';
import type { Participante } from '../core/campanha';
import type { LojaFichas } from '../core/fichas';
import {
  liderPresente,
  membrosPresentes,
  quemConduz,
  type ContextoDoGrupo,
  type LojaGrupo,
} from '../core/grupo';
import type { LojaRolagens, RolagemRegistrada } from '../core/rolagens';
import { ehMestre, VISIVEL_A_TODOS } from '../core/visibilidade';
import { corDoMembro } from '../render/camadaGrupo';
import { useRegras } from './contextoRegras';

interface PainelGrupoProps {
  readonly lojaGrupo: LojaGrupo;
  readonly lojaFichas: LojaFichas;
  readonly lojaRolagens: LojaRolagens;
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
export function PainelGrupo({ lojaGrupo, lojaFichas, lojaRolagens, contexto, participantes, autorId, aoFechar }: PainelGrupoProps) {
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

import { useState } from 'react';
import { buscarEntradas, type EstadoCompendio } from '../core/compendio';
import type { EntradaDe } from '../core/entradas';
import type { Ficha, LojaFichas } from '../core/fichas';
import {
  membrosPresentes,
  quemJaEscolheu,
  type ContextoDoGrupo,
  type EscolhaNoturna,
  type EstadoGrupo,
  type LojaGrupo,
} from '../core/grupo';
import { chanceDeEncontro, resolverTurno } from '../core/noite';
import type { LojaNotificacoes } from '../core/notificacoes';
import { acoesDoLugar } from '../core/regrasDaNoite';
import type { LojaRolagens } from '../core/rolagens';
import { ehMestre, podeVer } from '../core/visibilidade';
import { useRegras } from './contextoRegras';

interface Props {
  /** O grupo como quem age o vê: um jogador não sabe o que os outros escolheram. */
  readonly grupo: EstadoGrupo;
  readonly lojaGrupo: LojaGrupo;
  readonly lojaFichas: LojaFichas;
  readonly lojaRolagens: LojaRolagens;
  readonly lojaNotificacoes: LojaNotificacoes;
  readonly compendio: EstadoCompendio;
  readonly contexto: ContextoDoGrupo;
  readonly fichas: Readonly<Record<string, Ficha>>;
  readonly autorId: string;
}

const nomeDe = (ficha: Ficha | undefined) => ficha?.nome.trim() || 'Sem nome';

/**
 * A noite no painel do grupo. Cada jogador escolhe, em segredo, o que os personagens dele fazem
 * no turno; o mestre vê tudo, resolve o turno e pode cancelar a noite.
 */
export function SecaoNoite({ grupo, lojaGrupo, lojaFichas, lojaRolagens, lojaNotificacoes, compendio, contexto, fichas, autorId }: Props) {
  const regras = useRegras();
  const noite = grupo.noite;
  const mestre = ehMestre(autorId);
  const [rascunhos, setRascunhos] = useState<Readonly<Record<string, EscolhaNoturna>>>({});
  if (!noite) {
    return null;
  }
  const membros = membrosPresentes(grupo, contexto);
  const meus = membros.filter((id) => mestre || fichas[id]?.donoId === autorId);
  const escolheram = new Set(quemJaEscolheu(grupo, contexto));
  const acoes = acoesDoLugar(regras.noite, noite.lugar);
  const bloqueada = grupo.noitesBloqueadas;
  const magias = (buscarEntradas(compendio, { tipos: ['magia'] }) as EntradaDe<'magia'>[]).filter((m) => podeVer(m.visibilidade, autorId));

  const rascunhoDe = (id: string): EscolhaNoturna => rascunhos[id] ?? noite.escolhas[id] ?? { acaoId: acoes[0]?.id ?? '' };
  const mudar = (id: string, parcial: Partial<EscolhaNoturna>) => setRascunhos({ ...rascunhos, [id]: { ...rascunhoDe(id), ...parcial } });
  const escolher = (id: string) => {
    if (lojaGrupo.despachar({ tipo: 'EscolherNoturna', fichaId: id, escolha: rascunhoDe(id) })) {
      const { [id]: _feito, ...resto } = rascunhos;
      setRascunhos(resto);
    }
  };

  /** O mestre resolve o turno: o grupo guarda o resumo e, se valeu, fichas, rolagens e avisos seguem. */
  const resolver = () => {
    const resultado = resolverTurno({ estado: lojaGrupo.obterEstado(), contexto, regras, fichas, compendio });
    if (!resultado || !lojaGrupo.despachar({ tipo: 'ResolverTurno', resultado: resultado.turno })) {
      return;
    }
    if (resultado.fichas.length > 0) {
      lojaFichas.despachar({ tipo: 'EditarFichas', fichas: resultado.fichas });
    }
    resultado.rolagens.forEach((r) => lojaRolagens.registrar(r));
    resultado.notificacoes.forEach((n) => lojaNotificacoes.notificar(n));
  };

  const textoDaEscolha = (escolha: EscolhaNoturna | undefined): string => {
    if (!escolha) {
      return 'ainda não escolheu';
    }
    if (escolha.acaoId === '?') {
      return 'já escolheu';
    }
    const acao = acoes.find((a) => a.id === escolha.acaoId);
    const extra =
      escolha.alvoId ? ` ${nomeDe(fichas[escolha.alvoId])}` : escolha.pericia ? `: ${regras.pericias.find((p) => p.id === escolha.pericia)?.nome ?? escolha.pericia}` : escolha.magiaId ? `: ${compendio.entradas[escolha.magiaId]?.nome ?? 'magia'}` : escolha.texto ? `: ${escolha.texto}` : '';
    return `${acao?.nome ?? escolha.acaoId}${extra}`;
  };

  const chance = mestre ? chanceDeEncontro(grupo, contexto, regras) : 0;
  return (
    <section className="painel-grupo-secao painel-noite">
      <h3>
        🌙 Noite {noite.lugar === 'abrigo' ? `no abrigo${noite.nomeDoLugar ? ` "${noite.nomeDoLugar}"` : ''}` : 'no acampamento'} · turno {noite.turno} de{' '}
        {regras.noite.turnos}
      </h3>
      {bloqueada && <p className="aviso">🚫 O mestre bloqueou as ações noturnas.</p>}
      <p className="painel-coordenada">
        {membros.map((id) => `${nomeDe(fichas[id])} ${escolheram.has(id) ? '✓' : '…'}`).join(' · ')}
      </p>

      {meus.map((id) => {
        const rascunho = rascunhoDe(id);
        const acao = acoes.find((a) => a.id === rascunho.acaoId);
        const pilhas = fichas[id]?.itens ?? [];
        return (
          <div key={id} className="painel-noite-membro">
            <strong>{nomeDe(fichas[id])}</strong> <small>({textoDaEscolha(noite.escolhas[id])})</small>
            <div className="painel-grupo-linha">
              <select
                aria-label={`Ação de ${nomeDe(fichas[id])}`}
                value={rascunho.acaoId}
                disabled={bloqueada && !mestre}
                onChange={(e) => mudar(id, { acaoId: e.target.value, alvoId: undefined, pericia: undefined, texto: undefined, magiaId: undefined, fontePilhaId: undefined })}
              >
                {acoes.map((a) => (
                  <option key={a.id} value={a.id} title={a.descricao}>
                    {a.nome}
                  </option>
                ))}
              </select>
              {acao?.tipo === 'furto' && (
                <select aria-label="Quem furtar" value={rascunho.alvoId ?? ''} onChange={(e) => mudar(id, { alvoId: e.target.value || undefined })}>
                  <option value="">Quem?</option>
                  {membros
                    .filter((m) => m !== id)
                    .map((m) => (
                      <option key={m} value={m}>
                        {nomeDe(fichas[m])}
                      </option>
                    ))}
                </select>
              )}
              {acao?.tipo === 'pericia' && (
                <select aria-label="Perícia" value={rascunho.pericia ?? ''} onChange={(e) => mudar(id, { pericia: e.target.value || undefined })}>
                  <option value="">Qual perícia?</option>
                  {regras.pericias.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {acao?.tipo === 'estudo' && (
              <div className="painel-grupo-linha">
                <select
                  aria-label="Magia para estudar"
                  value={rascunho.magiaId ?? ''}
                  onChange={(e) => mudar(id, { magiaId: e.target.value || undefined, texto: undefined })}
                >
                  <option value="">Um idioma (escreva ao lado)</option>
                  {magias.map((m) => (
                    <option key={m.id} value={m.id}>
                      Magia: {m.nome}
                    </option>
                  ))}
                </select>
                {rascunho.magiaId ? (
                  <select aria-label="Livro ou pergaminho" value={rascunho.fontePilhaId ?? ''} onChange={(e) => mudar(id, { fontePilhaId: e.target.value || undefined })}>
                    <option value="">De qual livro ou pergaminho?</option>
                    {pilhas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {fichas[id]?.entradas[p.entradaId]?.nome ?? 'Item'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input className="painel-grupo-texto" placeholder="Qual idioma?" value={rascunho.texto ?? ''} onChange={(e) => mudar(id, { texto: e.target.value })} />
                )}
              </div>
            )}
            {acao?.tipo === 'livre' && (
              <input className="painel-grupo-texto" placeholder="O que o personagem faz?" value={rascunho.texto ?? ''} onChange={(e) => mudar(id, { texto: e.target.value })} />
            )}
            {acao?.descricao && <p className="tela-dica">{acao.descricao}</p>}
            <button type="button" disabled={bloqueada && !mestre} onClick={() => escolher(id)}>
              {noite.escolhas[id] ? 'Trocar a escolha' : 'Escolher'}
            </button>
          </div>
        );
      })}
      {meus.length === 0 && <p>Você não tem personagens no grupo: só acompanha.</p>}

      {mestre && (
        <>
          <p className="tela-dica">
            Quem não escolher descansa. Chance de encontro neste turno: {chance}%.
          </p>
          <div className="painel-grupo-linha">
            <button type="button" className={escolheram.size >= membros.length ? 'painel-noite-pronto' : undefined} onClick={resolver}>
              Resolver o turno {noite.turno}
            </button>
            <button type="button" onClick={() => lojaGrupo.despachar({ tipo: 'CancelarNoite' })} title="Encerra a noite sem passar o tempo nem dar descanso">
              Cancelar a noite
            </button>
          </div>
          {noite.turnos.map((t) => (
            <details key={t.turno}>
              <summary>Turno {t.turno}</summary>
              <ul className="painel-noite-resumo">
                {t.linhas.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
            </details>
          ))}
        </>
      )}
    </section>
  );
}

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { naoLidas, notificacoesVisiveis, type LojaNotificacoes, type Notificacao } from '../core/notificacoes';

interface Props {
  readonly loja: LojaNotificacoes;
  /** Quem está agindo: vê só as notificações dele (o mestre vê todas). */
  readonly participanteId: string;
}

const DURACAO_DO_AVISO = 7000;

/**
 * As notificações na tela: cada aviso novo aparece num canto e some sozinho; o 🔔 guarda
 * as últimas, com as não lidas contadas. Fica por cima de todas as telas.
 */
export function Notificacoes({ loja, participanteId }: Props) {
  const estado = useSyncExternalStore(loja.assinar, loja.obterEstado);
  const visiveis = notificacoesVisiveis(estado, participanteId);
  const pendentes = naoLidas(estado, participanteId);
  const [aberto, setAberto] = useState(false);
  const [avisos, setAvisos] = useState<readonly Notificacao[]>([]);
  // As notificações que já existiam (ou eram de outro participante) não viram aviso ao trocar quem age.
  const vistas = useRef(new Set(visiveis.map((n) => n.id)));

  useEffect(() => {
    vistas.current = new Set(notificacoesVisiveis(loja.obterEstado(), participanteId).map((n) => n.id));
    setAvisos([]);
  }, [loja, participanteId]);

  useEffect(() => {
    const novas = visiveis.filter((n) => !vistas.current.has(n.id));
    if (novas.length === 0) {
      return;
    }
    novas.forEach((n) => vistas.current.add(n.id));
    setAvisos((atuais) => [...novas.reverse(), ...atuais].slice(0, 4));
    const ids = new Set(novas.map((n) => n.id));
    const relogio = setTimeout(() => setAvisos((atuais) => atuais.filter((n) => !ids.has(n.id))), DURACAO_DO_AVISO);
    return () => clearTimeout(relogio);
  }, [visiveis]);

  // Com a lista aberta, tudo o que aparece já está lido.
  useEffect(() => {
    if (aberto) {
      loja.marcarLidas(participanteId);
    }
  }, [aberto, pendentes, loja, participanteId]);

  return (
    <div className="notificacoes">
      {avisos.length > 0 && (
        <ul className="notificacoes-avisos" aria-live="polite">
          {avisos.map((n) => (
            <li key={n.id}>
              <span aria-hidden>{n.icone}</span> {n.texto}
              <button type="button" aria-label="Fechar aviso" onClick={() => setAvisos((a) => a.filter((x) => x.id !== n.id))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      {aberto && (
        <div className="notificacoes-lista" role="dialog" aria-label="Notificações">
          <h3>Notificações</h3>
          {visiveis.length === 0 ? (
            <p className="tela-dica">Nada por aqui ainda.</p>
          ) : (
            <ul>
              {visiveis.map((n) => (
                <li key={n.id}>
                  <span aria-hidden>{n.icone}</span>
                  <span>
                    {n.texto}
                    <small>{new Date(n.momento).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <button
        type="button"
        className="notificacoes-sino"
        aria-pressed={aberto}
        title="Notificações"
        aria-label={pendentes > 0 ? `Notificações: ${pendentes} ${pendentes === 1 ? 'não lida' : 'não lidas'}` : 'Notificações'}
        onClick={() => setAberto(!aberto)}
      >
        🔔{pendentes > 0 && <span className="notificacoes-contagem">{pendentes}</span>}
      </button>
    </div>
  );
}

import { useState } from 'react';
import { formatarDuracao, formatarRelogio, MINUTOS_POR_DIA, type EstadoGrupo, type LojaGrupo } from '../core/grupo';
import type { RegrasDeViagem } from '../core/viagem';
import { ritmoDe } from '../core/viagem';

interface BarraDoGrupoProps {
  readonly grupo: EstadoGrupo;
  readonly lojaGrupo: LojaGrupo;
  readonly viagem: RegrasDeViagem;
  /** O mestre ganha os botões de avançar o tempo e de desfazer. */
  readonly mestre: boolean;
  readonly painelAberto: boolean;
  readonly aoAlternarPainel: () => void;
}

/** Avanços rápidos de tempo do mestre, em minutos. */
const AVANCOS: readonly [string, number][] = [
  ['+10 min', 10],
  ['+1 h', 60],
  ['+4 h', 240],
];

/**
 * A barra do grupo, no topo do mapa, para todos: o relógio, as horas viajadas hoje e o ritmo,
 * como a barra de um CRPG. O mestre avança o tempo dali mesmo.
 */
export function BarraDoGrupo({ grupo, lojaGrupo, viagem, mestre, painelAberto, aoAlternarPainel }: BarraDoGrupoProps) {
  const [acertando, setAcertando] = useState(false);
  const limite = viagem.horasPorDia * 60;
  const forcada = grupo.viajadoHoje > limite;
  const proporcao = Math.min(1, grupo.viajadoHoje / limite);
  const ritmo = ritmoDe(viagem, grupo.ritmo);

  return (
    <div className="barra-grupo" role="region" aria-label="Grupo e tempo">
      <div className="barra-grupo-linha">
        <strong className="barra-grupo-relogio" title="Hora do mundo">
          🕒 {formatarRelogio(grupo.relogio)}
        </strong>
        <div
          className={forcada ? 'barra-grupo-dia forcada' : 'barra-grupo-dia'}
          title={`Viajado hoje: ${formatarDuracao(grupo.viajadoHoje)} de ${formatarDuracao(limite)}. Zera ao descansar ou ao avançar até a manhã.`}
        >
          <div className="barra-grupo-dia-cheio" style={{ width: `${proporcao * 100}%` }} />
          <span>
            {formatarDuracao(grupo.viajadoHoje)} / {formatarDuracao(limite)}
            {forcada && ' · marcha forçada'}
          </span>
        </div>
        <span className="barra-grupo-ritmo" title={ritmo.nota || undefined}>
          Ritmo {ritmo.nome.toLowerCase()}
        </span>
        {grupo.movimentoTravado && (
          <span className="barra-grupo-trava" title="O mestre travou o movimento do líder.">
            ⛔ Travado
          </span>
        )}
        <button type="button" aria-pressed={painelAberto} onClick={aoAlternarPainel}>
          Grupo
        </button>
      </div>
      {mestre && (
        <div className="barra-grupo-linha barra-grupo-mestre">
          {AVANCOS.map(([rotulo, minutos]) => (
            <button key={rotulo} type="button" onClick={() => lojaGrupo.despachar({ tipo: 'AvancarTempo', minutos })}>
              {rotulo}
            </button>
          ))}
          <button
            type="button"
            title="Até a próxima hora da partida, sem descansar. Zera as horas viajadas no dia."
            onClick={() => lojaGrupo.despachar({ tipo: 'AvancarAteAManha' })}
          >
            Até a manhã
          </button>
          <button type="button" aria-pressed={acertando} onClick={() => setAcertando(!acertando)}>
            Acertar…
          </button>
          <button
            type="button"
            disabled={grupo.historico.length === 0}
            title="Desfaz o último acontecimento da viagem (passo, descanso, tempo), com a posição e o relógio."
            onClick={() => lojaGrupo.despachar({ tipo: 'DesfazerViagem' })}
          >
            Desfazer
          </button>
        </div>
      )}
      {mestre && acertando && (
        <AcertarRelogio
          relogio={grupo.relogio}
          aoAcertar={(relogio) => {
            lojaGrupo.despachar({ tipo: 'AcertarRelogio', relogio });
            setAcertando(false);
          }}
        />
      )}
    </div>
  );
}

/** Escolher dia e hora do mundo, por exemplo ao começar uma campanha ou pular semanas. */
function AcertarRelogio({ relogio, aoAcertar }: { readonly relogio: number; readonly aoAcertar: (relogio: number) => void }) {
  const diaAtual = Math.floor(relogio / MINUTOS_POR_DIA) + 1;
  const minutoDoDia = relogio - (diaAtual - 1) * MINUTOS_POR_DIA;
  const duasCasas = (n: number) => String(n).padStart(2, '0');
  const [dia, setDia] = useState(String(diaAtual));
  const [hora, setHora] = useState(`${duasCasas(Math.floor(minutoDoDia / 60))}:${duasCasas(minutoDoDia % 60)}`);
  const diaNumero = Number(dia);
  const [h, m] = hora.split(':').map(Number);
  const valido = Number.isInteger(diaNumero) && diaNumero >= 1 && Number.isFinite(h) && Number.isFinite(m);

  return (
    <form
      className="barra-grupo-linha barra-grupo-acertar"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (valido) {
          aoAcertar((diaNumero - 1) * MINUTOS_POR_DIA + h * 60 + m);
        }
      }}
    >
      <label>
        Dia <input type="number" min={1} value={dia} onChange={(e) => setDia(e.target.value)} />
      </label>
      <label>
        Hora <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
      </label>
      <button type="submit" disabled={!valido}>
        Acertar o relógio
      </button>
    </form>
  );
}

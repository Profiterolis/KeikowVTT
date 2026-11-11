import { formatarDuracao, type PassoPossivel } from '../core/grupo';
import { numeroNaTela } from './numeros';

/**
 * A conta de um passo do grupo, mostrada enquanto o mouse está sobre um vizinho:
 * de onde vêm as horas, o que acelera e o que atrasa. Ou o motivo de não dar para ir.
 */
export function ExplicacaoDoPasso({ passo }: { readonly passo: PassoPossivel }) {
  if (!passo.ok) {
    return (
      <div className="explicacao-passo bloqueado" role="status">
        <strong>Não dá para ir</strong>
        <span>{passo.motivo}</span>
      </div>
    );
  }
  return (
    <div className={passo.marchaForcada ? 'explicacao-passo marcha' : 'explicacao-passo'} role="status">
      <strong>{formatarDuracao(passo.minutos)}</strong>
      {passo.partes.map((parte) => (
        <span key={parte.texto}>
          {parte.tipo === 'base'
            ? `${parte.texto} = ${formatarDuracao(parte.valor * 60)}`
            : parte.tipo === 'velocidade'
              ? `${parte.texto}: velocidade ×${numeroNaTela(parte.valor)}`
              : `${parte.texto}: tempo ×${numeroNaTela(parte.valor)}`}
        </span>
      ))}
      {passo.marchaForcada && <span className="aviso">Marcha forçada: passa das horas de viagem de hoje.</span>}
    </div>
  );
}

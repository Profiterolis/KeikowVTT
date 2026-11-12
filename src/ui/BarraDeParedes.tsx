import { ESTADOS_DA_PORTA, normalizarParede, type Parede, type TipoDeParede } from '../core/paredes';
import type { ModoParedes } from '../render/camadaParedes';

const ROTULO_TIPO: Readonly<Record<TipoDeParede, string>> = { parede: 'Parede', porta: 'Porta', janela: 'Janela' };
const ROTULO_ESTADO: Readonly<Record<Parede['estado'], string>> = { aberta: 'Aberta', fechada: 'Fechada', trancada: 'Trancada' };

/** As ferramentas de desenho, na ordem da barra. */
const FERRAMENTAS: readonly { readonly rotulo: string; readonly modo: Exclude<ModoParedes, null> }[] = [
  { rotulo: '👆 Selecionar', modo: { tipo: 'selecionar' } },
  { rotulo: '🧱 Parede', modo: { tipo: 'desenhar', tipoDeParede: 'parede', secreta: false } },
  { rotulo: '🚪 Porta', modo: { tipo: 'desenhar', tipoDeParede: 'porta', secreta: false } },
  { rotulo: '❔ Porta secreta', modo: { tipo: 'desenhar', tipoDeParede: 'porta', secreta: true } },
  { rotulo: '🪟 Janela', modo: { tipo: 'desenhar', tipoDeParede: 'janela', secreta: false } },
];

/**
 * A segunda linha da barra da instância enquanto o mestre edita as paredes: a ferramenta e,
 * com uma parede marcada, o tipo, o estado da porta e o apagar.
 */
export function BarraDeParedes({
  modo,
  aoMudarModo,
  selecionada,
  aoEditar,
  aoApagar,
}: {
  readonly modo: Exclude<ModoParedes, null>;
  readonly aoMudarModo: (modo: Exclude<ModoParedes, null>) => void;
  readonly selecionada: Parede | null;
  readonly aoEditar: (parede: Parede) => void;
  readonly aoApagar: () => void;
}) {
  const igual = (m: Exclude<ModoParedes, null>) => JSON.stringify(m) === JSON.stringify(modo);
  return (
    <div className="barra-paredes">
      <div className="barra-grupo-linha" role="group" aria-label="Ferramenta de paredes">
        {FERRAMENTAS.map((f) => (
          <button key={f.rotulo} type="button" aria-pressed={igual(f.modo)} onClick={() => aoMudarModo(f.modo)}>
            {f.rotulo}
          </button>
        ))}
      </div>
      {modo.tipo === 'desenhar' ? (
        <p className="tela-dica">
          Clique ponto a ponto; botão direito, duplo clique ou Esc termina a linha. Perto de uma ponta, o ponto gruda nela;
          com Shift, a linha fica reta (0°, 45°, 90°).
        </p>
      ) : selecionada ? (
        <div className="barra-grupo-linha">
          <label>
            Tipo{' '}
            <select
              value={selecionada.tipo === 'porta' && selecionada.secreta ? 'secreta' : selecionada.tipo}
              onChange={(e) => {
                const valor = e.target.value;
                const tipo: TipoDeParede = valor === 'secreta' ? 'porta' : (valor as TipoDeParede);
                aoEditar(normalizarParede({ ...selecionada, tipo, secreta: valor === 'secreta' }));
              }}
            >
              {(['parede', 'porta', 'janela'] as const).map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TIPO[t]}
                </option>
              ))}
              <option value="secreta">Porta secreta</option>
            </select>
          </label>
          {selecionada.tipo === 'porta' && (
            <label>
              Porta{' '}
              <select value={selecionada.estado} onChange={(e) => aoEditar({ ...selecionada, estado: e.target.value as Parede['estado'] })}>
                {ESTADOS_DA_PORTA.map((estado) => (
                  <option key={estado} value={estado}>
                    {ROTULO_ESTADO[estado]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" onClick={aoApagar} title="Delete">
            Apagar
          </button>
        </div>
      ) : (
        <p className="tela-dica">Clique numa parede para marcar; arraste uma ponta para mudar a parede (as ligadas a ela vão junto).</p>
      )}
    </div>
  );
}

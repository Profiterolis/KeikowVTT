import { useState } from 'react';
import type { MudancasNaInstancia, Instancia } from '../core/instancias';
import {
  LUZES_DO_AMBIENTE,
  MODOS_DE_VISAO,
  RAIO_MAXIMO_DA_LUZ,
  ROTULO_DA_LUZ_DO_AMBIENTE,
  ROTULO_DO_MODO_DE_VISAO,
  type FonteDeLuz,
  type LuzDoAmbiente,
  type ModoDeVisao,
} from '../core/luz';
import { numeroNaTela } from './numeros';

/** 0xffb35c → "#ffb35c", para o campo de cor do navegador. */
export function corEmTexto(cor: number): string {
  return `#${cor.toString(16).padStart(6, '0')}`;
}

/** "#ffb35c" → 0xffb35c; um texto estranho vira branco. */
export function textoEmCor(texto: string): number {
  const valor = Number.parseInt(texto.replace('#', ''), 16);
  return Number.isInteger(valor) && valor >= 0 && valor <= 0xffffff ? valor : 0xffffff;
}

/** Os campos de uma luz (raios, cor, tremular), como textos enquanto se digita. */
export function CampoDaLuz({
  clara,
  penumbra,
  cor,
  tremular,
  aoMudar,
}: {
  readonly clara: string;
  readonly penumbra: string;
  readonly cor: string;
  readonly tremular: boolean;
  readonly aoMudar: (mudancas: { clara?: string; penumbra?: string; cor?: string; tremular?: boolean }) => void;
}) {
  return (
    <div className="barra-grupo-linha campo-da-luz">
      <label>
        Luz clara{' '}
        <input type="text" inputMode="decimal" size={4} value={clara} onChange={(e) => aoMudar({ clara: e.target.value })} /> m
      </label>
      <label>
        e penumbra por mais{' '}
        <input type="text" inputMode="decimal" size={4} value={penumbra} onChange={(e) => aoMudar({ penumbra: e.target.value })} /> m
      </label>
      <label>
        Cor <input type="color" value={cor} onChange={(e) => aoMudar({ cor: e.target.value })} />
      </label>
      <label className="campo-marcar">
        <input type="checkbox" checked={tremular} onChange={(e) => aoMudar({ tremular: e.target.checked })} />
        Tremula (chama)
      </label>
    </div>
  );
}

/** Um raio em metros que só vale ao sair do campo ou com Enter, para não encher o desfazer. */
function CampoMetros({ rotulo, valor, aoConfirmar }: { readonly rotulo: string; readonly valor: number; readonly aoConfirmar: (v: number) => void }) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const confirmar = () => {
    if (rascunho !== null) {
      const lido = Number(rascunho.trim().replace(',', '.'));
      if (Number.isFinite(lido) && lido >= 0 && lido <= RAIO_MAXIMO_DA_LUZ) {
        aoConfirmar(lido);
      }
      setRascunho(null);
    }
  };
  return (
    <label>
      {rotulo}{' '}
      <input
        type="text"
        inputMode="decimal"
        size={4}
        value={rascunho ?? numeroNaTela(valor)}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => e.key === 'Enter' && confirmar()}
      />{' '}
      m
    </label>
  );
}

/**
 * A segunda linha da barra da instância enquanto o mestre mexe na luz: a luz do ambiente, o que
 * os jogadores veem fora da visão, e a luz marcada no mapa.
 */
export function BarraDeLuzes({
  instancia,
  aoEditarInstancia,
  selecionada,
  aoEditarLuz,
  aoApagarLuz,
  aoEsquecer,
}: {
  readonly instancia: Instancia;
  readonly aoEditarInstancia: (mudancas: MudancasNaInstancia) => void;
  readonly selecionada: FonteDeLuz | null;
  readonly aoEditarLuz: (luz: FonteDeLuz) => void;
  readonly aoApagarLuz: () => void;
  readonly aoEsquecer: () => void;
}) {
  return (
    <div className="barra-paredes">
      <div className="barra-grupo-linha">
        <label>
          Luz do ambiente{' '}
          <select
            value={instancia.luzAmbiente}
            onChange={(e) => aoEditarInstancia({ luzAmbiente: e.target.value as LuzDoAmbiente })}
          >
            {LUZES_DO_AMBIENTE.map((l) => (
              <option key={l} value={l}>
                {ROTULO_DA_LUZ_DO_AMBIENTE[l]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Visão dos jogadores{' '}
          <select value={instancia.visao} onChange={(e) => aoEditarInstancia({ visao: e.target.value as ModoDeVisao })}>
            {MODOS_DE_VISAO.map((m) => (
              <option key={m} value={m}>
                {ROTULO_DO_MODO_DE_VISAO[m]}
              </option>
            ))}
          </select>
        </label>
        {instancia.visao === 'masmorra' && (
          <button type="button" onClick={aoEsquecer} title="Os jogadores esquecem o que já viram nesta instância (não se desfaz)">
            Esquecer o explorado
          </button>
        )}
      </div>
      {selecionada ? (
        <div className="barra-grupo-linha">
          <CampoMetros rotulo="Luz clara" valor={selecionada.clara} aoConfirmar={(clara) => aoEditarLuz({ ...selecionada, clara })} />
          <CampoMetros
            rotulo="e penumbra por mais"
            valor={selecionada.penumbra}
            aoConfirmar={(penumbra) => aoEditarLuz({ ...selecionada, penumbra })}
          />
          <label>
            Cor{' '}
            <input
              type="color"
              value={corEmTexto(selecionada.cor)}
              onChange={(e) => aoEditarLuz({ ...selecionada, cor: textoEmCor(e.target.value) })}
            />
          </label>
          <label className="campo-marcar">
            <input type="checkbox" checked={selecionada.tremular} onChange={(e) => aoEditarLuz({ ...selecionada, tremular: e.target.checked })} />
            Tremula
          </label>
          <button type="button" aria-pressed={selecionada.ligada} onClick={() => aoEditarLuz({ ...selecionada, ligada: !selecionada.ligada })}>
            {selecionada.ligada ? '💡 Acesa' : '⚫ Apagada'}
          </button>
          <button type="button" onClick={aoApagarLuz} title="Delete">
            🗑️ Tirar a luz
          </button>
        </div>
      ) : (
        <p className="tela-dica">
          Clique no mapa para pôr uma luz (um braseiro: 6 m de luz clara e mais 6 m de penumbra). Clique numa luz para
          marcá-la; arraste para mover; botão direito acende e apaga.
        </p>
      )}
    </div>
  );
}

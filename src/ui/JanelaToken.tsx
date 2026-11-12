import { useState } from 'react';
import type { Ficha } from '../core/fichas';
import { METROS_POR_TAMANHO, TAMANHO_MAXIMO, TAMANHO_MINIMO, tamanhoDaFicha, type MudancasNoToken, type TokenNaInstancia } from '../core/tokens';
import { numeroNaTela } from './numeros';
import { COR_DE_CHAMA, RAIO_MAXIMO_DA_LUZ, type PropriedadesDaLuz } from '../core/luz';
import { CampoDaLuz, corEmTexto, textoEmCor } from './BarraDeLuzes';
import { ROTULO_TAMANHO } from './rotulosCompendio';

/**
 * O mestre muda o nome que os jogadores veem no mapa, o tamanho do token e a luz que ele espalha
 * (a da ficha, como uma tocha equipada, uma luz própria, como a magia Light, ou nenhuma).
 * Nada muda até "Salvar".
 */
export function JanelaToken({
  token,
  ficha,
  luzDaFicha,
  aoSalvar,
  aoFechar,
}: {
  readonly token: TokenNaInstancia;
  readonly ficha: Ficha | undefined;
  /** A luz que a ficha dá (uma tocha equipada), ou `null`. */
  readonly luzDaFicha: PropriedadesDaLuz | null;
  readonly aoSalvar: (mudancas: MudancasNoToken) => void;
  readonly aoFechar: () => void;
}) {
  const semLuz = token.luz !== undefined && token.luz.clara + token.luz.penumbra === 0;
  const [tipoDeLuz, setTipoDeLuz] = useState<'ficha' | 'propria' | 'nenhuma'>(token.luz ? (semLuz ? 'nenhuma' : 'propria') : 'ficha');
  const [clara, setClara] = useState(numeroNaTela(token.luz && !semLuz ? token.luz.clara : 6));
  const [penumbra, setPenumbra] = useState(numeroNaTela(token.luz && !semLuz ? token.luz.penumbra : 6));
  const [cor, setCor] = useState(corEmTexto(token.luz?.cor ?? 0xfff2cc));
  const [tremular, setTremular] = useState(token.luz?.tremular ?? false);
  const numero = (texto: string) => Number(texto.replace(',', '.'));
  const raioValido = (texto: string) => Number.isFinite(numero(texto)) && numero(texto) >= 0 && numero(texto) <= RAIO_MAXIMO_DA_LUZ;
  const luzValida = tipoDeLuz !== 'propria' || (raioValido(clara) && raioValido(penumbra));
  const luzEscolhida = (): PropriedadesDaLuz | null =>
    tipoDeLuz === 'ficha'
      ? null
      : tipoDeLuz === 'nenhuma'
        ? { clara: 0, penumbra: 0, cor: COR_DE_CHAMA, tremular: false }
        : { clara: numero(clara), penumbra: numero(penumbra), cor: textoEmCor(cor), tremular };
  const [nome, setNome] = useState(token.nomeNoMapa);
  const [automatico, setAutomatico] = useState(token.tamanho === null);
  const tamanhoCriatura = ficha ? tamanhoDaFicha(ficha) : 'medio';
  const [metros, setMetros] = useState(String(token.tamanho ?? METROS_POR_TAMANHO[tamanhoCriatura]).replace('.', ','));
  const valor = Number(metros.replace(',', '.'));
  const valido = automatico || (Number.isFinite(valor) && valor >= TAMANHO_MINIMO && valor <= TAMANHO_MAXIMO);

  return (
    <div className="janela-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <form
        className="janela janela-token"
        role="dialog"
        aria-label="Nome no mapa, tamanho e luz"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (valido && luzValida) {
            aoSalvar({ nomeNoMapa: nome.trim(), tamanho: automatico ? null : valor, luz: luzEscolhida() });
          }
        }}
        onKeyDown={(evento) => evento.key === 'Escape' && aoFechar()}
      >
        <h2>{ficha?.nome.trim() || 'Token'}</h2>
        <label className="painel-campo">
          Nome no mapa (o que os jogadores veem)
          <input
            type="text"
            autoFocus
            value={nome}
            placeholder={ficha?.nome.trim() || 'O nome da ficha'}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>
        <p className="tela-dica">Vazio mostra o nome da ficha.</p>
        <fieldset className="janela-token-tamanho">
          <legend>Tamanho</legend>
          <label className="campo-marcar">
            <input type="radio" checked={automatico} onChange={() => setAutomatico(true)} />
            Pelo tamanho da criatura ({ROTULO_TAMANHO[tamanhoCriatura]}, {numeroNaTela(METROS_POR_TAMANHO[tamanhoCriatura])} m)
          </label>
          <label className="campo-marcar">
            <input type="radio" checked={!automatico} onChange={() => setAutomatico(false)} />
            Outro:
            <input
              type="text"
              inputMode="decimal"
              size={5}
              disabled={automatico}
              aria-invalid={!valido}
              value={metros}
              onChange={(e) => setMetros(e.target.value)}
            />
            m de diâmetro
          </label>
        </fieldset>
        {!valido && (
          <p className="aviso-campo">
            Use um número entre {numeroNaTela(TAMANHO_MINIMO)} e {numeroNaTela(TAMANHO_MAXIMO)} m.
          </p>
        )}
        <fieldset className="janela-token-tamanho">
          <legend>Luz</legend>
          <label className="campo-marcar">
            <input type="radio" checked={tipoDeLuz === 'ficha'} onChange={() => setTipoDeLuz('ficha')} />
            Pela ficha (
            {luzDaFicha
              ? `${numeroNaTela(luzDaFicha.clara)} m de luz clara e mais ${numeroNaTela(luzDaFicha.penumbra)} m de penumbra`
              : 'nenhuma agora: uma tocha ou lanterna equipada acende'}
            )
          </label>
          <label className="campo-marcar">
            <input type="radio" checked={tipoDeLuz === 'propria'} onChange={() => setTipoDeLuz('propria')} />
            Própria (a magia Light, um brilho mágico)
          </label>
          {tipoDeLuz === 'propria' && (
            <CampoDaLuz
              clara={clara}
              penumbra={penumbra}
              cor={cor}
              tremular={tremular}
              aoMudar={(m) => {
                if (m.clara !== undefined) setClara(m.clara);
                if (m.penumbra !== undefined) setPenumbra(m.penumbra);
                if (m.cor !== undefined) setCor(m.cor);
                if (m.tremular !== undefined) setTremular(m.tremular);
              }}
            />
          )}
          <label className="campo-marcar">
            <input type="radio" checked={tipoDeLuz === 'nenhuma'} onChange={() => setTipoDeLuz('nenhuma')} />
            Nenhuma, mesmo com uma tocha na ficha
          </label>
        </fieldset>
        {!luzValida && <p className="aviso-campo">Os raios precisam ficar entre 0 e {numeroNaTela(RAIO_MAXIMO_DA_LUZ)} m.</p>}
        <div className="janela-botoes">
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" disabled={!valido || !luzValida}>
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

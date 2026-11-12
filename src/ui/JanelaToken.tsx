import { useState } from 'react';
import type { Ficha } from '../core/fichas';
import { METROS_POR_TAMANHO, TAMANHO_MAXIMO, TAMANHO_MINIMO, tamanhoDaFicha, type MudancasNoToken, type TokenNaInstancia } from '../core/tokens';
import { numeroNaTela } from './numeros';
import { ROTULO_TAMANHO } from './rotulosCompendio';

/**
 * O mestre muda o nome que os jogadores veem no mapa e o tamanho do token.
 * Nada muda até "Salvar".
 */
export function JanelaToken({
  token,
  ficha,
  aoSalvar,
  aoFechar,
}: {
  readonly token: TokenNaInstancia;
  readonly ficha: Ficha | undefined;
  readonly aoSalvar: (mudancas: MudancasNoToken) => void;
  readonly aoFechar: () => void;
}) {
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
        aria-label="Nome no mapa e tamanho"
        onSubmit={(evento) => {
          evento.preventDefault();
          if (valido) {
            aoSalvar({ nomeNoMapa: nome.trim(), tamanho: automatico ? null : valor });
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
        <div className="janela-botoes">
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" disabled={!valido}>
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}

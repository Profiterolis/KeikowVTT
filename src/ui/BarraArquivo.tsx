import { useRef, type ChangeEvent } from 'react';
import type { LojaGrupo } from '../core/grupo';
import type { LojaMapa } from '../core/loja';
import { criarMapaVazio, type EstadoMapa } from '../core/mapa';
import { desserializarMapa } from '../core/persistencia';
import { lerCampanhaDoArquivo, serializarArquivoCompleto } from '../core/persistenciaCampanha';
import type { LojaRegistro } from '../core/registro';
import type { LojaCampanha } from '../core/campanha';
import type { LojaCompendio } from '../core/compendio';
import { lerCompendioDoArquivo } from '../core/persistenciaCompendio';
import type { LojaFichas } from '../core/fichas';
import { lerFichasDoArquivo } from '../core/persistenciaFichas';
import type { LojaRegras } from '../core/regrasDaCampanha';

export interface Mensagem {
  readonly tipo: 'info' | 'aviso' | 'erro';
  readonly texto: string;
}

interface BarraArquivoProps {
  readonly loja: LojaMapa;
  readonly lojaGrupo: LojaGrupo;
  readonly lojaCampanha: LojaCampanha;
  readonly lojaRegistro: LojaRegistro;
  readonly lojaCompendio: LojaCompendio;
  readonly lojaFichas: LojaFichas;
  readonly lojaRegras: LojaRegras;
  readonly aoAbrirMapa: (estado: EstadoMapa) => void;
  readonly aoMensagem: (mensagem: Mensagem) => void;
}

function nomeDoArquivo(): string {
  const agora = new Date();
  // toISOString usa o horário universal; o ajuste faz o nome mostrar o horário local.
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000);
  const momento = local.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `mapa-keikow-${momento}.json`;
}

function baixarTexto(texto: string, nome: string): void {
  const endereco = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = endereco;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(endereco);
}

export function BarraArquivo({
  loja,
  lojaGrupo,
  lojaCampanha,
  lojaRegistro,
  lojaCompendio,
  lojaFichas,
  lojaRegras,
  aoAbrirMapa,
  aoMensagem,
}: BarraArquivoProps) {
  const seletorRef = useRef<HTMLInputElement>(null);

  const novoMapa = () => {
    loja.despachar({ tipo: 'CarregarMapa', estado: criarMapaVazio() });
    lojaGrupo.despachar({ tipo: 'PosicionarGrupo', coord: null });
    aoMensagem({ tipo: 'info', texto: 'Novo mapa criado. Ctrl+Z traz o anterior de volta.' });
  };

  const salvar = () => {
    const nome = nomeDoArquivo();
    baixarTexto(
      serializarArquivoCompleto(
        loja.obterEstado(),
        lojaGrupo.obterEstado(),
        { campanha: lojaCampanha.obterEstado(), registro: lojaRegistro.obterEntradas(), regras: lojaRegras.obterEstado() },
        lojaCompendio.obterEstado(),
        lojaFichas.obterEstado(),
      ),
      nome,
    );
    aoMensagem({ tipo: 'info', texto: `Salvo em Downloads como ${nome}` });
  };

  const aoEscolherArquivo = async (evento: ChangeEvent<HTMLInputElement>) => {
    const entrada = evento.currentTarget;
    const arquivo = entrada.files?.[0];
    if (!arquivo) {
      return;
    }
    const texto = await arquivo.text();
    const resultado = desserializarMapa(texto);
    const lidaCampanha = lerCampanhaDoArquivo(texto);
    const lidoCompendio = lerCompendioDoArquivo(texto);
    const lidasFichas = lerFichasDoArquivo(texto);
    // Sem isso, escolher o mesmo arquivo de novo não dispararia este evento.
    entrada.value = '';
    // Qualquer parte com problema cancela tudo: abrir só metade misturaria duas campanhas.
    const problema = [resultado, lidaCampanha, lidoCompendio, lidasFichas].find((r) => !r.ok);
    if (!resultado.ok || !lidaCampanha.ok || !lidoCompendio.ok || !lidasFichas.ok) {
      const motivo = problema && !problema.ok ? problema.erro : '';
      aoMensagem({ tipo: 'erro', texto: `Não foi possível abrir: ${motivo}` });
      return;
    }
    // A campanha vem primeiro para que a abertura do mapa entre no registro que veio do arquivo.
    if (lidaCampanha.conteudo) {
      lojaRegistro.substituir(lidaCampanha.conteudo.registro);
      lojaCampanha.despachar({ tipo: 'CarregarCampanha', estado: lidaCampanha.conteudo.campanha });
      if (lidaCampanha.conteudo.regras) {
        lojaRegras.despachar({ tipo: 'CarregarRegras', regras: lidaCampanha.conteudo.regras });
      }
    }
    if (lidoCompendio.estado) {
      lojaCompendio.despachar({ tipo: 'CarregarCompendio', estado: lidoCompendio.estado });
    }
    if (lidasFichas.estado) {
      lojaFichas.despachar({ tipo: 'CarregarFichas', estado: lidasFichas.estado });
    }
    loja.despachar({ tipo: 'CarregarMapa', estado: resultado.estado });
    lojaGrupo.despachar({ tipo: 'CarregarGrupo', estado: resultado.grupo });
    aoMensagem({
      tipo: 'info',
      texto: lidaCampanha.conteudo
        ? 'Campanha aberta. Ctrl+Z traz o mapa anterior de volta, mas não os jogadores.' +
          (lidoCompendio.estado || lidasFichas.estado
            ? ' O compêndio e as fichas anteriores voltam com Ctrl+Z nas telas deles.'
            : '')
        : 'Mapa aberto. Ctrl+Z traz o anterior de volta.',
    });
    aoAbrirMapa(resultado.estado);
  };

  return (
    <div className="ferramentas">
      <button type="button" onClick={novoMapa}>
        Novo
      </button>
      <button type="button" onClick={salvar}>
        Salvar
      </button>
      <button type="button" onClick={() => seletorRef.current?.click()}>
        Abrir
      </button>
      <input
        ref={seletorRef}
        className="seletor-arquivo"
        type="file"
        accept=".json,application/json"
        onChange={(evento) => void aoEscolherArquivo(evento)}
      />
    </div>
  );
}

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
import type { LojaInstancias } from '../core/instancias';
import { lerInstanciasDoArquivo } from '../core/persistenciaInstancias';
import type { LojaRegras } from '../core/regrasDaCampanha';
import { lerArquivoDaCampanha, montarArquivoDaCampanha, type ImagemNoArquivo } from '../core/arquivoDaCampanha';
import { imagensUsadas } from '../core/imagens';
import { ErroDeFormato } from '../core/leitura';
import type { BancoDeImagens } from '../net/imagens';

export interface Mensagem {
  readonly tipo: 'info' | 'aviso' | 'erro';
  readonly texto: string;
}

interface BarraArquivoProps {
  readonly imagens: BancoDeImagens;
  readonly loja: LojaMapa;
  readonly lojaGrupo: LojaGrupo;
  readonly lojaCampanha: LojaCampanha;
  readonly lojaRegistro: LojaRegistro;
  readonly lojaCompendio: LojaCompendio;
  readonly lojaFichas: LojaFichas;
  readonly lojaInstancias: LojaInstancias;
  readonly lojaRegras: LojaRegras;
  readonly aoAbrirMapa: (estado: EstadoMapa) => void;
  readonly aoMensagem: (mensagem: Mensagem) => void;
}

function nomeDoArquivo(): string {
  const agora = new Date();
  // toISOString usa o horário universal; o ajuste faz o nome mostrar o horário local.
  const local = new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000);
  const momento = local.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `campanha-keikow-${momento}.zip`;
}

function baixarArquivo(bytes: Uint8Array, nome: string): void {
  const endereco = URL.createObjectURL(new Blob([bytes.slice()], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = endereco;
  link.download = nome;
  link.click();
  URL.revokeObjectURL(endereco);
}

export function BarraArquivo({
  imagens,
  loja,
  lojaGrupo,
  lojaCampanha,
  lojaRegistro,
  lojaCompendio,
  lojaFichas,
  lojaInstancias,
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

  const salvar = async () => {
    const nome = nomeDoArquivo();
    // O texto é montado antes de esperar pelas imagens, para salvar exatamente o que estava na tela.
    const texto = serializarArquivoCompleto(
      loja.obterEstado(),
      lojaGrupo.obterEstado(),
      { campanha: lojaCampanha.obterEstado(), registro: lojaRegistro.obterEntradas(), regras: lojaRegras.obterEstado() },
      lojaCompendio.obterEstado(),
      lojaFichas.obterEstado(),
      lojaInstancias.obterEstado(),
    );
    const usadas = [...imagensUsadas(lojaCompendio.obterEstado(), lojaFichas.obterEstado(), lojaInstancias.obterEstado())];
    const lidas = await Promise.all(
      usadas.map(async (id): Promise<ImagemNoArquivo | null> => {
        const blob = await imagens.obter(id).catch(() => null);
        return blob ? { id, tipo: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()) } : null;
      }),
    );
    const achadas = lidas.filter((imagem) => imagem !== null);
    baixarArquivo(montarArquivoDaCampanha({ texto, imagens: achadas }), nome);
    const faltaram = usadas.length - achadas.length;
    aoMensagem(
      faltaram > 0
        ? { tipo: 'aviso', texto: `Salvo em Downloads como ${nome}, mas ${faltaram} imagem(ns) não estavam guardadas neste navegador e ficaram de fora.` }
        : { tipo: 'info', texto: `Salvo em Downloads como ${nome}` },
    );
  };

  const aoEscolherArquivo = async (evento: ChangeEvent<HTMLInputElement>) => {
    const entrada = evento.currentTarget;
    const arquivo = entrada.files?.[0];
    if (!arquivo) {
      return;
    }
    let conteudo;
    try {
      conteudo = lerArquivoDaCampanha(new Uint8Array(await arquivo.arrayBuffer()));
    } catch (erro) {
      entrada.value = '';
      aoMensagem({ tipo: 'erro', texto: `Não foi possível abrir: ${erro instanceof ErroDeFormato ? erro.message : 'o arquivo não pôde ser lido.'}` });
      return;
    }
    const { texto } = conteudo;
    const resultado = desserializarMapa(texto);
    const lidaCampanha = lerCampanhaDoArquivo(texto);
    const lidoCompendio = lerCompendioDoArquivo(texto);
    const lidasFichas = lerFichasDoArquivo(texto);
    const lidasInstancias = lerInstanciasDoArquivo(texto);
    // Sem isso, escolher o mesmo arquivo de novo não dispararia este evento.
    entrada.value = '';
    // Qualquer parte com problema cancela tudo: abrir só metade misturaria duas campanhas.
    const problema = [resultado, lidaCampanha, lidoCompendio, lidasFichas, lidasInstancias].find((r) => !r.ok);
    if (!resultado.ok || !lidaCampanha.ok || !lidoCompendio.ok || !lidasFichas.ok || !lidasInstancias.ok) {
      const motivo = problema && !problema.ok ? problema.erro : '';
      aoMensagem({ tipo: 'erro', texto: `Não foi possível abrir: ${motivo}` });
      return;
    }
    // As imagens entram antes dos documentos, para as fichas já aparecerem com elas.
    const semImagem = (
      await Promise.all(
        conteudo.imagens.map((imagem) =>
          imagens.guardarBytes(imagem.id, imagem.tipo, imagem.bytes).then(
            () => true,
            () => false,
          ),
        ),
      )
    ).filter((ok) => !ok).length;
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
    // Arquivos de antes da Fase 6 não têm instâncias: as deste navegador ficam como estão.
    if (lidasInstancias.estado) {
      lojaInstancias.despachar({ tipo: 'CarregarInstancias', estado: lidasInstancias.estado });
    }
    loja.despachar({ tipo: 'CarregarMapa', estado: resultado.estado });
    lojaGrupo.despachar({ tipo: 'CarregarGrupo', estado: resultado.grupo });
    const avisoDasImagens =
      semImagem > 0 ? ` ${semImagem} imagem(ns) do arquivo não puderam ser guardadas neste navegador (falta de espaço?).` : '';
    aoMensagem({
      tipo: semImagem > 0 ? 'aviso' : 'info',
      texto: (lidaCampanha.conteudo
        ? 'Campanha aberta. Ctrl+Z traz o mapa anterior de volta, mas não os jogadores.' +
          (lidoCompendio.estado || lidasFichas.estado
            ? ' O compêndio e as fichas anteriores voltam com Ctrl+Z nas telas deles.'
            : '')
        : 'Mapa aberto. Ctrl+Z traz o anterior de volta.') + avisoDasImagens,
    });
    aoAbrirMapa(resultado.estado);
  };

  return (
    <div className="ferramentas">
      <button type="button" onClick={novoMapa}>
        Novo
      </button>
      <button type="button" onClick={() => void salvar()}>
        Salvar
      </button>
      <button type="button" onClick={() => seletorRef.current?.click()}>
        Abrir
      </button>
      <input
        ref={seletorRef}
        className="seletor-arquivo"
        type="file"
        accept=".zip,.json,application/zip,application/json"
        onChange={(evento) => void aoEscolherArquivo(evento)}
      />
    </div>
  );
}

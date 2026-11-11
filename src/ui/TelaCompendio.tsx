import { useDeferredValue, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Participante } from '../core/campanha';
import { buscarEntradas, entradaEm, type LojaCompendio } from '../core/compendio';
import { criarEntrada, TIPOS_ENTRADA, type Entrada, type TipoEntrada } from '../core/entradas';
import { ehMestre, podeVer } from '../core/visibilidade';
import { CampoLinhas, CampoTexto } from './camposFormulario';
import { EditorAcoes, EditorEfeitos, FormularioDados } from './FormulariosEntrada';
import { PainelImportacao } from './PainelImportacao';
import { ROTULO_TIPO } from './rotulosCompendio';
import { SeletorVisibilidade } from './SeletorVisibilidade';
import { CampoImagem, MiniaturaImagem } from './CampoImagem';
import { comImagem } from '../core/imagens';

/** Mais que isso deixa a lista lenta e não ajuda a achar nada: melhor refinar a busca. */
const LIMITE_LISTA = 300;

interface TelaCompendioProps {
  readonly lojaCompendio: LojaCompendio;
  readonly participantes: readonly Participante[];
  /** Os jogadores veem só as entradas mostradas a eles, e não editam nada. */
  readonly agindoComoId: string;
  readonly seletorAgindoComo: ReactNode;
  readonly aoFechar: () => void;
}

export function TelaCompendio({ lojaCompendio, participantes, agindoComoId, seletorAgindoComo, aoFechar }: TelaCompendioProps) {
  const estadoCompleto = useSyncExternalStore(lojaCompendio.assinar, lojaCompendio.obterEstado);
  const mestre = ehMestre(agindoComoId);
  // O jogador recebe só o que pode ver: o resto nem chega às telas.
  const estado = useMemo(
    () =>
      mestre
        ? estadoCompleto
        : { ...estadoCompleto, entradas: Object.fromEntries(Object.entries(estadoCompleto.entradas).filter(([, e]) => podeVer(e.visibilidade, agindoComoId))) },
    [estadoCompleto, mestre, agindoComoId],
  );
  const podeDesfazer = useSyncExternalStore(lojaCompendio.assinar, lojaCompendio.podeDesfazer);
  const podeRefazer = useSyncExternalStore(lojaCompendio.assinar, lojaCompendio.podeRefazer);
  const [busca, setBusca] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<TipoEntrada | ''>('');
  const [tipoNovo, setTipoNovo] = useState<TipoEntrada>('item');
  const [origemFiltro, setOrigemFiltro] = useState('');
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // O campo de busca responde na hora; a lista acompanha logo depois, sem travar a digitação.
  const buscaAdiada = useDeferredValue(busca);
  const encontradas = useMemo(
    () =>
      buscarEntradas(estado, {
        texto: buscaAdiada,
        tipos: tipoFiltro ? [tipoFiltro] : [],
        origem: origemFiltro || undefined,
      }),
    [estado, buscaAdiada, tipoFiltro, origemFiltro],
  );
  const todas = useMemo(() => Object.values(estado.entradas), [estado]);
  const pacotesPresentes = useMemo(
    () => [...new Set(todas.flatMap((e) => (e.origem.tipo === 'pacote' ? [e.origem.pacote] : [])))].sort(),
    [todas],
  );
  const selecionada = selecionadaId ? entradaEm(estado, selecionadaId) : undefined;

  const selecionar = (id: string | null) => {
    setImportando(false);
    setAviso(null);
    setSelecionadaId(id);
  };

  const criar = () => {
    const entrada = criarEntrada(tipoNovo, crypto.randomUUID());
    lojaCompendio.despachar({ tipo: 'AdicionarEntrada', entrada });
    selecionar(entrada.id);
  };

  return (
    <div className="tela-sobreposta" role="dialog" aria-label="Compêndio">
      <header className="tela-cabecalho">
        <h1>Compêndio</h1>
        {mestre ? (
          <div className="tela-cabecalho-acoes">
            <button type="button" disabled={!podeDesfazer} onClick={lojaCompendio.desfazer} title="Ctrl+Z">
              Desfazer
            </button>
            <button type="button" disabled={!podeRefazer} onClick={lojaCompendio.refazer} title="Ctrl+Y">
              Refazer
            </button>
            <button type="button" aria-pressed={importando} onClick={() => setImportando(!importando)}>
              Importar pacote
            </button>
          </div>
        ) : (
          <p className="tela-dica">Só para leitura: o compêndio é do mestre.</p>
        )}
        {seletorAgindoComo}
        <button type="button" className="tela-fechar" onClick={aoFechar}>
          Voltar ao mapa
        </button>
      </header>

      <div className="compendio-corpo">
        <aside className="compendio-lista">
          <input
            type="search"
            aria-label="Buscar no compêndio"
            placeholder="Buscar por nome ou etiqueta"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <select
            aria-label="Filtrar por tipo"
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value as TipoEntrada | '')}
          >
            <option value="">Todos os tipos</option>
            {TIPOS_ENTRADA.map((tipo) => (
              <option key={tipo} value={tipo}>
                {ROTULO_TIPO[tipo]}
              </option>
            ))}
          </select>
          {pacotesPresentes.length > 0 && (
            <select aria-label="Filtrar por origem" value={origemFiltro} onChange={(e) => setOrigemFiltro(e.target.value)}>
              <option value="">Todas as origens</option>
              <option value="campanha">Criadas na campanha</option>
              {pacotesPresentes.map((pacote) => (
                <option key={pacote} value={pacote}>
                  Do pacote {pacote}
                </option>
              ))}
            </select>
          )}
          {mestre && (
          <div className="compendio-novo">
            <select aria-label="Tipo da nova entrada" value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value as TipoEntrada)}>
              {TIPOS_ENTRADA.map((tipo) => (
                <option key={tipo} value={tipo}>
                  {ROTULO_TIPO[tipo]}
                </option>
              ))}
            </select>
            <button type="button" onClick={criar}>
              + Nova entrada
            </button>
          </div>
          )}
          <p className="tela-dica">
            {encontradas.length === 1 ? '1 entrada' : `${encontradas.length} entradas`}
            {encontradas.length > LIMITE_LISTA && `; mostrando as ${LIMITE_LISTA} primeiras`}
          </p>
          <ul>
            {encontradas.slice(0, LIMITE_LISTA).map((entrada) => (
              <li key={entrada.id}>
                <button
                  type="button"
                  aria-current={entrada.id === selecionadaId}
                  onClick={() => selecionar(entrada.id)}
                >
                  <span>{entrada.nome || '(sem nome)'}</span>
                  <small>{ROTULO_TIPO[entrada.tipo]}</small>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="compendio-editor">
          {aviso && <p className="mensagem-info">{aviso}</p>}
          {importando && mestre ? (
            <PainelImportacao
              estado={estado}
              lojaCompendio={lojaCompendio}
              aoFechar={() => setImportando(false)}
              aoImportar={(pacoteId, quantidade) => {
                selecionar(null);
                setOrigemFiltro(pacoteId);
                setAviso(
                  `${quantidade} entrada${quantidade === 1 ? ' importada' : 's importadas'}. O botão Desfazer (ou Ctrl+Z) volta atrás.`,
                );
              }}
            />
          ) : selecionada ? (
            <EditorEntrada
              key={selecionada.id}
              entrada={selecionada}
              todas={todas}
              lojaCompendio={lojaCompendio}
              participantes={participantes}
              somenteLeitura={!mestre}
              aoSelecionar={selecionar}
            />
          ) : (
            <p className="tela-dica">
              Escolha uma entrada na lista, crie uma nova ou use Importar pacote para trazer o SRD 5.1.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}

function EditorEntrada({
  entrada,
  todas,
  lojaCompendio,
  participantes,
  somenteLeitura,
  aoSelecionar,
}: {
  readonly entrada: Entrada;
  readonly todas: readonly Entrada[];
  readonly lojaCompendio: LojaCompendio;
  readonly participantes: readonly Participante[];
  readonly somenteLeitura: boolean;
  readonly aoSelecionar: (id: string | null) => void;
}) {
  // Cada vez que um campo recebe o foco começa um novo passo de desfazer.
  const sessaoDeFoco = useRef(0);

  const editar = (nova: Entrada, campo: string) =>
    lojaCompendio.despachar(
      { tipo: 'EditarEntrada', entrada: nova },
      `${entrada.id}:${campo}:${sessaoDeFoco.current}`,
    );

  const duplicar = () => {
    const novoId = crypto.randomUUID();
    lojaCompendio.despachar({ tipo: 'DuplicarEntrada', entradaId: entrada.id, novoId });
    aoSelecionar(novoId);
  };

  const apagar = () => {
    lojaCompendio.despachar({ tipo: 'RemoverEntrada', entradaId: entrada.id });
    aoSelecionar(null);
  };

  return (
    <div
      className="editor-entrada"
      onFocus={() => {
        sessaoDeFoco.current += 1;
      }}
    >
      <div className="editor-entrada-topo">
        <div className="titulo-com-imagem">
          {entrada.imagem && <MiniaturaImagem id={entrada.imagem} nome={entrada.nome} tamanho={56} />}
          <div>
            <h2>{entrada.nome || '(sem nome)'}</h2>
            <p className="tela-dica">
              {ROTULO_TIPO[entrada.tipo]} ·{' '}
              {entrada.origem.tipo === 'pacote' ? `do pacote ${entrada.origem.pacote}` : 'criada nesta campanha'}
            </p>
          </div>
        </div>
        {!somenteLeitura && (
          <div className="tela-cabecalho-acoes">
            <button type="button" onClick={duplicar}>
              Duplicar
            </button>
            <button type="button" onClick={apagar}>
              Apagar
            </button>
          </div>
        )}
      </div>

      {/* Um fieldset desativado desativa todos os campos de dentro: o jogador lê, mas não muda. */}
      <fieldset className="formulario formulario-leitura" disabled={somenteLeitura}>
        <CampoTexto rotulo="Nome" valor={entrada.nome} aoMudar={(nome) => editar({ ...entrada, nome }, 'nome')} />
        <CampoImagem
          rotulo="Imagem"
          valor={entrada.imagem}
          nome={entrada.nome}
          desativado={somenteLeitura}
          aoMudar={(id) => editar(comImagem(entrada, 'imagem', id), `imagem-${crypto.randomUUID()}`)}
        />
        <SeletorVisibilidade
          rotulo="Quem vê"
          valor={entrada.visibilidade}
          participantes={participantes}
          desativado={somenteLeitura}
          aoMudar={(visibilidade) => editar({ ...entrada, visibilidade }, `visibilidade-${crypto.randomUUID()}`)}
        />
        <CampoTexto
          rotulo="Descrição"
          multilinha
          valor={entrada.descricao}
          aoMudar={(descricao) => editar({ ...entrada, descricao }, 'descricao')}
        />
        <CampoLinhas
          rotulo="Etiquetas"
          valores={entrada.etiquetas}
          aoMudar={(etiquetas) => editar({ ...entrada, etiquetas }, 'etiquetas')}
        />
        <FormularioDados
          entrada={entrada}
          todas={todas}
          mudar={(parcial, campo) =>
            editar({ ...entrada, dados: { ...entrada.dados, ...parcial } } as Entrada, `dados-${campo}`)
          }
        />
        {/* Um kit nunca chega à ficha como kit: efeitos e ações ficam nos itens dele. */}
        {entrada.tipo !== 'kit' && (
          <>
            <EditorEfeitos entrada={entrada} mudar={(efeitos, campo) => editar({ ...entrada, efeitos } as Entrada, campo)} />
            <EditorAcoes entrada={entrada} mudar={(acoes, campo) => editar({ ...entrada, acoes } as Entrada, campo)} />
          </>
        )}
      </fieldset>
    </div>
  );
}

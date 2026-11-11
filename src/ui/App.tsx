import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent,
} from 'react';
import { chaveHex, type CoordHex, type PontoMundo } from '../core/hex';
import { criarLojaCampanha, ID_MESTRE, type LojaCampanha } from '../core/campanha';
import { ehMestre } from '../core/permissoes';
import { criarLojaCompendio, type LojaCompendio } from '../core/compendio';
import { criarLojaFichas, type LojaFichas } from '../core/fichas';
import { criarLojaRolagens, type LojaRolagens } from '../core/rolagens';
import { criarLojaRegras, type LojaRegras } from '../core/regrasDaCampanha';
import { criarLojaRegistro, type LojaRegistro } from '../core/registro';
import { criarLojaGrupo, type LojaGrupo } from '../core/grupo';
import { criarLojaMapa, type LojaMapa } from '../core/loja';
import type { EstadoMapa } from '../core/mapa';
import type { Manifesto } from '../core/manifesto';
import { assetsDesconhecidos } from '../core/persistencia';
import { criarArmazenamentoNavegador, pedirProtecaoDosDados } from '../net/armazenamentoLocal';
import {
  lerCampanhaLocal,
  lerCompendioLocal,
  lerFichasLocal,
  lerRolagensLocal,
  lerSalvamentoLocal,
  manterCampanhaLocal,
  manterCompendioLocal,
  manterFichasLocal,
  manterRolagensLocal,
  manterSalvamentoLocal,
} from '../net/salvamentoLocal';
import { carregarManifesto } from '../render/assets';
import { createMapScene, type CenaMapa } from '../render/createMapScene';
import { BarraArquivo, type Mensagem } from './BarraArquivo';
import { criarControlador, SEM_FERRAMENTA, type Ferramenta } from './controladorFerramentas';
import { PainelHex } from './PainelHex';
import { PainelHexJogador } from './PainelHexJogador';
import { Paleta } from './Paleta';
import { SeletorAparencia } from './SeletorAparencia';
import { TelaCampanha } from './TelaCampanha';
import { TelaCompendio } from './TelaCompendio';
import { TelaCreditos } from './TelaCreditos';
import { TelaFichas } from './TelaFichas';
import { TelaRegras } from './TelaRegras';
import { ContextoRegras } from './contextoRegras';
import { SeletorAgindoComo } from './SeletorVisibilidade';

const BORRACHA: Ferramenta = { tipo: 'apagar' };
const POSICIONAR: Ferramenta = { tipo: 'posicionar' };
const REVELAR: Ferramenta = { tipo: 'revelar' };
const OCULTAR: Ferramenta = { tipo: 'ocultar' };
/** Com estas ferramentas, os hexes que os jogadores não veriam ficam escurecidos. */
const FERRAMENTAS_DE_VISAO: ReadonlySet<Ferramenta['tipo']> = new Set([
  'posicionar',
  'revelar',
  'ocultar',
]);
const DURACAO_MENSAGEM_MS = 6000;

function ehCampoDeTexto(alvo: EventTarget | null): alvo is HTMLElement {
  if (!(alvo instanceof HTMLElement)) {
    return false;
  }
  // Botões de opção são INPUT, mas neles não se digita: os atalhos do mapa continuam valendo.
  if (alvo instanceof HTMLInputElement) {
    return alvo.type !== 'radio' && alvo.type !== 'checkbox';
  }
  return alvo.isContentEditable || alvo.tagName === 'TEXTAREA';
}

interface EditorCarregado {
  readonly loja: LojaMapa;
  readonly lojaGrupo: LojaGrupo;
  readonly lojaCampanha: LojaCampanha;
  readonly lojaRegistro: LojaRegistro;
  readonly lojaCompendio: LojaCompendio;
  readonly lojaFichas: LojaFichas;
  readonly lojaRolagens: LojaRolagens;
  readonly lojaRegras: LojaRegras;
  readonly sessao: Sessao;
  readonly aviso: Mensagem | null;
}

/**
 * Quem está agindo neste computador. As lojas perguntam aqui a cada ação, para registrar o autor
 * e conferir a permissão. Enquanto não há contas, o seletor "Agindo como" troca o participante.
 */
interface Sessao {
  autorId: string;
  aoRecusar: (motivo: string) => void;
}

/** As telas que cobrem o mapa inteiro. */
type Tela = 'campanha' | 'compendio' | 'fichas' | 'regras' | 'creditos';

const ARMAZENAMENTO = criarArmazenamentoNavegador();

async function iniciarEditor(): Promise<EditorCarregado> {
  pedirProtecaoDosDados();
  const [salvo, salvaCampanha, salvoCompendio, salvasFichas, salvasRolagens] = await Promise.all([
    lerSalvamentoLocal(ARMAZENAMENTO, localStorage),
    lerCampanhaLocal(ARMAZENAMENTO, localStorage),
    lerCompendioLocal(ARMAZENAMENTO, localStorage),
    lerFichasLocal(ARMAZENAMENTO, localStorage),
    lerRolagensLocal(ARMAZENAMENTO, localStorage),
  ]);
  const campanha = salvaCampanha?.ok ? salvaCampanha : null;
  const mapa = salvo?.ok ? salvo : null;
  const compendio = salvoCompendio?.ok ? salvoCompendio : null;

  const lojaRegistro = criarLojaRegistro(campanha?.registro);
  // Ao abrir, quem age é o mestre; o seletor "Agindo como" troca.
  const sessao: Sessao = { autorId: ID_MESTRE, aoRecusar: () => undefined };
  const opcoesRegistro = {
    obterAutorId: () => sessao.autorId,
    aoExecutar: lojaRegistro.registrar,
    aoRecusar: (motivo: string) => sessao.aoRecusar(motivo),
  };

  // As regras vêm com a campanha; sem campanha guardada, valem as padrão.
  const lojaRegras = criarLojaRegras(campanha?.regras, opcoesRegistro);

  const falha =
    (salvo && !salvo.ok && salvo.erro) ||
    (salvaCampanha && !salvaCampanha.ok && salvaCampanha.erro) ||
    (salvoCompendio && !salvoCompendio.ok && salvoCompendio.erro) ||
    (salvasFichas && !salvasFichas.ok && salvasFichas.erro);
  const loja = criarLojaMapa(mapa?.estado, opcoesRegistro);
  const lojaFichas = criarLojaFichas(salvasFichas?.ok ? salvasFichas.estado : undefined, opcoesRegistro, () => ({
    jogadoresCriam: lojaRegras.obterEstado().criacao.jogadoresCriam,
  }));
  // O grupo consulta o mapa (terreno de cada passo), as regras de viagem e quem controla cada ficha.
  const lojaGrupo = criarLojaGrupo(mapa?.grupo, opcoesRegistro, {
    obterMapa: loja.obterEstado,
    obterViagem: () => lojaRegras.obterEstado().viagem,
    obterDonoDaFicha: (fichaId) => lojaFichas.obterEstado().fichas[fichaId]?.donoId ?? null,
  });
  return {
    loja,
    lojaGrupo,
    lojaCampanha: criarLojaCampanha(campanha?.campanha, opcoesRegistro),
    lojaRegistro,
    lojaCompendio: criarLojaCompendio(compendio?.estado, opcoesRegistro),
    lojaFichas,
    // Um registro de rolagens ilegível não impede de abrir: começa vazio.
    lojaRolagens: criarLojaRolagens(salvasRolagens?.ok ? salvasRolagens.rolagens : []),
    lojaRegras,
    sessao,
    aviso: falha
      ? { tipo: 'erro', texto: `O salvamento automático não pôde ser lido: ${falha}` }
      : null,
  };
}

function avisoDeImagensFaltando(estado: EstadoMapa, manifesto: Manifesto): Mensagem | null {
  const faltando = assetsDesconhecidos(estado, manifesto);
  if (faltando.length === 0) {
    return null;
  }
  return {
    tipo: 'erro',
    texto: `Imagens não encontradas, que não serão desenhadas: ${faltando.join(', ')}`,
  };
}

/** Garante um único carregamento, mesmo que o React monte o componente duas vezes. */
let carregamentoDoEditor: Promise<EditorCarregado> | null = null;

export function App() {
  const [editor, setEditor] = useState<EditorCarregado | null>(null);

  useEffect(() => {
    let ativo = true;
    carregamentoDoEditor ??= iniciarEditor();
    void carregamentoDoEditor.then((carregado) => {
      if (ativo) {
        setEditor(carregado);
      }
    });
    return () => {
      ativo = false;
    };
  }, []);

  if (!editor) {
    return <p className="carregando">Carregando…</p>;
  }
  return <Editor {...editor} />;
}

function Editor({
  loja,
  lojaGrupo,
  lojaCampanha,
  lojaRegistro,
  lojaCompendio,
  lojaFichas,
  lojaRolagens,
  lojaRegras,
  sessao,
  aviso,
}: EditorCarregado) {
  const mapRef = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<CenaMapa | null>(null);
  const assetArrastado = useRef<string | null>(null);
  const [manifesto, setManifesto] = useState<Manifesto | null>(null);
  const [mensagem, setMensagem] = useState<Mensagem | null>(aviso);
  const [hexSobMouse, setHexSobMouse] = useState<CoordHex | null>(null);
  const [ferramenta, setFerramenta] = useState<Ferramenta>(SEM_FERRAMENTA);
  const podeDesfazer = useSyncExternalStore(loja.assinar, loja.podeDesfazer);
  const podeRefazer = useSyncExternalStore(loja.assinar, loja.podeRefazer);

  const [hexSelecionado, setHexSelecionado] = useState<CoordHex | null>(null);
  const [agindoComoId, setAgindoComoId] = useState(sessao.autorId);
  const [telaAberta, setTelaAberta] = useState<Tela | null>(null);
  const grupo = useSyncExternalStore(lojaGrupo.assinar, lojaGrupo.obterEstado);
  const campanha = useSyncExternalStore(lojaCampanha.assinar, lojaCampanha.obterEstado);
  const regras = useSyncExternalStore(lojaRegras.assinar, lojaRegras.obterEstado);
  const agindoComo = campanha.participantes.find((p) => p.id === agindoComoId);
  /** Agindo como um jogador, o mapa mostra só o que ele vê e nada pode ser editado. */
  const modoJogador = !ehMestre(agindoComoId);

  const agirComo = useCallback(
    (participanteId: string) => {
      // A sessão muda já, e não só depois de a tela redesenhar.
      sessao.autorId = participanteId;
      setAgindoComoId(participanteId);
      setHexSelecionado(null);
    },
    [sessao],
  );

  const sairDoModoJogador = useCallback(() => agirComo(ID_MESTRE), [agirComo]);

  // Um jogador removido da campanha não pode continuar agindo.
  useEffect(() => {
    if (!agindoComo) {
      agirComo(ID_MESTRE);
    }
  }, [agindoComo, agirComo]);

  useEffect(() => {
    sessao.aoRecusar = (motivo) => setMensagem({ tipo: 'aviso', texto: motivo });
    return () => {
      sessao.aoRecusar = () => undefined;
    };
  }, [sessao]);

  const controlador = useMemo(
    () =>
      manifesto
        ? criarControlador(
            loja,
            lojaGrupo,
            manifesto,
            () => cenaRef.current,
            setHexSelecionado,
            (texto) => setMensagem({ tipo: 'aviso', texto }),
          )
        : null,
    [loja, lojaGrupo, manifesto],
  );

  useEffect(() => cenaRef.current?.selecionarHex(hexSelecionado), [hexSelecionado]);

  useEffect(() => {
    cenaRef.current?.definirConferenciaDeVisao(FERRAMENTAS_DE_VISAO.has(ferramenta.tipo));
  }, [ferramenta]);

  useEffect(() => {
    controlador?.definirSomenteLeitura(modoJogador);
    if (modoJogador) {
      controlador?.definirFerramenta(SEM_FERRAMENTA);
      setFerramenta(SEM_FERRAMENTA);
    }
    cenaRef.current?.definirModoJogador(modoJogador ? agindoComoId : null);
  }, [controlador, modoJogador, agindoComoId]);

  const selecionarFerramenta = useCallback(
    (nova: Ferramenta) => {
      controlador?.definirFerramenta(nova);
      setFerramenta(nova);
    },
    [controlador],
  );

  useEffect(() => {
    carregarManifesto()
      .then(setManifesto)
      .catch((motivo: unknown) => setMensagem({ tipo: 'erro', texto: String(motivo) }));
  }, []);

  useEffect(
    () =>
      manterSalvamentoLocal(
        loja,
        lojaGrupo,
        () =>
          setMensagem({
            tipo: 'erro',
            texto: 'O navegador recusou o salvamento automático. Use o botão Salvar.',
          }),
        ARMAZENAMENTO,
        localStorage,
      ),
    [loja, lojaGrupo],
  );

  useEffect(
    () =>
      manterCampanhaLocal(
        lojaCampanha,
        lojaRegistro,
        () =>
          setMensagem({
            tipo: 'erro',
            texto: 'O navegador recusou guardar os dados da campanha. Use o botão Salvar.',
          }),
        ARMAZENAMENTO,
        localStorage,
        lojaRegras,
      ),
    [lojaCampanha, lojaRegistro, lojaRegras],
  );

  useEffect(
    () =>
      manterCompendioLocal(
        lojaCompendio,
        () =>
          setMensagem({
            tipo: 'erro',
            texto: 'O navegador recusou guardar o compêndio. Use o botão Salvar.',
          }),
        ARMAZENAMENTO,
        localStorage,
      ),
    [lojaCompendio],
  );

  useEffect(
    () =>
      manterFichasLocal(
        lojaFichas,
        () =>
          setMensagem({
            tipo: 'erro',
            texto: 'O navegador recusou guardar as fichas. Use o botão Salvar.',
          }),
        ARMAZENAMENTO,
        localStorage,
      ),
    [lojaFichas],
  );

  useEffect(
    () =>
      manterRolagensLocal(
        lojaRolagens,
        () => setMensagem({ tipo: 'erro', texto: 'O navegador recusou guardar o registro de rolagens.' }),
        ARMAZENAMENTO,
        localStorage,
      ),
    [lojaRolagens],
  );

  useEffect(() => {
    if (manifesto) {
      const avisoImagens = avisoDeImagensFaltando(loja.obterEstado(), manifesto);
      if (avisoImagens) {
        setMensagem(avisoImagens);
      }
    }
  }, [loja, manifesto]);

  useEffect(() => {
    if (!mensagem || mensagem.tipo === 'erro') {
      return;
    }
    const temporizador = setTimeout(() => setMensagem(null), DURACAO_MENSAGEM_MS);
    return () => clearTimeout(temporizador);
  }, [mensagem]);

  useEffect(() => {
    if (!manifesto || !controlador) {
      return;
    }
    const cena = createMapScene(mapRef.current!, {
      loja,
      lojaGrupo,
      manifesto,
      aoMudarHexSobMouse: setHexSobMouse,
      aoMoverPonteiro: controlador.aoMoverPonteiro,
      aoIniciarTraco: controlador.aoIniciarTraco,
      aoContinuarTraco: controlador.aoContinuarTraco,
      aoMoverDuranteTraco: controlador.aoMoverDuranteTraco,
      aoTerminarTraco: controlador.aoTerminarTraco,
      aoClicar: controlador.aoClicar,
    });
    cenaRef.current = cena;
    return () => {
      cena.destruir();
      cenaRef.current = null;
    };
  }, [loja, lojaGrupo, manifesto, controlador]);

  useEffect(() => {
    const aoApertarTecla = (evento: KeyboardEvent) => {
      if (ehCampoDeTexto(evento.target)) {
        // Enquanto se digita, Ctrl+Z desfaz o texto, e não o mapa. Esc só sai do campo.
        if (evento.key === 'Escape') {
          evento.target.blur();
        }
        return;
      }
      const tecla = evento.key.toLowerCase();
      const comCtrl = evento.ctrlKey || evento.metaKey;
      const refazer = comCtrl && (tecla === 'y' || (tecla === 'z' && evento.shiftKey));
      const desfazer = comCtrl && tecla === 'z' && !evento.shiftKey;
      if ((telaAberta || modoJogador) && (refazer || desfazer)) {
        // Sem isto, o navegador desfaria o último texto digitado, mesmo fora do campo.
        evento.preventDefault();
      }
      if (telaAberta) {
        // O mapa está coberto: os atalhos dele não podem agir sem que ele apareça.
        if (evento.key === 'Escape') {
          setTelaAberta(null);
        } else if (telaAberta === 'compendio' && desfazer) {
          lojaCompendio.desfazer();
        } else if (telaAberta === 'compendio' && refazer) {
          lojaCompendio.refazer();
        } else if (telaAberta === 'fichas' && desfazer) {
          lojaFichas.desfazer();
        } else if (telaAberta === 'fichas' && refazer) {
          lojaFichas.refazer();
        } else if (telaAberta === 'regras' && desfazer) {
          lojaRegras.desfazer();
        } else if (telaAberta === 'regras' && refazer) {
          lojaRegras.refazer();
        }
        return;
      }
      if (modoJogador) {
        // O modo jogador só olha: nenhum atalho de edição funciona aqui.
        if (evento.key === 'Escape') {
          if (hexSelecionado) {
            setHexSelecionado(null);
          } else {
            sairDoModoJogador();
          }
        }
        return;
      }
      if (evento.key === 'Escape') {
        if (ferramenta.tipo === 'nenhuma') {
          setHexSelecionado(null);
        } else {
          selecionarFerramenta(SEM_FERRAMENTA);
        }
        return;
      }
      if (refazer) {
        evento.preventDefault();
        loja.refazer();
      } else if (desfazer) {
        evento.preventDefault();
        loja.desfazer();
      }
    };
    window.addEventListener('keydown', aoApertarTecla);
    return () => window.removeEventListener('keydown', aoApertarTecla);
  }, [
    loja,
    lojaCompendio,
    lojaFichas,
    lojaRegras,
    selecionarFerramenta,
    ferramenta,
    modoJogador,
    hexSelecionado,
    sairDoModoJogador,
    telaAberta,
  ]);

  const pontoDoEvento = (evento: DragEvent<HTMLElement>): PontoMundo | null => {
    const limites = evento.currentTarget.getBoundingClientRect();
    return (
      cenaRef.current?.mundoEm(evento.clientX - limites.left, evento.clientY - limites.top) ?? null
    );
  };

  const aoArrastarSobreMapa = (evento: DragEvent<HTMLElement>) => {
    const assetId = assetArrastado.current;
    if (!assetId) {
      return;
    }
    evento.preventDefault();
    evento.dataTransfer.dropEffect = 'copy';
    const ponto = pontoDoEvento(evento);
    if (ponto) {
      controlador?.mostrarPrevia(assetId, ponto);
    }
  };

  const aoSairDoMapa = (evento: DragEvent<HTMLElement>) => {
    // Passar do mapa para a tela dentro dele também dispara este evento.
    if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) {
      cenaRef.current?.limparPrevia();
    }
  };

  const aoSoltarNoMapa = (evento: DragEvent<HTMLElement>) => {
    const assetId = assetArrastado.current;
    if (!assetId) {
      return;
    }
    evento.preventDefault();
    const ponto = pontoDoEvento(evento);
    if (ponto) {
      controlador?.colocarAsset(assetId, ponto);
    }
    cenaRef.current?.limparPrevia();
  };

  const aoTerminarArraste = () => {
    assetArrastado.current = null;
    cenaRef.current?.limparPrevia();
  };

  const assetSelecionado = ferramenta.tipo === 'colocar' ? ferramenta.assetId : null;

  const aoSelecionarAsset = (assetId: string) => {
    selecionarFerramenta(
      assetId === assetSelecionado ? SEM_FERRAMENTA : { tipo: 'colocar', assetId },
    );
  };

  const seletorAgindoComo = (
    <SeletorAgindoComo participantes={campanha.participantes} valor={agindoComoId} aoMudar={agirComo} />
  );

  return (
    <ContextoRegras.Provider value={regras}>
    <div className="app">
      <aside className="sidebar">
        <h1>KeikowVTT</h1>
        {seletorAgindoComo}
        {modoJogador && (
          <>
            <p className="tela-dica">
              Você vê o que este jogador vê. O mapa e o compêndio ficam só para leitura; nas fichas dele, vale o que
              o mestre permite.
            </p>
            <div className="ferramentas">
              <button type="button" onClick={() => setTelaAberta('fichas')}>
                Fichas
              </button>
              <button type="button" onClick={() => setTelaAberta('compendio')}>
                Compêndio
              </button>
              <button type="button" onClick={() => setTelaAberta('regras')}>
                Regras
              </button>
              <button type="button" onClick={() => setTelaAberta('creditos')}>
                Créditos
              </button>
            </div>
            {mensagem && <p className={`mensagem-${mensagem.tipo}`}>{mensagem.texto}</p>}
          </>
        )}
        {!modoJogador && (
          <>
        <details className="ajuda-bloco">
          <summary>Ajuda</summary>
          <dl className="ajuda">
            <dt>Colocar</dt>
            <dd>Clique em um item e use o botão esquerdo, ou arraste o item para o mapa</dd>
            <dt>Ver um hex</dt>
            <dd>Sem ferramenta (Esc), clique no hex</dd>
            <dt>Mover decoração</dt>
            <dd>Sem ferramenta (Esc), arraste com o botão esquerdo</dd>
            <dt>Zoom e câmera</dt>
            <dd>Roda do mouse; arrastar com o botão direito ou o do meio</dd>
            <dt>Visão dos jogadores</dt>
            <dd>
              Grupo, Revelar e Ocultar escurecem o que os jogadores não veriam. O contorno verde
              marca o que foi revelado à mão
            </dd>
            <dt>Salvamento</dt>
            <dd>O mapa fica guardado neste navegador; use Salvar para ter uma cópia em arquivo</dd>
          </dl>
        </details>
        <div className="ferramentas">
          <button type="button" onClick={() => setTelaAberta('campanha')}>
            Campanha
          </button>
          <button type="button" onClick={() => setTelaAberta('fichas')}>
            Fichas
          </button>
          <button type="button" onClick={() => setTelaAberta('compendio')}>
            Compêndio
          </button>
          <button type="button" onClick={() => setTelaAberta('regras')}>
            Regras
          </button>
          <button type="button" onClick={() => setTelaAberta('creditos')}>
            Créditos
          </button>
        </div>
        <BarraArquivo
          loja={loja}
          lojaGrupo={lojaGrupo}
          lojaCampanha={lojaCampanha}
          lojaRegistro={lojaRegistro}
          lojaCompendio={lojaCompendio}
          lojaFichas={lojaFichas}
          lojaRegras={lojaRegras}
          aoAbrirMapa={(estado) => {
            setHexSelecionado(null);
            cenaRef.current?.centralizarNoMapa();
            const avisoImagens = manifesto && avisoDeImagensFaltando(estado, manifesto);
            if (avisoImagens) {
              setMensagem(avisoImagens);
            }
          }}
          aoMensagem={setMensagem}
        />
        <div className="ferramentas">
          <button
            type="button"
            aria-pressed={ferramenta.tipo === 'apagar'}
            onClick={() =>
              selecionarFerramenta(ferramenta.tipo === 'apagar' ? SEM_FERRAMENTA : BORRACHA)
            }
          >
            Borracha
          </button>
          <button type="button" disabled={!podeDesfazer} onClick={loja.desfazer} title="Ctrl+Z">
            Desfazer
          </button>
          <button type="button" disabled={!podeRefazer} onClick={loja.refazer} title="Ctrl+Y">
            Refazer
          </button>
        </div>
        <div className="ferramentas">
          {(
            [
              [POSICIONAR, 'Grupo', 'Clique em um hex para colocar o grupo nele'],
              [REVELAR, 'Revelar', 'Pinte para mostrar hexes aos jogadores'],
              [OCULTAR, 'Ocultar', 'Pinte para desfazer a revelação'],
            ] as const
          ).map(([alvo, rotulo, dica]) => (
            <button
              key={alvo.tipo}
              type="button"
              title={dica}
              aria-pressed={ferramenta.tipo === alvo.tipo}
              onClick={() =>
                selecionarFerramenta(ferramenta.tipo === alvo.tipo ? SEM_FERRAMENTA : alvo)
              }
            >
              {rotulo}
            </button>
          ))}
        </div>
        {manifesto && (
          <details className="ajuda-bloco">
            <summary>Aparência dos hexes não vistos</summary>
            <SeletorAparencia loja={loja} manifesto={manifesto} />
          </details>
        )}
        <p className="coordenada">
          {hexSobMouse ? `Hex: q ${hexSobMouse.q}, r ${hexSobMouse.r}` : 'Hex: —'}
        </p>
        {mensagem && <p className={`mensagem-${mensagem.tipo}`}>{mensagem.texto}</p>}
        {manifesto && (
          <Paleta
            manifesto={manifesto}
            assetSelecionado={assetSelecionado}
            aoSelecionarAsset={aoSelecionarAsset}
            aoIniciarArraste={(assetId) => {
              assetArrastado.current = assetId;
            }}
            aoTerminarArraste={aoTerminarArraste}
          />
        )}
          </>
        )}
      </aside>
      <div className="area-mapa">
        <main
          className={ferramenta.tipo === 'nenhuma' ? 'map' : 'map com-ferramenta'}
          ref={mapRef}
          onDragOver={aoArrastarSobreMapa}
          onDragLeave={aoSairDoMapa}
          onDrop={aoSoltarNoMapa}
        />
        {modoJogador && (
          <div className="faixa-jogador">
            <span>
              Agindo como {agindoComo?.nome || 'jogador'}
              {!grupo.posicao && ': o grupo ainda não foi posicionado'}
            </span>
            <button type="button" onClick={sairDoModoJogador}>
              Voltar ao mestre
            </button>
          </div>
        )}
        {hexSelecionado && modoJogador && (
          <PainelHexJogador
            key={chaveHex(hexSelecionado)}
            loja={loja}
            lojaGrupo={lojaGrupo}
            participanteId={agindoComoId}
            coord={hexSelecionado}
            aoFechar={() => setHexSelecionado(null)}
          />
        )}
        {hexSelecionado && !modoJogador && (
          <PainelHex
            key={chaveHex(hexSelecionado)}
            loja={loja}
            lojaGrupo={lojaGrupo}
            participantes={campanha.participantes}
            coord={hexSelecionado}
            aoFechar={() => setHexSelecionado(null)}
          />
        )}
      </div>
      {telaAberta === 'campanha' && (
        <TelaCampanha
          lojaCampanha={lojaCampanha}
          lojaRegistro={lojaRegistro}
          aoFechar={() => setTelaAberta(null)}
        />
      )}
      {telaAberta === 'compendio' && (
        <TelaCompendio
          lojaCompendio={lojaCompendio}
          participantes={campanha.participantes}
          agindoComoId={agindoComoId}
          seletorAgindoComo={seletorAgindoComo}
          aoFechar={() => setTelaAberta(null)}
        />
      )}
      {telaAberta === 'fichas' && (
        <TelaFichas
          lojaFichas={lojaFichas}
          lojaCompendio={lojaCompendio}
          lojaCampanha={lojaCampanha}
          lojaRolagens={lojaRolagens}
          agindoComoId={agindoComoId}
          seletorAgindoComo={seletorAgindoComo}
          aoFechar={() => setTelaAberta(null)}
        />
      )}
      {telaAberta === 'regras' && (
        <TelaRegras
          lojaRegras={lojaRegras}
          lojaFichas={lojaFichas}
          lojaCompendio={lojaCompendio}
          agindoComoId={agindoComoId}
          seletorAgindoComo={seletorAgindoComo}
          aoFechar={() => setTelaAberta(null)}
        />
      )}
      {telaAberta === 'creditos' && <TelaCreditos aoFechar={() => setTelaAberta(null)} />}
    </div>
    </ContextoRegras.Provider>
  );
}

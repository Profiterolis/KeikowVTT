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
import { VISIVEL_A_TODOS } from '../core/visibilidade';
import { criarLojaCompendio, type LojaCompendio } from '../core/compendio';
import { criarLojaFichas, type LojaFichas } from '../core/fichas';
import { criarLojaRolagens, type LojaRolagens } from '../core/rolagens';
import { criarLojaRegras, type LojaRegras } from '../core/regrasDaCampanha';
import { criarLojaRegistro, type LojaRegistro } from '../core/registro';
import {
  alcanceDaVisao,
  criarLojaGrupo,
  eleitores,
  votosValidos,
  grupoVistoPor,
  membrosPresentes,
  quemJaEscolheu,
  motivoParaNaoConduzir,
  passosPossiveis,
  podeConduzir,
  type ContextoDoGrupo,
  type EstadoGrupo,
  type LojaGrupo,
  type PassoPossivel,
} from '../core/grupo';
import { ExplicacaoDoPasso } from './ExplicacaoDoPasso';
import { BarraDoGrupo } from './BarraDoGrupo';
import { problemaNosItensDaCriacao } from '../core/kits';
import { criarLojaNotificacoes, type LojaNotificacoes } from '../core/notificacoes';
import { Notificacoes } from './Notificacoes';
import { PainelDiario } from './PainelDiario';
import { PainelGrupo } from './PainelGrupo';
import { membroNaViagem } from '../core/calculoDaFicha';
import { criarLojaMapa, type LojaMapa } from '../core/loja';
import type { EstadoMapa } from '../core/mapa';
import type { Manifesto } from '../core/manifesto';
import { assetsDesconhecidos } from '../core/persistencia';
import { criarArmazenamentoNavegador, pedirProtecaoDosDados } from '../net/armazenamentoLocal';
import { criarBancoDeImagens } from '../net/imagens';
import { imagemDoToken } from '../core/imagens';
import { ContextoImagens } from './contextoImagens';
import {
  lerCampanhaLocal,
  lerCompendioLocal,
  lerFichasLocal,
  lerNotificacoesLocal,
  lerRolagensLocal,
  lerSalvamentoLocal,
  manterCampanhaLocal,
  manterCompendioLocal,
  manterFichasLocal,
  manterNotificacoesLocal,
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
  /** O que o grupo consulta das outras lojas: mapa, regras e fichas. */
  readonly contextoGrupo: ContextoDoGrupo;
  readonly lojaCampanha: LojaCampanha;
  readonly lojaRegistro: LojaRegistro;
  readonly lojaCompendio: LojaCompendio;
  readonly lojaFichas: LojaFichas;
  readonly lojaRolagens: LojaRolagens;
  readonly lojaNotificacoes: LojaNotificacoes;
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
const IMAGENS = criarBancoDeImagens();

async function iniciarEditor(): Promise<EditorCarregado> {
  pedirProtecaoDosDados();
  const [salvo, salvaCampanha, salvoCompendio, salvasFichas, salvasRolagens, salvasNotificacoes] = await Promise.all([
    lerSalvamentoLocal(ARMAZENAMENTO, localStorage),
    lerCampanhaLocal(ARMAZENAMENTO, localStorage),
    lerCompendioLocal(ARMAZENAMENTO, localStorage),
    lerFichasLocal(ARMAZENAMENTO, localStorage),
    lerRolagensLocal(ARMAZENAMENTO, localStorage),
    lerNotificacoesLocal(ARMAZENAMENTO, localStorage),
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
  const lojaCompendio = criarLojaCompendio(compendio?.estado, opcoesRegistro);
  const lojaFichas = criarLojaFichas(salvasFichas?.ok ? salvasFichas.estado : undefined, opcoesRegistro, () => ({
    jogadoresCriam: lojaRegras.obterEstado().criacao.jogadoresCriam,
    // Criando o personagem, o jogador só fica com os itens dos kits oferecidos.
    itensDaCriacao: (ficha) => problemaNosItensDaCriacao(ficha, lojaCompendio.obterEstado(), lojaRegras.obterEstado()),
  }));
  // O grupo consulta o mapa (terreno de cada passo), as regras de viagem e quem controla cada ficha.
  const contextoGrupo: ContextoDoGrupo = {
    obterMapa: loja.obterEstado,
    obterViagem: () => lojaRegras.obterEstado().viagem,
    obterDonoDaFicha: (fichaId) => lojaFichas.obterEstado().fichas[fichaId]?.donoId ?? null,
    obterMembroNaViagem: (fichaId) => {
      const ficha = lojaFichas.obterEstado().fichas[fichaId];
      return ficha ? membroNaViagem(ficha, lojaRegras.obterEstado()) : null;
    },
    obterNoite: () => lojaRegras.obterEstado().noite,
  };
  const lojaGrupo = criarLojaGrupo(mapa?.grupo, opcoesRegistro, contextoGrupo);
  // Notificações ilegíveis não impedem de abrir: começam vazias.
  const lojaNotificacoes = criarLojaNotificacoes(salvasNotificacoes?.ok ? salvasNotificacoes.estado : undefined);
  // Quando uma eleição termina (havia uma e não há mais, com resultado), todos ficam sabendo.
  let eleicaoAntes = lojaGrupo.obterEstado().eleicao;
  lojaGrupo.assinar((grupo) => {
    const resultado = grupo.ultimaEleicao;
    if (eleicaoAntes && !grupo.eleicao && resultado) {
      const nome = (id: string) => lojaFichas.obterEstado().fichas[id]?.nome.trim() || 'Sem nome';
      lojaNotificacoes.notificar({
        icone: '🗳️',
        texto: resultado.vencedorId
          ? `A eleição terminou: ${nome(resultado.vencedorId)} lidera o grupo${resultado.desempatePeloMestre ? ' (desempate do mestre)' : ''}.`
          : 'A eleição terminou sem votos: a liderança não mudou.',
        visibilidade: VISIVEL_A_TODOS,
      });
    }
    eleicaoAntes = grupo.eleicao;
  });
  return {
    loja,
    lojaGrupo,
    contextoGrupo,
    lojaCampanha: criarLojaCampanha(campanha?.campanha, opcoesRegistro),
    lojaRegistro,
    lojaCompendio,
    lojaFichas,
    // Um registro de rolagens ilegível não impede de abrir: começa vazio.
    lojaRolagens: criarLojaRolagens(salvasRolagens?.ok ? salvasRolagens.rolagens : []),
    lojaNotificacoes,
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

const CHAVE_MAPA_TRAVADO = 'keikow.mapaTravado';

/** O mapa começa travado; o navegador lembra a última escolha do mestre. */
function lerMapaTravado(): boolean {
  try {
    return localStorage.getItem(CHAVE_MAPA_TRAVADO) !== 'nao';
  } catch {
    return true;
  }
}

function gravarMapaTravado(travado: boolean): void {
  try {
    localStorage.setItem(CHAVE_MAPA_TRAVADO, travado ? 'sim' : 'nao');
  } catch {
    // Sem o armazenamento, a escolha só vale até fechar a página.
  }
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
  contextoGrupo,
  lojaCampanha,
  lojaRegistro,
  lojaCompendio,
  lojaFichas,
  lojaRolagens,
  lojaNotificacoes,
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
  const [passoSobMouse, setPassoSobMouse] = useState<PassoPossivel | null>(null);
  /** O painel do grupo e o diário ocupam o lugar do painel do hex: abrir um fecha os outros. */
  const [painelLateral, setPainelLateral] = useState<'grupo' | 'diario' | null>(null);
  const [agindoComoId, setAgindoComoId] = useState(sessao.autorId);
  const [telaAberta, setTelaAberta] = useState<Tela | null>(null);
  const [mapaTravado, setMapaTravado] = useState(lerMapaTravado);
  const grupo = useSyncExternalStore(lojaGrupo.assinar, lojaGrupo.obterEstado);
  const campanha = useSyncExternalStore(lojaCampanha.assinar, lojaCampanha.obterEstado);
  const regras = useSyncExternalStore(lojaRegras.assinar, lojaRegras.obterEstado);
  const fichas = useSyncExternalStore(lojaFichas.assinar, lojaFichas.obterEstado);
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
            {
              podeConduzir: () => podeConduzir(lojaGrupo.obterEstado(), sessao.autorId, contextoGrupo),
              passos: () => passosPossiveis(lojaGrupo.obterEstado(), contextoGrupo),
              aoMudarPasso: setPassoSobMouse,
              motivoSemConduzir: () => motivoParaNaoConduzir(lojaGrupo.obterEstado(), sessao.autorId, contextoGrupo),
            },
          )
        : null,
    [loja, lojaGrupo, manifesto, sessao, contextoGrupo],
  );

  // O grupo andou, travou ou trocou de líder: os custos mostrados acompanham.
  useEffect(() => {
    controlador?.aoMudarGrupo();
  }, [controlador, grupo, fichas, regras, agindoComoId]);

  // Nomes dos membros mudaram: as cabeças do token acompanham.
  useEffect(() => {
    cenaRef.current?.atualizarGrupo();
  }, [fichas]);

  useEffect(() => cenaRef.current?.selecionarHex(hexSelecionado), [hexSelecionado]);

  useEffect(() => {
    cenaRef.current?.definirConferenciaDeVisao(FERRAMENTAS_DE_VISAO.has(ferramenta.tipo));
  }, [ferramenta]);

  useEffect(() => {
    controlador?.definirTravado(mapaTravado);
    if (mapaTravado && (ferramenta.tipo === 'colocar' || ferramenta.tipo === 'apagar')) {
      setFerramenta(SEM_FERRAMENTA);
    }
    gravarMapaTravado(mapaTravado);
  }, [controlador, mapaTravado, ferramenta.tipo]);

  useEffect(() => {
    controlador?.definirSomenteLeitura(modoJogador);
    if (modoJogador) {
      controlador?.definirFerramenta(SEM_FERRAMENTA);
      setFerramenta(SEM_FERRAMENTA);
    }
  }, [controlador, modoJogador]);

  // Cada jogador vê até onde os personagens dele enxergam: quem voa vê mais longe que o grupo.
  const alcanceDoJogador = useMemo(
    () => (modoJogador ? alcanceDaVisao(grupo, agindoComoId, contextoGrupo) : 1),
    // As fichas e as regras mudam o alcance (uma luneta, um efeito novo), mesmo sem serem lidas aqui.
    [modoJogador, grupo, agindoComoId, contextoGrupo, fichas, regras],
  );

  useEffect(() => {
    controlador?.definirAlcanceDaVisao(alcanceDoJogador);
    cenaRef.current?.definirModoJogador(modoJogador ? agindoComoId : null, alcanceDoJogador);
  }, [controlador, modoJogador, agindoComoId, alcanceDoJogador]);

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

  useEffect(
    () =>
      manterNotificacoesLocal(
        lojaNotificacoes,
        () => setMensagem({ tipo: 'erro', texto: 'O navegador recusou guardar as notificações.' }),
        ARMAZENAMENTO,
        localStorage,
      ),
    [lojaNotificacoes],
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
      obterCabecasDoGrupo: () =>
        membrosPresentes(lojaGrupo.obterEstado(), contextoGrupo).map((id) => {
          const ficha = lojaFichas.obterEstado().fichas[id];
          return { id, nome: ficha?.nome ?? '', imagem: ficha ? imagemDoToken(ficha) : null };
        }),
      carregarImagem: (id) => IMAGENS.endereco(id),
    });
    cenaRef.current = cena;
    return () => {
      cena.destruir();
      cenaRef.current = null;
    };
  }, [loja, lojaGrupo, lojaFichas, manifesto, controlador, contextoGrupo]);

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
          if (controlador?.grupoSelecionado()) {
            controlador.desmarcarGrupo();
          } else if (hexSelecionado) {
            setHexSelecionado(null);
          } else {
            sairDoModoJogador();
          }
        }
        return;
      }
      if (evento.key === 'Escape') {
        if (controlador?.grupoSelecionado()) {
          controlador.desmarcarGrupo();
        } else if (ferramenta.tipo === 'nenhuma') {
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
    <ContextoImagens.Provider value={IMAGENS}>
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
        <button
          type="button"
          className="trava-mapa"
          aria-pressed={!mapaTravado}
          title={
            mapaTravado
              ? 'Clique para editar terreno e decorações'
              : 'Clique para travar o mapa e evitar mudanças sem querer durante o jogo'
          }
          onClick={() => setMapaTravado(!mapaTravado)}
        >
          {mapaTravado ? '🔒 Mapa travado' : '✏️ Editando o mapa'}
        </button>
        <details className="ajuda-bloco">
          <summary>Ajuda</summary>
          <dl className="ajuda">
            <dt>Colocar</dt>
            <dd>Clique em um item e use o botão esquerdo, ou arraste o item para o mapa</dd>
            <dt>Ver um hex</dt>
            <dd>Sem ferramenta (Esc), clique no hex</dd>
            <dt>Mover o grupo</dt>
            <dd>Clique no estandarte e depois num vizinho, ou arraste o estandarte até ele</dd>
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
          imagens={IMAGENS}
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
          {!mapaTravado && (
          <button
            type="button"
            aria-pressed={ferramenta.tipo === 'apagar'}
            onClick={() =>
              selecionarFerramenta(ferramenta.tipo === 'apagar' ? SEM_FERRAMENTA : BORRACHA)
            }
          >
            Borracha
          </button>
          )}
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
        {mapaTravado && (
          <p className="tela-dica">Mapa travado: terreno e decorações não mudam. Revelar, Ocultar e Grupo continuam.</p>
        )}
        {manifesto && !mapaTravado && (
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
        {passoSobMouse && <ExplicacaoDoPasso passo={passoSobMouse} />}
        <div className="topo-mapa">
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
          <BarraDoGrupo
            grupo={grupoVistoPor(grupo, agindoComoId)}
            lojaGrupo={lojaGrupo}
            viagem={regras.viagem}
            mestre={!modoJogador}
            painelAberto={painelLateral === 'grupo'}
            descansoPendente={Object.keys(grupo.descansosPendentes).some(
              (id) => membrosPresentes(grupo, contextoGrupo).includes(id) && fichas.fichas[id]?.donoId === agindoComoId,
            )}
            aoIrAteOGrupo={() => cenaRef.current?.centralizarNoGrupo()}
            aoAlternarPainel={() => {
              // O painel do grupo e o do hex ocupam o mesmo lugar: um fecha o outro.
              setHexSelecionado(null);
              setPainelLateral(painelLateral === 'grupo' ? null : 'grupo');
            }}
            avisoEleicao={avisoDaEleicao(grupo, agindoComoId, contextoGrupo)}
            avisoNoite={avisoDaNoite(grupo, agindoComoId, contextoGrupo)}
            diarioAberto={painelLateral === 'diario'}
            aoAlternarDiario={() => {
              setHexSelecionado(null);
              setPainelLateral(painelLateral === 'diario' ? null : 'diario');
            }}
          />
        </div>
        {painelLateral === 'diario' && !hexSelecionado && !modoJogador && (
          <PainelDiario
            loja={loja}
            lojaGrupo={lojaGrupo}
            participantes={campanha.participantes}
            // Metade da largura do painel, para o hex aparecer ao lado dele, e não atrás.
            aoIrAte={(coord) => cenaRef.current?.centralizarEm(coord, 190)}
            aoFechar={() => setPainelLateral(null)}
          />
        )}
        {painelLateral === 'grupo' && !hexSelecionado && (
          <PainelGrupo
            lojaGrupo={lojaGrupo}
            lojaFichas={lojaFichas}
            lojaRolagens={lojaRolagens}
            lojaCompendio={lojaCompendio}
            lojaNotificacoes={lojaNotificacoes}
            contexto={contextoGrupo}
            participantes={campanha.participantes}
            autorId={agindoComoId}
            aoFechar={() => setPainelLateral(null)}
          />
        )}
        {hexSelecionado && modoJogador && (
          <PainelHexJogador
            key={chaveHex(hexSelecionado)}
            loja={loja}
            lojaGrupo={lojaGrupo}
            participanteId={agindoComoId}
            coord={hexSelecionado}
            alcance={alcanceDoJogador}
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
          manifesto={manifesto}
          aoFechar={() => setTelaAberta(null)}
        />
      )}
      {telaAberta === 'creditos' && <TelaCreditos aoFechar={() => setTelaAberta(null)} />}
      <Notificacoes loja={lojaNotificacoes} participanteId={agindoComoId} />
    </div>
    </ContextoImagens.Provider>
    </ContextoRegras.Provider>
  );
}

/**
 * O que a barra do grupo avisa sobre a eleição do líder: quem ainda não votou é chamado a votar;
 * no empate, o mestre é chamado a decidir; os outros só sabem que há uma eleição.
 */
function avisoDaEleicao(grupo: EstadoGrupo, participanteId: string, contexto: ContextoDoGrupo): string | null {
  const { eleicao } = grupo;
  if (!eleicao) {
    return null;
  }
  if (eleicao.empatados) {
    return ehMestre(participanteId) ? '🗳️ Empate: decida o líder' : '🗳️ Eleição empatada';
  }
  const deveVotar =
    eleitores(grupo, contexto).includes(participanteId) && !(participanteId in votosValidos(grupo, contexto));
  return deveVotar ? '🗳️ Vote na eleição' : '🗳️ Eleição em andamento';
}

/**
 * O que a barra avisa sobre a noite: quem tem personagem sem ação escolhida é chamado a escolher;
 * o mestre vê quantos já escolheram; com o bloqueio, todos sabem.
 */
function avisoDaNoite(grupo: EstadoGrupo, participanteId: string, contexto: ContextoDoGrupo): string | null {
  const { noite } = grupo;
  if (!noite) {
    return null;
  }
  if (grupo.noitesBloqueadas) {
    return '🚫 Noite bloqueada pelo mestre';
  }
  const membros = membrosPresentes(grupo, contexto);
  const escolheram = quemJaEscolheu(grupo, contexto);
  if (ehMestre(participanteId)) {
    return `🌙 Noite: turno ${noite.turno} (${escolheram.length}/${membros.length} escolheram)`;
  }
  const falta = membros.some((id) => contexto.obterDonoDaFicha(id) === participanteId && !escolheram.includes(id));
  return falta ? '🌙 Noite: escolha sua ação' : `🌙 Noite: turno ${noite.turno}`;
}

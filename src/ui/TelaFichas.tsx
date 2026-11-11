import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  descansoCurto,
  descansoLongo,
  ehAcaoDeDano,
  espacosDeMagia,
  executarAcao,
  rolarTeste,
  transferirItem,
  type RolagemFeita,
} from '../core/acoesDaFicha';
import type { Calculado, Calculo } from '../core/calculadora';
import { avisosDaFicha, calcularFicha, proficienciasAutomaticas, proficienciasDaFicha } from '../core/calculoDaFicha';
import type { LojaCampanha, Participante } from '../core/campanha';
import { buscarEntradas, type EstadoCompendio, type LojaCompendio } from '../core/compendio';
import { ATRIBUTOS, type AcaoDeEntrada, type Atributo, type EntradaDe } from '../core/entradas';
import { visibilidadeDaRolagem, type LojaRolagens } from '../core/rolagens';
import {
  conferirFichas,
  ehMestre,
  fichasVisiveis,
  motivoSemEdicao,
  podeAgirNaFicha,
  podeEditarTudo,
  podeReceberPresente,
  podeVerFicha,
} from '../core/permissoes';
import { entregarKit } from '../core/kits';
import { JanelaDarKit } from './JanelaDarKit';
import { MenuDeContexto, type MenuAberto } from './MenuDeContexto';
import type { Mesa } from './mesa';
import { PainelRolagens } from './PainelRolagens';
import {
  comClasse,
  comNivel,
  comOrigem,
  criarFicha,
  entradaDaFicha,
  fichaDeMonstro,
  nivelTotal,
  pvPorNivel,
  semClasse,
  type Ficha,
  type LojaFichas,
  type TipoFicha,
} from '../core/fichas';
import { numeroNaTela } from './numeros';
import { idSalvaguarda, PREFIXO_GUIA, valoresDeViagem } from '../core/regras';
import { useRegras } from './contextoRegras';
import { CampoNumero, CampoTexto } from './camposFormulario';
import { comSinal, ExplicacaoValor, type Explicando } from './ExplicacaoValor';
import { OrganizacaoFicha } from './OrganizacaoFicha';
import { AssistenteCriacao } from './AssistenteCriacao';
import { SubidaDeNivel } from './SubidaDeNivel';
import { novaFichaEmCriacao } from '../core/criacaoDePersonagem';
import { ROTULO_TAMANHO } from './rotulosCompendio';
import { SeletorVisibilidade } from './SeletorVisibilidade';

const ROTULO_TIPO_FICHA: Readonly<Record<TipoFicha, string>> = {
  personagem: 'Personagem',
  npc: 'NPC',
  monstro: 'Monstro',
};

/** 0,25 vira "1/4", como nos livros. */
function formatarNivelDesafio(nd: number): string {
  return { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[nd] ?? numeroNaTela(nd);
}


interface TelaFichasProps {
  readonly lojaFichas: LojaFichas;
  readonly lojaCompendio: LojaCompendio;
  readonly lojaCampanha: LojaCampanha;
  readonly lojaRolagens: LojaRolagens;
  /** Quem está agindo: os jogadores veem só as fichas deles e as que o mestre mostrar. */
  readonly agindoComoId: string;
  readonly seletorAgindoComo: ReactNode;
  readonly aoFechar: () => void;
}

const ordemAlfabetica = (a: Ficha, b: Ficha) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

function resumoDaFicha(ficha: Ficha): string {
  if (ficha.tipo === 'monstro') {
    const monstro = entradaDaFicha(ficha, ficha.monstroId, 'monstro');
    return monstro ? `Monstro · ND ${formatarNivelDesafio(monstro.dados.nivelDesafio)}` : 'Monstro';
  }
  const classes = ficha.classes
    .map((c) => `${entradaDaFicha(ficha, c.entradaId, 'classe')?.nome ?? '?'} ${c.nivel}`)
    .join(' / ');
  return `${ROTULO_TIPO_FICHA[ficha.tipo]}${classes ? ` · ${classes}` : ''}`;
}

export function TelaFichas({
  lojaFichas,
  lojaCompendio,
  lojaCampanha,
  lojaRolagens,
  agindoComoId,
  seletorAgindoComo,
  aoFechar,
}: TelaFichasProps) {
  const [secreta, setSecreta] = useState(false);
  const estado = useSyncExternalStore(lojaFichas.assinar, lojaFichas.obterEstado);
  const compendio = useSyncExternalStore(lojaCompendio.assinar, lojaCompendio.obterEstado);
  const campanha = useSyncExternalStore(lojaCampanha.assinar, lojaCampanha.obterEstado);
  const podeDesfazer = useSyncExternalStore(lojaFichas.assinar, lojaFichas.podeDesfazer);
  const podeRefazer = useSyncExternalStore(lojaFichas.assinar, lojaFichas.podeRefazer);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [monstroEscolhido, setMonstroEscolhido] = useState('');
  const [dandoKit, setDandoKit] = useState(false);

  const mestre = ehMestre(agindoComoId);
  const regras = useRegras();
  const podeCriarComAssistente = mestre || regras.criacao.jogadoresCriam;
  // O jogador recebe só as fichas que pode ver: as outras nem chegam à tela.
  const fichas = useMemo(() => fichasVisiveis(estado, agindoComoId).sort(ordemAlfabetica), [estado, agindoComoId]);
  const monstros = useMemo(() => buscarEntradas(compendio, { tipos: ['monstro'] }) as EntradaDe<'monstro'>[], [compendio]);
  const candidata = selecionadaId ? estado.fichas[selecionadaId] : undefined;
  const selecionada = candidata && podeVerFicha(candidata, agindoComoId) ? candidata : undefined;
  /** Quem pode receber presentes de quem está agindo. */
  const destinos = useMemo(
    () => Object.values(estado.fichas).filter((f) => podeReceberPresente(f, agindoComoId)).sort(ordemAlfabetica),
    [estado, agindoComoId],
  );

  const criar = (tipo: Exclude<TipoFicha, 'monstro'>) => {
    const ficha = { ...criarFicha(tipo, crypto.randomUUID()), nome: tipo === 'personagem' ? 'Novo personagem' : 'Novo NPC' };
    lojaFichas.despachar({ tipo: 'CriarFicha', ficha });
    setSelecionadaId(ficha.id);
  };

  /** Começa um personagem pelo assistente: a ficha nasce "em criação", do participante que está agindo. */
  const criarComAssistente = () => {
    const ficha = novaFichaEmCriacao(crypto.randomUUID(), agindoComoId, regras.criacao);
    lojaFichas.despachar({ tipo: 'CriarFicha', ficha });
    if (lojaFichas.obterEstado().fichas[ficha.id]) {
      setSelecionadaId(ficha.id);
    }
  };

  const criarMonstro = () => {
    const monstro = monstros.find((m) => m.id === monstroEscolhido);
    if (monstro) {
      const ficha = fichaDeMonstro(monstro, crypto.randomUUID());
      lojaFichas.despachar({ tipo: 'CriarFicha', ficha });
      setSelecionadaId(ficha.id);
    }
  };

  return (
    <div className="tela-sobreposta" role="dialog" aria-label="Fichas">
      {dandoKit && mestre && (
        <JanelaDarKit
          compendio={compendio}
          fichas={fichas}
          aoFechar={() => setDandoKit(false)}
          aoDar={(kitId, fichaIds) => {
            const kit = compendio.entradas[kitId];
            if (kit?.tipo !== 'kit') {
              return [];
            }
            const faltando = new Set<string>();
            const novas = fichaIds.flatMap((id) => {
              const ficha = estado.fichas[id];
              if (!ficha) {
                return [];
              }
              const entregue = entregarKit(ficha, kit, compendio);
              entregue.faltando.forEach((f) => faltando.add(f));
              return [entregue.ficha];
            });
            // Todas as fichas numa ação só: um único passo de desfazer.
            lojaFichas.despachar({ tipo: 'EditarFichas', fichas: novas });
            return [...faltando];
          }}
        />
      )}
      <header className="tela-cabecalho">
        <h1>Fichas</h1>
        <div className="tela-cabecalho-acoes">
          <button type="button" disabled={!podeDesfazer} onClick={lojaFichas.desfazer} title="Ctrl+Z">
            Desfazer
          </button>
          <button type="button" disabled={!podeRefazer} onClick={lojaFichas.refazer} title="Ctrl+Y">
            Refazer
          </button>
        </div>
        {seletorAgindoComo}
        <button type="button" className="tela-fechar" onClick={aoFechar}>
          Voltar ao mapa
        </button>
      </header>
      <div className="compendio-corpo">
        <aside className="compendio-lista">
          {podeCriarComAssistente && (
            <div className="compendio-novo">
              <button type="button" className="assistente-criar" onClick={criarComAssistente}>
                + Criar personagem (assistente)
              </button>
            </div>
          )}
          {!mestre && <p className="tela-dica">Aqui ficam as suas fichas e as que o mestre mostrar a você.</p>}
          {mestre && (
          <>
          <div className="compendio-novo">
            <button type="button" onClick={() => criar('personagem')}>
              + Personagem
            </button>
            <button type="button" onClick={() => criar('npc')}>
              + NPC
            </button>
          </div>
          <div className="compendio-novo">
            <select
              aria-label="Monstro do compêndio"
              value={monstroEscolhido}
              onChange={(e) => setMonstroEscolhido(e.target.value)}
            >
              <option value="">{monstros.length > 0 ? 'Monstro do compêndio…' : 'Nenhum monstro no compêndio'}</option>
              {monstros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome || '(sem nome)'}
                </option>
              ))}
            </select>
            <button type="button" disabled={!monstroEscolhido} onClick={criarMonstro}>
              + Monstro
            </button>
          </div>
          <div className="compendio-novo">
            <button type="button" title="Entrega os itens de um kit, separados, a uma ou mais fichas" onClick={() => setDandoKit(true)}>
              Dar kit…
            </button>
          </div>
          </>
          )}
          <p className="tela-dica">{fichas.length === 1 ? '1 ficha' : `${fichas.length} fichas`}</p>
          <ul>
            {fichas.map((ficha) => (
              <li key={ficha.id}>
                <button
                  type="button"
                  aria-current={ficha.id === selecionadaId}
                  onClick={() => setSelecionadaId(ficha.id)}
                >
                  <span>{ficha.nome || '(sem nome)'}</span>
                  <small>{ficha.emCriacao ? 'Em criação' : resumoDaFicha(ficha)}</small>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <main className="compendio-editor">
          {selecionada && selecionada.emCriacao && podeEditarTudo(selecionada, agindoComoId) ? (
            <AssistenteCriacao
              key={selecionada.id}
              ficha={selecionada}
              compendio={compendio}
              autorId={agindoComoId}
              participantes={campanha.participantes}
              editar={(nova, campo) => {
                const antes = lojaFichas.obterEstado();
                const permissao = conferirFichas(antes, { fichas: { ...antes.fichas, [nova.id]: nova } }, agindoComoId, {
                  jogadoresCriam: regras.criacao.jogadoresCriam,
                });
                if (permissao.ok) {
                  lojaFichas.despachar({ tipo: 'EditarFicha', ficha: nova }, `${nova.id}:${campo}`);
                }
              }}
              registrarRolagens={(feitas) =>
                feitas.forEach((feita) =>
                  lojaRolagens.registrar({
                    autorId: agindoComoId,
                    fichaId: selecionada.id,
                    quem: selecionada.nome || 'Novo personagem',
                    rotulo: feita.rotulo,
                    formula: feita.formula,
                    dados: feita.rolagem.dados,
                    total: feita.rolagem.total,
                    // A rolagem de atributos é sempre pública, como numa mesa de verdade.
                    visibilidade: visibilidadeDaRolagem(false, agindoComoId),
                  }),
                )
              }
              aoDesistir={() => {
                lojaFichas.despachar({ tipo: 'RemoverFicha', fichaId: selecionada.id });
                setSelecionadaId(null);
              }}
            />
          ) : selecionada ? (
            <EditorFicha
              key={selecionada.id}
              ficha={selecionada}
              compendio={compendio}
              participantes={campanha.participantes}
              lojaFichas={lojaFichas}
              lojaRolagens={lojaRolagens}
              autorId={agindoComoId}
              secreta={secreta}
              outras={destinos.filter((f) => f.id !== selecionada.id)}
              aoApagar={() => setSelecionadaId(null)}
            />
          ) : (
            <p className="tela-dica">
              {mestre
                ? 'Escolha uma ficha na lista ou crie uma nova. Classes, espécies e monstros vêm do compêndio: importe o SRD 5.1 lá, se ainda não importou.'
                : fichas.length > 0
                  ? 'Escolha uma ficha na lista.'
                  : 'Você ainda não tem fichas. O mestre cria a ficha e a passa para você em "Controlada por".'}
            </p>
          )}
        </main>
        <PainelRolagens lojaRolagens={lojaRolagens} agindoComoId={agindoComoId} secreta={secreta} aoMudarSecreta={setSecreta} />
      </div>
    </div>
  );
}

interface EditorFichaProps {
  readonly ficha: Ficha;
  readonly compendio: EstadoCompendio;
  readonly participantes: readonly Participante[];
  readonly lojaFichas: LojaFichas;
  readonly lojaRolagens: LojaRolagens;
  readonly autorId: string;
  readonly secreta: boolean;
  /** As outras fichas da campanha, que podem receber presentes. */
  readonly outras: readonly Ficha[];
  readonly aoApagar: () => void;
}

function EditorFicha({ ficha, compendio, participantes, lojaFichas, lojaRolagens, autorId, secreta, outras, aoApagar }: EditorFichaProps) {
  const sessaoDeFoco = useRef(0);
  const [explicando, setExplicando] = useState<Explicando | null>(null);
  const [classeEscolhida, setClasseEscolhida] = useState('');
  const [menu, setMenu] = useState<MenuAberto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [presenteando, setPresenteando] = useState<string | null>(null);
  const [subindo, setSubindo] = useState(false);
  // As regras da campanha: mudá-las recalcula a ficha na hora.
  const REGRAS = useRegras();
  const calculo = useMemo(() => calcularFicha(ficha, REGRAS), [ficha, REGRAS]);
  const fecharExplicacao = useCallback(() => setExplicando(null), []);
  const fecharMenu = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!aviso) {
      return;
    }
    const temporizador = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(temporizador);
  }, [aviso]);

  const mestre = ehMestre(autorId);
  const podeAgir = podeAgirNaFicha(ficha, autorId);
  const tudo = podeEditarTudo(ficha, autorId);
  const motivo = motivoSemEdicao(ficha, autorId);

  /** Confere a permissão antes de mudar, para explicar aqui mesmo por que não deu. */
  const permitido = (novas: readonly Ficha[]) => {
    const antes = lojaFichas.obterEstado();
    const depois = { fichas: { ...antes.fichas, ...Object.fromEntries(novas.map((f) => [f.id, f])) } };
    const permissao = conferirFichas(antes, depois, autorId);
    if (!permissao.ok) {
      setAviso(permissao.motivo);
    }
    return permissao.ok;
  };

  const editar = (nova: Ficha, campo: string) => {
    if (permitido([nova])) {
      lojaFichas.despachar({ tipo: 'EditarFicha', ficha: nova }, `${ficha.id}:${campo}:${sessaoDeFoco.current}`);
    }
  };

  const explicar = (alvo: HTMLElement, rotulo: string, calculado: Calculado, nota?: string) => {
    const caixa = alvo.getBoundingClientRect();
    setExplicando({ rotulo, calculado, nota, x: caixa.left, y: caixa.bottom });
  };

  const registrar = (feitas: readonly RolagemFeita[]) => {
    for (const feita of feitas) {
      lojaRolagens.registrar({
        autorId,
        fichaId: ficha.id,
        quem: ficha.nome || 'Sem nome',
        rotulo: feita.rotulo,
        formula: feita.formula,
        dados: feita.rolagem.dados,
        total: feita.rolagem.total,
        visibilidade: visibilidadeDaRolagem(secreta, autorId),
      });
    }
  };

  const mesa: Mesa = {
    calculo,
    rolar: (termo, rotulo, modo = 'normal') => {
      const resultado = rolarTeste(calculo, termo, rotulo, modo);
      if (resultado.ok) {
        registrar([resultado.feita]);
      } else {
        setAviso(resultado.erro);
      }
    },
    menu: (evento, titulo, itens) => {
      evento.preventDefault();
      setMenu({ x: evento.clientX, y: evento.clientY, titulo, itens });
    },
    fazer: (resultado) => {
      if (!resultado.ok) {
        setAviso(resultado.erro);
        return;
      }
      if (resultado.ficha !== ficha) {
        editar(resultado.ficha, `acao-${crypto.randomUUID()}`);
      }
      registrar(resultado.rolagens);
    },
    presentear: setPresenteando,
    temOutrasFichas: outras.length > 0,
    explicar,
    podeAgir,
    podeEditarTudo: tudo,
    motivo,
  };

  const monstro = entradaDaFicha(ficha, ficha.monstroId, 'monstro');
  const daLista = (tipo: 'classe' | 'especie' | 'antecedente') => buscarEntradas(compendio, { tipos: [tipo] });

  return (
    <div
      className="ficha"
      onFocus={() => {
        sessaoDeFoco.current += 1;
      }}
    >
      <div className="editor-entrada-topo">
        <div>
          <h2>{ficha.nome || '(sem nome)'}</h2>
          <p className="tela-dica">
            {ROTULO_TIPO_FICHA[ficha.tipo]}
            {ficha.tipo !== 'monstro' && ` · nível ${Math.max(1, nivelTotal(ficha))}`}
          </p>
        </div>
        <div className="tela-cabecalho-acoes">
          {mestre && ficha.tipo !== 'monstro' && (
            <button
              type="button"
              title="Deixa o dono subir um nível pelo assistente"
              disabled={nivelTotal(ficha) + ficha.niveisLiberados >= 20}
              onClick={() => editar({ ...ficha, niveisLiberados: ficha.niveisLiberados + 1 }, `liberar-nivel-${crypto.randomUUID()}`)}
            >
              Liberar 1 nível{ficha.niveisLiberados > 0 ? ` (${ficha.niveisLiberados} liberado${ficha.niveisLiberados === 1 ? '' : 's'})` : ''}
            </button>
          )}
          {ficha.tipo !== 'monstro' && (mestre || (podeAgir && ficha.niveisLiberados > 0)) && (
            <button
              type="button"
              className={ficha.niveisLiberados > 0 ? 'ficha-subir' : undefined}
              disabled={nivelTotal(ficha) >= 20 || ficha.classes.length === 0}
              title={ficha.classes.length === 0 ? 'A ficha precisa de uma classe.' : 'Escolher a classe, os PV e o que mais o nível novo traz'}
              onClick={() => setSubindo(true)}
            >
              Subir de nível
            </button>
          )}
          <button
            type="button"
            disabled={!podeAgir}
            title="Voltam os usos de habilidades que recarregam no descanso curto"
            onClick={() => editar(descansoCurto(ficha), `descanso-${crypto.randomUUID()}`)}
          >
            Descanso curto
          </button>
          <button
            type="button"
            disabled={!podeAgir}
            title="Voltam todos os usos, os espaços de magia e os PV"
            onClick={() => editar(descansoLongo(ficha), `descanso-${crypto.randomUUID()}`)}
          >
            Descanso longo
          </button>
          {mestre && (
            <button
              type="button"
              onClick={() => {
                lojaFichas.despachar({ tipo: 'RemoverFicha', fichaId: ficha.id });
                aoApagar();
              }}
            >
              Apagar
            </button>
          )}
        </div>
      </div>
      {aviso && (
        <p className="mensagem-erro" role="alert">
          {aviso}
        </p>
      )}
      {!podeAgir && <p className="tela-dica">Esta ficha é de outro participante: você só pode olhar.</p>}
      {podeAgir && !tudo && (
        <p className="tela-dica">
          Atributos, classes, proficiências e itens novos ficam com o mestre; ele pode liberar a edição desta ficha.
        </p>
      )}

      <div className="formulario">
        <CampoTexto
          rotulo="Nome"
          valor={ficha.nome}
          desativado={!podeAgir}
          motivo={motivo}
          aoMudar={(nome) => editar({ ...ficha, nome }, 'nome')}
        />
        <label className="campo" title={mestre ? undefined : 'Só o mestre muda quem controla a ficha.'}>
          <span>Controlada por</span>
          <select value={ficha.donoId} disabled={!mestre} onChange={(e) => editar({ ...ficha, donoId: e.target.value }, 'dono')}>
            {!participantes.some((p) => p.id === ficha.donoId) && <option value={ficha.donoId}>(participante removido)</option>}
            {participantes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome || 'Sem nome'}
              </option>
            ))}
          </select>
        </label>
        {mestre && (
          <>
            <SeletorVisibilidade
              rotulo="Quem mais vê"
              rotuloRestrito="Só o dono e o mestre"
              valor={ficha.visibilidade}
              participantes={participantes}
              aoMudar={(visibilidade) => editar({ ...ficha, visibilidade }, `visibilidade-${crypto.randomUUID()}`)}
            />
            <label
              className="campo-marcar"
              title="Sem a liberação, o dono muda nome, notas, PV, usos, moedas e o que carrega, mas não atributos, classes, proficiências nem itens novos"
            >
              <input
                type="checkbox"
                checked={ficha.edicaoLiberada}
                onChange={(e) => editar({ ...ficha, edicaoLiberada: e.target.checked }, `liberar-${crypto.randomUUID()}`)}
              />
              Edição liberada para o dono
            </label>
          </>
        )}

        {ficha.tipo !== 'monstro' && (
          // Um fieldset desativado desativa todos os campos de dentro.
          <fieldset className="grupo-transparente" disabled={!tudo} title={motivo ?? undefined}>
            <SeletorOrigem
              rotulo="Espécie"
              atual={entradaDaFicha(ficha, ficha.especieId, 'especie')}
              opcoes={daLista('especie')}
              aoMudar={(id) => editar(comOrigem(ficha, compendio, 'especieId', id), 'especie')}
            />
            <SeletorOrigem
              rotulo="Antecedente"
              atual={entradaDaFicha(ficha, ficha.antecedenteId, 'antecedente')}
              opcoes={daLista('antecedente')}
              aoMudar={(id) => editar(comOrigem(ficha, compendio, 'antecedenteId', id), 'antecedente')}
            />
            <fieldset className="campo-largo editor-lista">
              <span>Classes (a primeira dá o dado de vida cheio e as salvaguardas)</span>
              {ficha.classes.map((c) => {
                const classe = entradaDaFicha(ficha, c.entradaId, 'classe');
                return (
                  <div key={c.entradaId} className="editor-lista-item">
                    <div className="editor-lista-campos">
                      <p className="ficha-classe-nome">
                        {classe?.nome ?? '?'} <small>d{classe?.dados.dadoVida}</small>
                      </p>
                      <CampoNumero
                        rotulo="Nível"
                        inteiro
                        minimo={1}
                        maximo={20}
                        valor={c.nivel}
                        aoMudar={(nivel) => nivel !== null && editar(comNivel(ficha, c.entradaId, nivel), `nivel-${c.entradaId}`)}
                      />
                    </div>
                    <button type="button" onClick={() => editar(semClasse(ficha, c.entradaId), 'classe')}>
                      Remover
                    </button>
                  </div>
                );
              })}
              <div className="compendio-novo">
                <select aria-label="Classe para acrescentar" value={classeEscolhida} onChange={(e) => setClasseEscolhida(e.target.value)}>
                  <option value="">{daLista('classe').length > 0 ? 'Escolha uma classe…' : 'Nenhuma classe no compêndio'}</option>
                  {daLista('classe')
                    .filter((c) => !ficha.classes.some((fc) => fc.entradaId === c.id))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome || '(sem nome)'}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  disabled={!classeEscolhida || nivelTotal(ficha) >= 20}
                  onClick={() => {
                    editar(comClasse(ficha, compendio, classeEscolhida), 'classe');
                    setClasseEscolhida('');
                  }}
                >
                  + Classe
                </button>
              </div>
            </fieldset>
          </fieldset>
        )}
        {monstro && <ResumoMonstro monstro={monstro} ficha={ficha} mesa={mesa} />}
      </div>

      <BlocoAtributos ficha={ficha} calculo={calculo} editar={editar} explicar={explicar} mesa={mesa} />
      <BlocoCombate ficha={ficha} calculo={calculo} editar={editar} explicar={explicar} mesa={mesa} />
      <BlocoEspacos ficha={ficha} calculo={calculo} editar={editar} podeAgir={podeAgir} />
      <BlocoTestes ficha={ficha} calculo={calculo} editar={editar} explicar={explicar} mesa={mesa} />
      {ficha.tipo !== 'monstro' && <BlocoViagem calculo={calculo} explicar={explicar} />}
      {ficha.tipo !== 'monstro' && (
        <fieldset className="grupo-transparente" disabled={!tudo} title={motivo ?? undefined}>
          <BlocoDadosDeVida ficha={ficha} editar={editar} />
        </fieldset>
      )}
      <OrganizacaoFicha ficha={ficha} compendio={compendio} calculo={calculo} regras={REGRAS} editar={editar} mesa={mesa} />

      {explicando && <ExplicacaoValor explicando={explicando} aoFechar={fecharExplicacao} />}
      {menu && <MenuDeContexto menu={menu} aoFechar={fecharMenu} />}
      {subindo && (
        <SubidaDeNivel
          ficha={ficha}
          compendio={compendio}
          autorId={autorId}
          registrarRolagens={registrar}
          aoFechar={() => setSubindo(false)}
          aoConfirmar={(nova) => {
            editar(nova, `subida-${crypto.randomUUID()}`);
            setSubindo(false);
          }}
        />
      )}
      {podeAgir && !mestre && ficha.niveisLiberados > 0 && (
        <p className="mensagem-info">
          O mestre liberou {ficha.niveisLiberados === 1 ? 'um nível' : `${ficha.niveisLiberados} níveis`}: use "Subir de nível".
        </p>
      )}
      {presenteando && (
        <JanelaPresentear
          ficha={ficha}
          pilhaId={presenteando}
          outras={outras}
          aoFechar={() => setPresenteando(null)}
          aoConfirmar={(destino, quantidade) => {
            const resultado = transferirItem(ficha, destino, presenteando, quantidade);
            if (resultado && permitido(resultado)) {
              lojaFichas.despachar({ tipo: 'EditarFichas', fichas: resultado });
            }
            setPresenteando(null);
          }}
        />
      )}
    </div>
  );
}

/** Escolher quem recebe o presente e quantas unidades. */
function JanelaPresentear({
  ficha,
  pilhaId,
  outras,
  aoFechar,
  aoConfirmar,
}: {
  readonly ficha: Ficha;
  readonly pilhaId: string;
  readonly outras: readonly Ficha[];
  readonly aoFechar: () => void;
  readonly aoConfirmar: (destino: Ficha, quantidade: number) => void;
}) {
  const pilha = ficha.itens.find((p) => p.id === pilhaId);
  const item = pilha ? entradaDaFicha(ficha, pilha.entradaId, 'item') : null;
  const [destinoId, setDestinoId] = useState(outras[0]?.id ?? '');
  const [quantidade, setQuantidade] = useState(pilha?.quantidade ?? 1);
  if (!pilha || !item) {
    return null;
  }
  const destino = outras.find((f) => f.id === destinoId);
  return (
    <div className="janela-fundo" role="dialog" aria-label="Presentear">
      <div className="janela">
        <h3>Presentear: {item.nome}</h3>
        <label className="campo">
          <span>Para</span>
          <select value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
            {outras.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome || '(sem nome)'}
              </option>
            ))}
          </select>
        </label>
        {pilha.quantidade > 1 && (
          <CampoNumero
            rotulo={`Quantas (de ${pilha.quantidade})`}
            inteiro
            minimo={1}
            maximo={pilha.quantidade}
            valor={quantidade}
            aoMudar={(v) => v !== null && setQuantidade(v)}
          />
        )}
        <div className="tela-cabecalho-acoes">
          <button type="button" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" disabled={!destino} onClick={() => destino && aoConfirmar(destino, quantidade)}>
            Presentear
          </button>
        </div>
      </div>
    </div>
  );
}

/** Os espaços de magia, quando a ficha conjura: gastos ao conjurar, de volta no descanso longo. */
function BlocoEspacos({ ficha, calculo, editar, podeAgir }: Pick<PropsBloco, 'ficha' | 'calculo' | 'editar'> & { readonly podeAgir: boolean }) {
  const espacos = espacosDeMagia(ficha, calculo).filter((e) => e.maximo > 0);
  if (espacos.length === 0) {
    return null;
  }
  const ajustar = (nivel: number, gastos: number) => {
    const lista = [...ficha.espacosGastos];
    lista[nivel - 1] = Math.max(0, gastos);
    editar({ ...ficha, espacosGastos: lista }, `espaco-${crypto.randomUUID()}`);
  };
  return (
    <section className="ficha-secao">
      <h3>Espaços de magia</h3>
      <div className="ficha-espacos">
        {espacos.map((e) => {
          const restantes = Math.max(0, e.maximo - e.gastos);
          return (
            <div key={e.nivel} className="ficha-espaco">
              <span>{e.nivel}º</span>
              <span className="ficha-bolinhas" aria-label={`${restantes} de ${e.maximo}`}>
                {Array.from({ length: e.maximo }, (_, i) => (i < restantes ? '●' : '○')).join('')}
              </span>
              <button type="button" title="Gastar um" disabled={!podeAgir || restantes === 0} onClick={() => ajustar(e.nivel, e.gastos + 1)}>
                −
              </button>
              <button type="button" title="Recuperar um" disabled={!podeAgir || e.gastos === 0} onClick={() => ajustar(e.nivel, e.gastos - 1)}>
                +
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SeletorOrigem<T extends 'especie' | 'antecedente'>({
  rotulo,
  atual,
  opcoes,
  aoMudar,
}: {
  readonly rotulo: string;
  readonly atual: EntradaDe<T> | null;
  readonly opcoes: readonly { readonly id: string; readonly nome: string }[];
  readonly aoMudar: (id: string | null) => void;
}) {
  return (
    <label className="campo">
      <span>{rotulo}</span>
      <select value={atual?.id ?? ''} onChange={(e) => aoMudar(e.target.value || null)}>
        <option value="">Nenhum(a)</option>
        {/* A cópia da ficha continua valendo mesmo se a entrada sumir do compêndio. */}
        {atual && !opcoes.some((o) => o.id === atual.id) && <option value={atual.id}>{atual.nome} (cópia da ficha)</option>}
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome || '(sem nome)'}
          </option>
        ))}
      </select>
    </label>
  );
}

interface PropsBloco {
  readonly ficha: Ficha;
  readonly calculo: Calculo;
  readonly editar: (nova: Ficha, campo: string) => void;
  readonly explicar: (alvo: HTMLElement, rotulo: string, calculado: Calculado, nota?: string) => void;
  readonly mesa: Mesa;
}

/**
 * Um número da ficha. Num teste (perícia, salvaguarda, atributo), o clique rola o d20 e o botão
 * direito abre o menu com vantagem, desvantagem e a explicação. Nos outros, o clique explica.
 */
function Valor({
  calculado,
  rotulo,
  explicar,
  sinal = false,
  nota,
  rolar,
}: {
  readonly calculado: Calculado;
  readonly rotulo: string;
  readonly explicar: PropsBloco['explicar'];
  readonly sinal?: boolean;
  readonly nota?: string;
  /** Torna o número um teste: o que soma ao d20 e a mesa que rola. */
  readonly rolar?: { readonly termo: string; readonly mesa: Mesa };
}) {
  const texto = calculado.ok ? (sinal ? comSinal(calculado.valor) : numeroNaTela(calculado.valor)) : '—';
  const mudou = calculado.ok && calculado.ajustes.some((a) => a.aplicado);
  // Quem só olha a ficha não rola: o clique só explica o número.
  const rolavel = rolar !== undefined && calculado.ok && rolar.mesa.podeAgir;
  const classe = [mudou ? 'ficha-valor ficha-valor-alterado' : 'ficha-valor', rolavel ? 'ficha-valor-rolavel' : ''].join(' ');
  if (!rolavel) {
    return (
      <button
        type="button"
        className={classe}
        title={calculado.ok ? 'De onde vem este número?' : calculado.erro}
        onClick={(e) => explicar(e.currentTarget, rotulo, calculado, nota)}
      >
        {texto}
      </button>
    );
  }
  const { termo, mesa } = rolar;
  return (
    <button
      type="button"
      className={classe}
      title={`Rolar ${rotulo}. Botão direito: vantagem, desvantagem e de onde vem o número.`}
      onClick={() => mesa.rolar(termo, rotulo)}
      onContextMenu={(e) => {
        const alvo = e.currentTarget;
        mesa.menu(e, rotulo, [
          { rotulo: 'Rolar', aoEscolher: () => mesa.rolar(termo, rotulo) },
          { rotulo: 'Rolar com vantagem', aoEscolher: () => mesa.rolar(termo, rotulo, 'vantagem') },
          { rotulo: 'Rolar com desvantagem', aoEscolher: () => mesa.rolar(termo, rotulo, 'desvantagem') },
          { rotulo: 'De onde vem este número?', separar: true, aoEscolher: () => explicar(alvo, rotulo, calculado, nota) },
        ]);
      }}
    >
      {texto}
    </button>
  );
}

function BlocoAtributos({ ficha, calculo, editar, explicar, mesa }: PropsBloco) {
  const REGRAS = useRegras();
  return (
    <section className="ficha-secao">
      <h3>Atributos</h3>
      <div className="ficha-atributos">
        {ATRIBUTOS.map((atributo) => {
          const nome = REGRAS.atributos[atributo];
          return (
            <div key={atributo} className="ficha-atributo">
              <span>{nome}</span>
              <Valor
                calculado={calculo.modificador(atributo)}
                rotulo={`Teste de ${nome}`}
                explicar={explicar}
                sinal
                rolar={{ termo: `mod(${atributo.toUpperCase()})`, mesa }}
              />
              <Valor calculado={calculo.valor(atributo)} rotulo={nome} explicar={explicar} />
              <CampoNumero
                rotulo="Valor escolhido"
                inteiro
                minimo={1}
                maximo={30}
                valor={ficha.atributos[atributo]}
                desativado={!mesa.podeEditarTudo}
                motivo={mesa.motivo}
                aoMudar={(v) => v !== null && editar({ ...ficha, atributos: { ...ficha.atributos, [atributo]: v } }, `atributo-${atributo}`)}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BlocoCombate({ ficha, calculo, editar, explicar, mesa }: PropsBloco) {
  const pvMaximos = calculo.valor('pv_maximos');
  const maximo = pvMaximos.ok ? pvMaximos.valor : null;
  const avisos = avisosDaFicha(ficha, calculo);
  // Todos os valores das regras, na ordem delas. PV máximos e capacidade de carga têm lugar próprio.
  const REGRAS = useRegras();
  const valores = REGRAS.valores.map((v) => v.id).filter((id) => id !== 'pv_maximos' && id !== 'capacidade_carga');
  const comSinalNoValor = new Set(['iniciativa', 'prof', 'ataque_magico']);
  return (
    <section className="ficha-secao">
      <h3>Combate</h3>
      {avisos.length > 0 && (
        <ul className="ficha-avisos">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      )}
      <div className="ficha-combate">
        {valores.map((id) => {
          const calculado = calculo.valor(id);
          // Quem não conjura não precisa ver CD nem ataque mágico.
          if (!calculado.ok && (id === 'cd_magia' || id === 'ataque_magico')) {
            return null;
          }
          return (
            <div key={id} className="ficha-caixa">
              <span>{calculo.rotulo(id)}</span>
              <Valor
                calculado={calculado}
                rotulo={calculo.rotulo(id)}
                explicar={explicar}
                sinal={comSinalNoValor.has(id)}
                rolar={id === 'iniciativa' ? { termo: 'iniciativa', mesa } : undefined}
              />
            </div>
          );
        })}
        <div className="ficha-caixa ficha-pv">
          <span>Pontos de vida</span>
          <div>
            <CampoNumero
              rotulo="Atuais"
              inteiro
              valor={ficha.pvAtuais ?? maximo}
              vazioPermitido
              desativado={!mesa.podeAgir}
              motivo={mesa.motivo}
              aoMudar={(v) => editar({ ...ficha, pvAtuais: v === null || v === maximo ? null : v }, 'pvAtuais')}
            />
            <span className="ficha-pv-barra">/</span>
            <Valor calculado={pvMaximos} rotulo="Pontos de vida máximos" explicar={explicar} />
          </div>
          <CampoNumero
            rotulo="Temporários"
            inteiro
            minimo={0}
            valor={ficha.pvTemporarios}
            desativado={!mesa.podeAgir}
            motivo={mesa.motivo}
            aoMudar={(v) => v !== null && editar({ ...ficha, pvTemporarios: v }, 'pvTemporarios')}
          />
        </div>
      </div>
    </section>
  );
}

/**
 * O que a ficha leva para a viagem no mapa: velocidade, visão, veículos e guias.
 * Veículos e guias só aparecem quando a ficha tem algum, para não encher a ficha de zeros.
 */
function BlocoViagem({ calculo, explicar }: Pick<PropsBloco, 'calculo' | 'explicar'>) {
  const REGRAS = useRegras();
  const valorDe = (id: string) => {
    const c = calculo.valor(id);
    return c.ok ? c.valor : null;
  };
  const visiveis = valoresDeViagem(REGRAS).filter(({ id, padrao }) => {
    if (id === 'fator_viagem' || id === 'visao_hexes') {
      return true;
    }
    if (id.startsWith(PREFIXO_GUIA)) {
      return (valorDe(id) ?? 0) >= 1;
    }
    // Um veículo aparece inteiro (lugares e velocidade) quando a ficha tem lugares nele.
    const lugares = id.replace(/_fator$/, '_lugares');
    return (valorDe(lugares) ?? 0) > 0 || valorDe(id) !== padrao;
  });
  return (
    <section className="ficha-secao">
      <h3>Viagem</h3>
      <div className="ficha-combate">
        {visiveis.map(({ id }) => (
          <div key={id} className="ficha-caixa">
            <span>{calculo.rotulo(id)}</span>
            <Valor calculado={calculo.valor(id)} rotulo={calculo.rotulo(id)} explicar={explicar} />
          </div>
        ))}
      </div>
    </section>
  );
}

const MARCADOR: Readonly<Record<string, string>> = { '0': '○', '0.5': '◐', '1': '●', '2': '◉' };
const NOME_MULTIPLICADOR: Readonly<Record<string, string>> = {
  '0': 'sem proficiência',
  '0.5': 'metade da proficiência',
  '1': 'proficiente',
  '2': 'especialista',
};

function BlocoTestes({ ficha, calculo, editar, explicar, mesa }: PropsBloco) {
  const REGRAS = useRegras();
  const automaticas = proficienciasAutomaticas(ficha, REGRAS);
  const todas = proficienciasDaFicha(ficha, REGRAS);
  // Monstros já trazem os bônus prontos: os marcadores não mudariam nada.
  const marcavel = ficha.tipo !== 'monstro' && mesa.podeEditarTudo;

  /** Alterna entre sem, proficiente e especialista. Voltar ao valor automático tira a marcação. */
  const alternar = (id: string) => {
    const atual = todas[id]?.valor ?? 0;
    const proximo = atual >= 2 ? 0 : atual >= 1 ? 2 : 1;
    const proficiencias = { ...ficha.proficiencias };
    if ((automaticas[id]?.valor ?? 0) === proximo) {
      delete proficiencias[id];
    } else {
      proficiencias[id] = proximo;
    }
    // Cada clique é um passo de desfazer próprio, mesmo sem o foco sair do botão.
    editar({ ...ficha, proficiencias }, `proficiencia-${id}-${crypto.randomUUID()}`);
  };

  const linha = (id: string, nome: string, sigla: string) => {
    const proficiencia = todas[id];
    const valor = proficiencia?.valor ?? 0;
    const nota = `${NOME_MULTIPLICADOR[String(valor)]}${proficiencia ? ` (${proficiencia.origem})` : ''}`;
    return (
      <li key={id}>
        <button
          type="button"
          className="ficha-marcador"
          disabled={!marcavel}
          title={marcavel ? `${nota}. Clique para mudar.` : ficha.tipo === 'monstro' || !mesa.motivo ? nota : `${nota}. ${mesa.motivo}`}
          aria-label={`${nome}: ${nota}`}
          onClick={() => alternar(id)}
        >
          {MARCADOR[String(valor)]}
        </button>
        <span>
          {nome} <small>{sigla}</small>
        </span>
        <Valor
          calculado={calculo.valor(id)}
          rotulo={id.startsWith('salvaguarda_') ? `Salvaguarda de ${nome}` : nome}
          explicar={explicar}
          sinal
          nota={`Proficiência: ${nota}.`}
          rolar={{ termo: id, mesa }}
        />
      </li>
    );
  };

  return (
    <section className="ficha-secao ficha-testes">
      <div>
        <h3>Salvaguardas</h3>
        <ul className="ficha-lista-testes">
          {ATRIBUTOS.map((a: Atributo) => linha(idSalvaguarda(a), REGRAS.atributos[a], a.toUpperCase()))}
        </ul>
      </div>
      <div>
        <h3>Perícias</h3>
        <ul className="ficha-lista-testes">
          {REGRAS.pericias.map((p) => linha(p.id, p.nome, p.atributo.toUpperCase()))}
        </ul>
      </div>
    </section>
  );
}

function BlocoDadosDeVida({ ficha, editar }: { readonly ficha: Ficha; readonly editar: PropsBloco['editar'] }) {
  const niveis = pvPorNivel(ficha);
  if (niveis.length === 0) {
    return null;
  }
  return (
    <details className="ficha-secao ajuda-bloco">
      <summary>Dados de vida por nível (vazio usa a média)</summary>
      <div className="ficha-dados-vida">
        {niveis.map((n, i) => (
          <CampoNumero
            key={i}
            rotulo={`Nível ${i + 1} (d${n.dado})${n.rolado ? '' : `: ${n.valor}`}`}
            inteiro
            minimo={1}
            maximo={n.dado}
            vazioPermitido
            valor={ficha.pvPorNivel[i] ?? null}
            aoMudar={(v) => {
              const lista = [...ficha.pvPorNivel];
              while (lista.length <= i) {
                lista.push(null);
              }
              lista[i] = v;
              while (lista.length > 0 && lista[lista.length - 1] === null) {
                lista.pop();
              }
              editar({ ...ficha, pvPorNivel: lista }, `pv-${i}`);
            }}
          />
        ))}
      </div>
    </details>
  );
}

function ResumoMonstro({
  monstro,
  ficha,
  mesa,
}: {
  readonly monstro: EntradaDe<'monstro'>;
  readonly ficha: Ficha;
  readonly mesa: Mesa;
}) {
  const d = monstro.dados;
  const rolarAcao = (acao: AcaoDeEntrada, critico = false) =>
    mesa.fazer(executarAcao(ficha, mesa.calculo, acao, {}, { critico }));
  const linhas: [string, string][] = [
    ['Tipo', `${ROTULO_TAMANHO[d.tamanho]} ${d.tipoCriatura}, ${d.alinhamento}`],
    ['Deslocamento', d.deslocamento],
    ['Sentidos', d.sentidos],
    ['Idiomas', d.idiomas],
    ['Nível de desafio', `${formatarNivelDesafio(d.nivelDesafio)} (${d.experiencia} XP)`],
    ['Resistências', d.resistencias.join('; ')],
    ['Imunidades', [...d.imunidades, ...d.imunidadesCondicao].join('; ')],
    ['Vulnerabilidades', d.vulnerabilidades.join('; ')],
  ];
  const blocos: [string, readonly { nome: string; descricao: string }[]][] = [
    ['Traços', d.tracos],
    ['Ações', d.acoesDeCombate],
    ['Reações', d.reacoes],
    ['Ações lendárias', d.acoesLendarias],
  ];
  return (
    <div className="campo-largo ficha-monstro">
      {monstro.acoes.length > 0 && (
        <div className="ficha-acoes-monstro">
          {monstro.acoes.map((acao) => (
            <button
              key={acao.id}
              type="button"
              disabled={!mesa.podeAgir}
              title={ehAcaoDeDano(acao) ? 'Clique para rolar. Botão direito: dano crítico.' : 'Clique para rolar.'}
              onClick={() => rolarAcao(acao)}
              onContextMenu={(e) =>
                mesa.menu(e, acao.rotulo, [
                  { rotulo: 'Rolar', aoEscolher: () => rolarAcao(acao) },
                  ...(ehAcaoDeDano(acao) ? [{ rotulo: 'Rolar crítico (dados em dobro)', aoEscolher: () => rolarAcao(acao, true) }] : []),
                ])
              }
            >
              {acao.rotulo}
            </button>
          ))}
        </div>
      )}
      <dl>
        {linhas
          .filter(([, valor]) => valor.trim() !== '')
          .map(([rotulo, valor]) => (
            <div key={rotulo}>
              <dt>{rotulo}</dt>
              <dd>{valor}</dd>
            </div>
          ))}
      </dl>
      {blocos
        .filter(([, lista]) => lista.length > 0)
        .map(([titulo, lista]) => (
          <div key={titulo}>
            <h3>{titulo}</h3>
            {lista.map((b, i) => (
              <p key={i}>
                <strong>{b.nome}.</strong> {b.descricao}
              </p>
            ))}
          </div>
        ))}
    </div>
  );
}

/**
 * A noite no acampamento: resolve um turno a partir do que cada personagem escolheu.
 * Descansar conta para o descanso do fim da noite; vigiar evita a surpresa e protege de
 * furtos; furtar rola Prestidigitação contra a Percepção passiva; perícias e estudos rolam ou
 * avançam na ficha. Quem resolve é o mestre (no online, o servidor): só ele tem a palavra final.
 *
 * Esta função não muda nada sozinha: devolve o turno para o grupo, as fichas mudadas,
 * as notificações e as rolagens, e quem a chama despacha cada coisa na loja certa.
 */
import { rolarTeste, transferirItem } from './acoesDaFicha';
import { calcularFicha } from './calculoDaFicha';
import type { EstadoCompendio } from './compendio';
import { comExtra, type EstudoNaFicha, type Ficha } from './fichas';
import type { DadoRolado } from './formulas';
import { normalizarNome } from './formulas';
import {
  membrosPresentes,
  type ContextoDoGrupo,
  type EscolhaNoturna,
  type EstadoGrupo,
  type TurnoDaNoite,
  type TipoDeDescanso,
} from './grupo';
import { hexEm } from './mapa';
import type { NovaNotificacao } from './notificacoes';
import type { Regras } from './regras';
import { acoesDoLugar, type AcaoNoturna } from './regrasDaNoite';
import { tagsDoTile } from './viagem';
import { ehMestre, paraJogadores, SO_MESTRE, type Visibilidade } from './visibilidade';

/** Uma rolagem feita na noite, pronta para o registro de rolagens. */
export interface RolagemDaNoite {
  readonly autorId: string;
  readonly fichaId: string;
  readonly quem: string;
  readonly rotulo: string;
  readonly formula: string;
  readonly dados: readonly DadoRolado[];
  readonly total: number;
  readonly visibilidade: Visibilidade;
}

export interface ResultadoDoTurno {
  readonly turno: TurnoDaNoite;
  /** As fichas que mudaram (furtos, estudos), prontas para uma ação só nas fichas. */
  readonly fichas: readonly Ficha[];
  readonly notificacoes: readonly NovaNotificacao[];
  readonly rolagens: readonly RolagemDaNoite[];
}

export interface EntradaDoTurno {
  readonly estado: EstadoGrupo;
  readonly contexto: ContextoDoGrupo;
  readonly regras: Regras;
  readonly fichas: Readonly<Record<string, Ficha>>;
  readonly compendio: EstadoCompendio;
  /** Número em [0, 1): os testes passam um valor fixo. */
  readonly aleatorio?: () => number;
  readonly criarId?: () => string;
}

const nomeDe = (ficha: Ficha | undefined) => ficha?.nome.trim() || 'Sem nome';

/** Quem vê algo de uma ficha: o dono dela (e o mestre, que vê tudo). */
function soODono(ficha: Ficha): Visibilidade {
  return ehMestre(ficha.donoId) ? SO_MESTRE : paraJogadores([ficha.donoId]);
}

/** A ação que vale para quem não escolheu: a primeira de descansar. */
function acaoPadrao(acoes: readonly AcaoNoturna[]): AcaoNoturna {
  return acoes.find((a) => a.tipo === 'descanso') ?? acoes[0];
}

/** Um número de um valor da ficha, com um padrão se a fórmula tiver problema. */
function valorDe(ficha: Ficha, regras: Regras, nome: string, padrao: number): number {
  const calculado = calcularFicha(ficha, regras).valor(nome);
  return calculado.ok ? calculado.valor : padrao;
}

/** A maior chance de encontro entre as tags do hex do grupo, em %. No abrigo, nenhuma. */
export function chanceDeEncontro(estado: EstadoGrupo, contexto: ContextoDoGrupo, regras: Regras): number {
  if (estado.noite?.lugar === 'abrigo') {
    return 0;
  }
  const hex = estado.posicao ? hexEm(contexto.obterMapa(), estado.posicao) : undefined;
  const tags = hex ? tagsDoTile(regras.viagem, hex.terreno).map((t) => t.id) : [];
  const chances = tags.map((t) => regras.noite.chanceDeEncontro[t]).filter((n): n is number => n !== undefined);
  return chances.length > 0 ? Math.max(...chances) : regras.noite.chancePadrao;
}

/**
 * Se o grupo tem um veículo fechado onde cabem todos: um item com a etiqueta das regras na
 * ficha de um membro que tenha lugares no veículo terrestre para o grupo inteiro.
 */
export function temVeiculoFechado(membros: readonly Ficha[], regras: Regras): boolean {
  const etiqueta = normalizarNome(regras.noite.etiquetaVeiculoFechado);
  return membros.some(
    (ficha) =>
      ficha.itens.some((p) => ficha.entradas[p.entradaId]?.etiquetas.some((e) => normalizarNome(e) === etiqueta)) &&
      valorDe(ficha, regras, 'veiculo_terra_lugares', 0) >= membros.length,
  );
}

/** Quanto descanso cada ficha ganhou na noite, contando os turnos em que descansou. */
export function descansoDaNoite(
  turnos: readonly TurnoDaNoite[],
  fichaId: string,
  lugar: 'acampamento' | 'abrigo',
  regras: Regras,
): TipoDeDescanso | null {
  const descansou = turnos.filter((t) => t.descansaram.includes(fichaId)).length;
  const paraLongo = lugar === 'abrigo' ? regras.noite.turnosParaLongoNoAbrigo : regras.noite.turnosParaLongo;
  return descansou >= paraLongo ? 'longo' : descansou >= regras.noite.turnosParaCurto ? 'curto' : null;
}

/** Um turno de estudo a mais na ficha: junta ao estudo do mesmo assunto, ou começa um novo. */
function comEstudo(ficha: Ficha, tipo: EstudoNaFicha['tipo'], assunto: string, magiaId: string | null, criarId: () => string): Ficha {
  const chave = (e: Pick<EstudoNaFicha, 'tipo' | 'assunto' | 'magiaId'>) =>
    e.tipo === 'magia' ? `magia:${e.magiaId}` : `idioma:${normalizarNome(e.assunto)}`;
  const procurado = chave({ tipo, assunto, magiaId });
  const existente = ficha.estudos.find((e) => chave(e) === procurado);
  return {
    ...ficha,
    estudos: existente
      ? ficha.estudos.map((e) => (e === existente ? { ...e, turnos: e.turnos + 1 } : e))
      : [...ficha.estudos, { id: criarId(), tipo, assunto, magiaId, turnos: 1 }],
  };
}

/** Os turnos estudados de um assunto, depois de um turno a mais. */
function turnosDoEstudo(ficha: Ficha, tipo: EstudoNaFicha['tipo'], assunto: string, magiaId: string | null): number {
  return (
    ficha.estudos.find((e) => (tipo === 'magia' ? e.magiaId === magiaId : e.tipo === 'idioma' && normalizarNome(e.assunto) === normalizarNome(assunto)))
      ?.turnos ?? 0
  );
}

/**
 * O mestre dá um estudo por terminado: a magia entra na ficha (como as acrescentadas à mão),
 * ou o idioma entra na lista de idiomas aprendidos.
 */
export function concluirEstudo(ficha: Ficha, estudoId: string, compendio: EstadoCompendio): Ficha {
  const estudo = ficha.estudos.find((e) => e.id === estudoId);
  if (!estudo) {
    return ficha;
  }
  const semEstudo = { ...ficha, estudos: ficha.estudos.filter((e) => e !== estudo) };
  if (estudo.tipo === 'magia' && estudo.magiaId) {
    return comExtra(semEstudo, compendio, estudo.magiaId);
  }
  const jaSabe = ficha.idiomas.some((i) => normalizarNome(i) === normalizarNome(estudo.assunto));
  return jaSabe ? semEstudo : { ...semEstudo, idiomas: [...ficha.idiomas, estudo.assunto] };
}

/** Resolve o turno atual da noite. Devolve `null` se o grupo não está passando a noite. */
export function resolverTurno(entrada: EntradaDoTurno): ResultadoDoTurno | null {
  const { estado, contexto, regras, compendio } = entrada;
  const aleatorio = entrada.aleatorio ?? Math.random;
  const criarId = entrada.criarId ?? (() => crypto.randomUUID());
  const noite = estado.noite;
  if (!noite) {
    return null;
  }
  const fichas: Record<string, Ficha> = { ...entrada.fichas };
  const mudadas = new Set<string>();
  const membros = membrosPresentes(estado, contexto).filter((id) => fichas[id]);
  const acoes = acoesDoLugar(regras.noite, noite.lugar);
  const escolhaDe = (id: string): { escolha: EscolhaNoturna; acao: AcaoNoturna } => {
    const escolha = noite.escolhas[id];
    const acao = acoes.find((a) => a.id === escolha?.acaoId);
    return acao && escolha ? { escolha, acao } : { escolha: { acaoId: acaoPadrao(acoes).id }, acao: acaoPadrao(acoes) };
  };
  const tipoDe = (id: string) => escolhaDe(id).acao.tipo;
  const descansaram = membros.filter((id) => tipoDe(id) === 'descanso');
  const vigias = membros.filter((id) => tipoDe(id) === 'vigia');

  const linhas: string[] = [];
  const notificacoes: NovaNotificacao[] = [];
  const rolagens: RolagemDaNoite[] = [];
  const registrar = (ficha: Ficha, feita: { rotulo: string; formula: string; rolagem: { dados: readonly DadoRolado[]; total: number } }, visibilidade: Visibilidade) =>
    rolagens.push({
      autorId: ficha.donoId,
      fichaId: ficha.id,
      quem: nomeDe(ficha),
      rotulo: feita.rotulo,
      formula: feita.formula,
      dados: feita.rolagem.dados,
      total: feita.rolagem.total,
      visibilidade,
    });

  // Primeiro o que cada um faz, na ordem dos membros.
  for (const id of membros) {
    const { escolha, acao } = escolhaDe(id);
    const ficha = fichas[id];
    const nome = nomeDe(ficha);
    switch (acao.tipo) {
      case 'descanso':
        linhas.push(`${nome} descansou`);
        break;
      case 'vigia':
        linhas.push(`${nome} vigiou`);
        break;
      case 'furto': {
        const alvo = escolha.alvoId ? fichas[escolha.alvoId] : undefined;
        if (!alvo || !membros.includes(alvo.id) || alvo.id === id) {
          linhas.push(`${nome} quis furtar, mas não havia alvo`);
          break;
        }
        // O furto da noite já supõe furtividade: rola Prestidigitação. Alvo dormindo dá vantagem.
        const modo = descansaram.includes(alvo.id) ? 'vantagem' : 'normal';
        const feita = rolarTeste(calcularFicha(ficha, regras), 'prestidigitacao', `Furto em ${nomeDe(alvo)}`, modo, aleatorio);
        if (!feita.ok) {
          linhas.push(`${nome} quis furtar ${nomeDe(alvo)}, mas a rolagem falhou: ${feita.erro}`);
          break;
        }
        registrar(ficha, feita.feita, SO_MESTRE);
        // A dificuldade é a melhor Percepção passiva entre o alvo e quem vigia, mais a defesa contra furto.
        const guardas = [alvo, ...vigias.filter((v) => v !== id).map((v) => fichas[v])];
        const percepcao = Math.max(...guardas.map((g) => valorDe(g, regras, 'percepcao_passiva', 10)));
        const cd = percepcao + valorDe(alvo, regras, 'defesa_furto', 0);
        const total = feita.feita.rolagem.total;
        if (total < cd) {
          linhas.push(`${nome} tentou furtar ${nomeDe(alvo)}: ${total} contra ${cd}, falhou`);
          notificacoes.push({ icone: '⚠️', texto: `${nome} tentou te furtar! (${nomeDe(alvo)})`, visibilidade: soODono(alvo) });
          notificacoes.push({ icone: '🫳', texto: `${nomeDe(alvo)} percebeu o seu furto. (${nome})`, visibilidade: soODono(ficha) });
          break;
        }
        const elegiveis = alvo.itens.filter((p) => !p.equipado && !p.sintonizado);
        if (elegiveis.length === 0) {
          linhas.push(`${nome} furtou ${nomeDe(alvo)} sem ser visto, mas não havia nada para levar`);
          notificacoes.push({ icone: '🫳', texto: `${nomeDe(alvo)} não tinha nada fácil de levar. (${nome})`, visibilidade: soODono(ficha) });
          break;
        }
        const pilha = elegiveis[Math.floor(aleatorio() * elegiveis.length)];
        const item = alvo.entradas[pilha.entradaId];
        const passou = transferirItem(alvo, ficha, pilha.id, 1, criarId);
        if (!passou) {
          break;
        }
        [fichas[alvo.id], fichas[id]] = passou;
        mudadas.add(alvo.id).add(id);
        linhas.push(`${nome} furtou ${item?.nome ?? 'um item'} de ${nomeDe(alvo)} (${total} contra ${cd})`);
        // A vítima não fica sabendo; o ladrão sim.
        notificacoes.push({ icone: '🫳', texto: `Você furtou ${item?.nome ?? 'um item'} de ${nomeDe(alvo)}. (${nome})`, visibilidade: soODono(ficha) });
        break;
      }
      case 'pericia': {
        const pericia = regras.pericias.find((p) => p.id === escolha.pericia);
        if (!pericia) {
          linhas.push(`${nome} quis usar uma perícia desconhecida`);
          break;
        }
        const feita = rolarTeste(calcularFicha(ficha, regras), pericia.id, `Noite: ${pericia.nome}`, 'normal', aleatorio);
        if (!feita.ok) {
          linhas.push(`${nome} usou ${pericia.nome}, mas a rolagem falhou: ${feita.erro}`);
          break;
        }
        registrar(ficha, feita.feita, soODono(ficha));
        linhas.push(`${nome} usou ${pericia.nome}: ${feita.feita.rolagem.total}`);
        break;
      }
      case 'estudo': {
        if (escolha.magiaId) {
          const magia = compendio.entradas[escolha.magiaId] ?? ficha.entradas[escolha.magiaId];
          const fonte = ficha.itens.find((p) => p.id === escolha.fontePilhaId);
          if (!magia || magia.tipo !== 'magia') {
            linhas.push(`${nome} quis estudar uma magia que não existe mais`);
            break;
          }
          if (!fonte) {
            linhas.push(`${nome} quis estudar ${magia.nome}, mas está sem o livro ou pergaminho`);
            break;
          }
          fichas[id] = comEstudo(ficha, 'magia', magia.nome, magia.id, criarId);
          mudadas.add(id);
          const turnos = turnosDoEstudo(fichas[id], 'magia', magia.nome, magia.id);
          linhas.push(`${nome} estudou ${magia.nome} em ${ficha.entradas[fonte.entradaId]?.nome ?? 'um livro'} (${turnos} ${turnos === 1 ? 'turno' : 'turnos'} ao todo)`);
          break;
        }
        const idioma = escolha.texto?.trim() ?? '';
        if (!idioma) {
          linhas.push(`${nome} quis estudar, mas não disse o quê`);
          break;
        }
        fichas[id] = comEstudo(ficha, 'idioma', idioma, null, criarId);
        mudadas.add(id);
        const turnos = turnosDoEstudo(fichas[id], 'idioma', idioma, null);
        linhas.push(`${nome} estudou o idioma ${idioma} (${turnos} ${turnos === 1 ? 'turno' : 'turnos'} ao todo)`);
        break;
      }
      case 'livre':
        linhas.push(`${nome}: ${escolha.texto?.trim() || '(não disse o quê)'}`);
        break;
    }
  }

  // Depois o perigo: no acampamento, um encontro pode acontecer. Só o mestre fica sabendo.
  const chance = chanceDeEncontro(estado, contexto, regras);
  if (chance > 0 && Math.floor(aleatorio() * 100) + 1 <= chance) {
    const nomesDosVigias = vigias.map((v) => nomeDe(fichas[v]));
    const texto =
      nomesDosVigias.length > 0
        ? `Encontro no turno ${noite.turno}! Vigiavam: ${nomesDosVigias.join(', ')}.`
        : temVeiculoFechado(membros.map((m) => fichas[m]), regras)
          ? `Encontro no turno ${noite.turno}! Ninguém vigiava, mas o veículo fechado protegeu o grupo da surpresa.`
          : `Encontro no turno ${noite.turno}! Ninguém vigiava: o grupo foi surpreendido.`;
    linhas.push(`⚔ ${texto} (chance de ${chance}%)`);
    notificacoes.push({ icone: '⚔️', texto, visibilidade: SO_MESTRE });
  }

  const turno: TurnoDaNoite = { turno: noite.turno, linhas, descansaram };
  // No último turno, cada dono fica sabendo do descanso que o personagem ganhou.
  if (noite.turno >= regras.noite.turnos) {
    const todos = [...noite.turnos, turno];
    for (const id of membros) {
      const ganho = descansoDaNoite(todos, id, noite.lugar, regras);
      notificacoes.push({
        icone: '🌅',
        texto: `A noite acabou. ${nomeDe(fichas[id])}: ${ganho ? `descanso ${ganho} (aplique no painel do grupo)` : 'sem descanso'}.`,
        visibilidade: soODono(fichas[id]),
      });
    }
  }
  return { turno, fichas: [...mudadas].map((id) => fichas[id]), notificacoes, rolagens };
}

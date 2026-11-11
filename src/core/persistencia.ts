import { APARENCIA_PADRAO, type AparenciaOculta, type FundoOculto } from './aparencia';
import {
  GRUPO_INICIAL,
  type AcontecimentoDaViagem,
  type Eleicao,
  type EscolhaNoturna,
  type NoiteNoGrupo,
  type ResultadoDaEleicao,
  type TurnoDaNoite,
  type TipoDeDescanso,
  type EntradaDaViagem,
  type EstadoGrupo,
  type MarcoDoGrupo,
} from './grupo';
import type { CoordHex } from './hex';
import { ehObjeto, ErroDeFormato, exigir } from './leitura';
import { chaveHex, type ChaveHex } from './hex';
import type { Manifesto } from './manifesto';
import { INFORMACAO_VAZIA, type Decoracao, type EstadoMapa, type Hex, type Nota } from './mapa';
import { paraJogadores, SO_MESTRE, VISIVEL_A_TODOS, type Visibilidade } from './visibilidade';
import type { ParteDoTempo } from './viagem';

/** Aumente ao mudar o formato do arquivo, para poder converter mapas antigos. */
const VERSAO_ARQUIVO = 4;

interface ConteudoArquivo {
  readonly estado: EstadoMapa;
  readonly grupo: EstadoGrupo;
}

/** O que foi lido de um texto salvo, ou o motivo de não ter sido possível ler. */
export type ResultadoDe<T> =
  | ({ readonly ok: true } & T)
  | { readonly ok: false; readonly erro: string };

export type ResultadoLeitura = ResultadoDe<ConteudoArquivo>;

export { ehObjeto, ErroDeFormato, exigir };

function lerDecoracao(dado: unknown, onde: string): Decoracao {
  exigir(ehObjeto(dado), `${onde} não é uma decoração válida.`);
  const { id, assetId, deslocamento } = dado;
  exigir(typeof id === 'string' && id !== '', `${onde} está sem id.`);
  exigir(typeof assetId === 'string' && assetId !== '', `${onde} está sem imagem.`);
  exigir(ehObjeto(deslocamento), `${onde} está sem posição.`);
  const { x, y } = deslocamento;
  exigir(Number.isFinite(x) && Number.isFinite(y), `${onde} tem uma posição inválida.`);
  return { id, assetId, deslocamento: { x: x as number, y: y as number } };
}

/** Uma visibilidade desconhecida é recusada: um segredo nunca pode virar público por engano. */
export function lerVisibilidade(dado: unknown, onde: string): Visibilidade {
  exigir(ehObjeto(dado), `${onde} está sem visibilidade.`);
  if (dado.tipo === 'jogadores') {
    const { ids } = dado;
    exigir(
      Array.isArray(ids) && ids.every((id) => typeof id === 'string' && id !== ''),
      `${onde} tem uma lista de jogadores inválida.`,
    );
    return paraJogadores(ids as string[]);
  }
  exigir(dado.tipo === 'todos' || dado.tipo === 'mestre', `${onde} tem uma visibilidade inválida.`);
  return dado.tipo === 'todos' ? VISIVEL_A_TODOS : SO_MESTRE;
}

function lerNota(dado: unknown, onde: string): Nota {
  exigir(ehObjeto(dado), `${onde} não é uma nota válida.`);
  const { id, texto, visibilidade } = dado;
  exigir(typeof id === 'string' && id !== '', `${onde} está sem id.`);
  exigir(typeof texto === 'string', `${onde} está sem texto.`);
  return { id, texto, visibilidade: lerVisibilidade(visibilidade, onde) };
}

function lerHex(dado: unknown, posicao: number): Hex {
  const onde = `O hex nº ${posicao + 1}`;
  exigir(ehObjeto(dado), `${onde} não é válido.`);
  const { q, r, terreno, decoracoes, nome, descricao, notas, revelado } = dado;
  exigir(Number.isInteger(q) && Number.isInteger(r), `${onde} tem coordenadas inválidas.`);
  exigir(typeof terreno === 'string' && terreno !== '', `${onde} está sem terreno.`);
  exigir(Array.isArray(decoracoes), `${onde} está sem a lista de decorações.`);
  exigir(typeof nome === 'string', `${onde} está sem nome.`);
  exigir(typeof descricao === 'string', `${onde} está sem descrição.`);
  exigir(Array.isArray(notas), `${onde} está sem a lista de notas.`);
  exigir(typeof revelado === 'boolean', `${onde} não diz se está revelado.`);
  return {
    coord: { q: q as number, r: r as number },
    terreno,
    decoracoes: decoracoes.map((d, i) => lerDecoracao(d, `A decoração nº ${i + 1} de ${onde}`)),
    nome,
    descricao,
    notas: notas.map((n, i) => lerNota(n, `A nota nº ${i + 1} de ${onde}`)),
    revelado,
  };
}

function lerFundoOculto(dado: unknown): FundoOculto {
  const erro = 'A aparência dos hexes não vistos é inválida.';
  exigir(ehObjeto(dado), erro);
  if (dado.tipo === 'escuro' && typeof dado.grid === 'boolean') {
    return { tipo: 'escuro', grid: dado.grid };
  }
  if (dado.tipo === 'neblina' && (dado.variante === 'clara' || dado.variante === 'escura')) {
    return { tipo: 'neblina', variante: dado.variante };
  }
  if (dado.tipo === 'tile' && typeof dado.assetId === 'string' && dado.assetId !== '') {
    return { tipo: 'tile', assetId: dado.assetId };
  }
  throw new ErroDeFormato(erro);
}

function lerAparencia(dado: unknown): AparenciaOculta {
  exigir(ehObjeto(dado), 'O arquivo não tem a aparência dos hexes não vistos.');
  exigir(typeof dado.bordasSuaves === 'boolean', 'A aparência não diz se as bordas são suaves.');
  return { fundo: lerFundoOculto(dado.fundo), bordasSuaves: dado.bordasSuaves };
}

function lerCoord(dado: unknown, onde: string): CoordHex {
  exigir(ehObjeto(dado) && Number.isInteger(dado.q) && Number.isInteger(dado.r), `${onde} é inválida.`);
  return { q: dado.q as number, r: dado.r as number };
}

function lerCoordOuNada(dado: unknown, onde: string): CoordHex | null {
  return dado === null ? null : lerCoord(dado, onde);
}

/** Até a versão 3, o arquivo só guardava a posição do grupo. */
function lerPosicaoAntiga(dado: unknown): EstadoGrupo {
  return { ...GRUPO_INICIAL, posicao: lerCoordOuNada(dado, 'A posição do grupo') };
}

function minutos(dado: unknown, onde: string): number {
  exigir(Number.isInteger(dado) && (dado as number) >= 0, `${onde} é inválido.`);
  return dado as number;
}

function lerMarco(dado: unknown, onde: string): MarcoDoGrupo {
  exigir(ehObjeto(dado), `${onde} está sem o momento anterior.`);
  return {
    posicao: lerCoordOuNada(dado.posicao, `${onde}: a posição anterior`),
    relogio: minutos(dado.relogio, `${onde}: o relógio anterior`),
    viajadoHoje: minutos(dado.viajadoHoje, `${onde}: o tempo viajado anterior`),
    ...(dado.descansosPendentes === undefined
      ? {}
      : { descansosPendentes: lerPendentes(dado.descansosPendentes, `${onde}: os descansos anteriores`) }),
  };
}

/** Descansos que cada ficha ainda precisa aplicar. Grupos de antes dos descansos não têm nenhum. */
function lerPendentes(dado: unknown, onde: string): Record<string, TipoDeDescanso> {
  if (dado === undefined) {
    return {};
  }
  exigir(
    ehObjeto(dado) && Object.values(dado).every((d) => d === 'curto' || d === 'longo'),
    `${onde} são inválidos.`,
  );
  return dado as Record<string, TipoDeDescanso>;
}

/** A conta de um passo, gravada a partir do diário de viagem; passos de antes não a têm. */
function lerConta(dado: unknown, onde: string): ParteDoTempo[] | undefined {
  if (dado === undefined) {
    return undefined;
  }
  exigir(
    Array.isArray(dado) &&
      dado.every(
        (p) =>
          ehObjeto(p) &&
          typeof p.texto === 'string' &&
          typeof p.valor === 'number' &&
          Number.isFinite(p.valor) &&
          (p.tipo === 'base' || p.tipo === 'multiplicador' || p.tipo === 'velocidade'),
      ),
    `${onde}: a conta do passo é inválida.`,
  );
  return (dado as ParteDoTempo[]).map(({ texto, valor, tipo }) => ({ texto, valor, tipo }));
}

/** Os turnos de uma noite no diário: o número e o resumo de cada um. */
function lerTurnosDoDiario(dado: unknown, onde: string): { turno: number; linhas: string[] }[] {
  exigir(Array.isArray(dado), `${onde}: os turnos da noite são inválidos.`);
  return dado.map((t) => {
    exigir(
      ehObjeto(t) && Number.isInteger(t.turno) && Array.isArray(t.linhas) && t.linhas.every((l) => typeof l === 'string'),
      `${onde}: um turno da noite é inválido.`,
    );
    return { turno: t.turno as number, linhas: t.linhas as string[] };
  });
}

/** Os turnos de uma noite em andamento: também quem descansou em cada um. */
function lerTurnosDaNoite(dado: unknown, onde: string): TurnoDaNoite[] {
  const turnos = lerTurnosDoDiario(dado, onde);
  return turnos.map((t, i) => {
    const descansaram = (dado as Record<string, unknown>[])[i].descansaram;
    exigir(Array.isArray(descansaram) && descansaram.every((d) => typeof d === 'string'), `${onde}: quem descansou num turno é inválido.`);
    return { ...t, descansaram: descansaram as string[] };
  });
}

/** A noite em andamento; grupos de antes da Fase 5.5 não a têm. */
function lerNoiteDoGrupo(dado: unknown): NoiteNoGrupo | null {
  if (dado === undefined || dado === null) {
    return null;
  }
  const onde = 'A noite do grupo';
  exigir(ehObjeto(dado), `${onde} é inválida.`);
  exigir(dado.lugar === 'acampamento' || dado.lugar === 'abrigo', `${onde}: o lugar é inválido.`);
  exigir(typeof dado.nomeDoLugar === 'string' && Number.isInteger(dado.turno), `${onde} é inválida.`);
  exigir(ehObjeto(dado.escolhas), `${onde}: as escolhas são inválidas.`);
  const campos = ['alvoId', 'pericia', 'texto', 'magiaId', 'fontePilhaId'] as const;
  const escolhas = Object.fromEntries(
    Object.entries(dado.escolhas).map(([fichaId, e]) => {
      exigir(ehObjeto(e) && typeof e.acaoId === 'string', `${onde}: uma escolha é inválida.`);
      const escolha: Record<string, string> = { acaoId: e.acaoId };
      for (const campo of campos) {
        if (e[campo] !== undefined) {
          exigir(typeof e[campo] === 'string', `${onde}: uma escolha é inválida.`);
          escolha[campo] = e[campo] as string;
        }
      }
      return [fichaId, escolha as unknown as EscolhaNoturna];
    }),
  );
  return {
    lugar: dado.lugar,
    nomeDoLugar: dado.nomeDoLugar,
    turno: dado.turno as number,
    escolhas,
    turnos: lerTurnosDaNoite(dado.turnos, onde),
  };
}

function lerAcontecimento(dado: unknown, onde: string): AcontecimentoDaViagem {
  exigir(ehObjeto(dado), `${onde} está sem o acontecimento.`);
  switch (dado.tipo) {
    case 'passo':
      exigir(typeof dado.ritmo === 'string', `${onde}: o ritmo é inválido.`);
      exigir(Array.isArray(dado.tags) && dado.tags.every((t) => typeof t === 'string'), `${onde}: as tags são inválidas.`);
      const conta = lerConta(dado.conta, onde);
      return {
        tipo: 'passo',
        de: lerCoord(dado.de, `${onde}: a origem`),
        para: lerCoord(dado.para, `${onde}: o destino`),
        minutos: minutos(dado.minutos, `${onde}: o tempo do passo`),
        ritmo: dado.ritmo,
        tags: dado.tags as string[],
        ...(conta ? { conta } : {}),
      };
    case 'posicionou':
      return { tipo: 'posicionou', para: lerCoordOuNada(dado.para, `${onde}: a posição`) };
    case 'acampou':
      // Diários de antes dos descansos: acampar era o descanso longo no acampamento.
      return { tipo: 'descansou', descanso: 'longo', lugar: 'acampamento', nomeDoLugar: '' };
    case 'descansou':
      exigir(dado.descanso === 'curto' || dado.descanso === 'longo', `${onde}: o tipo de descanso é inválido.`);
      exigir(dado.lugar === 'acampamento' || dado.lugar === 'abrigo', `${onde}: o lugar do descanso é inválido.`);
      exigir(typeof dado.nomeDoLugar === 'string', `${onde}: o nome do lugar é inválido.`);
      return { tipo: 'descansou', descanso: dado.descanso, lugar: dado.lugar, nomeDoLugar: dado.nomeDoLugar };
    case 'acertouRelogio':
      return { tipo: dado.tipo };
    case 'anotou':
      exigir(typeof dado.texto === 'string', `${onde}: a anotação é inválida.`);
      return { tipo: 'anotou', texto: dado.texto };
    case 'noite':
      exigir(dado.lugar === 'acampamento' || dado.lugar === 'abrigo', `${onde}: o lugar da noite é inválido.`);
      exigir(typeof dado.nomeDoLugar === 'string', `${onde}: o nome do lugar é inválido.`);
      return { tipo: 'noite', lugar: dado.lugar, nomeDoLugar: dado.nomeDoLugar, turnos: lerTurnosDoDiario(dado.turnos, onde) };
    case 'avancou':
      exigir(typeof dado.ateAManha === 'boolean', `${onde}: o avanço do tempo é inválido.`);
      return { tipo: 'avancou', ateAManha: dado.ateAManha };
    default:
      throw new ErroDeFormato(`${onde} tem um acontecimento desconhecido.`);
  }
}

function lerEntradaDaViagem(dado: unknown, posicao: number): EntradaDaViagem {
  const onde = `A linha nº ${posicao + 1} do diário de viagem`;
  exigir(ehObjeto(dado), `${onde} não é válida.`);
  exigir(Number.isInteger(dado.id), `${onde} está sem número.`);
  exigir(typeof dado.autorId === 'string' && dado.autorId !== '', `${onde} está sem autor.`);
  return {
    id: dado.id as number,
    autorId: dado.autorId,
    acontecimento: lerAcontecimento(dado.acontecimento, onde),
    antes: lerMarco(dado.antes, onde),
    relogioDepois: minutos(dado.relogioDepois, `${onde}: o relógio`),
  };
}

/** Gravada a partir da visão individual; grupos de antes não a têm. */
function lerVisaoExtra(dado: unknown): Record<string, number> {
  if (dado === undefined) {
    return {};
  }
  exigir(
    ehObjeto(dado) && Object.values(dado).every((n) => Number.isInteger(n) && (n as number) > 0),
    'A visão extra do grupo é inválida.',
  );
  return dado as Record<string, number>;
}

const ehRegistroDeTexto = (dado: unknown) =>
  ehObjeto(dado) && Object.values(dado).every((v) => typeof v === 'string' && v !== '');

/** Gravada a partir da eleição do líder; grupos de antes não a têm. */
function lerEleicao(dado: unknown): Eleicao | null {
  if (dado === undefined || dado === null) {
    return null;
  }
  exigir(ehObjeto(dado), 'A eleição do grupo é inválida.');
  exigir(typeof dado.pedidaPor === 'string' && dado.pedidaPor !== '', 'A eleição do grupo está sem quem a pediu.');
  exigir(ehRegistroDeTexto(dado.votos), 'Os votos da eleição são inválidos.');
  exigir(
    dado.empatados === null ||
      (Array.isArray(dado.empatados) && dado.empatados.every((id) => typeof id === 'string' && id !== '')),
    'O empate da eleição é inválido.',
  );
  return {
    pedidaPor: dado.pedidaPor,
    votos: dado.votos as Record<string, string>,
    empatados: dado.empatados as string[] | null,
  };
}

function lerResultadoDaEleicao(dado: unknown): ResultadoDaEleicao | null {
  if (dado === undefined || dado === null) {
    return null;
  }
  exigir(ehObjeto(dado), 'O resultado da última eleição é inválido.');
  exigir(dado.vencedorId === null || typeof dado.vencedorId === 'string', 'O vencedor da última eleição é inválido.');
  exigir(
    ehObjeto(dado.contagem) && Object.values(dado.contagem).every((n) => Number.isInteger(n) && (n as number) > 0),
    'A contagem da última eleição é inválida.',
  );
  exigir(typeof dado.desempatePeloMestre === 'boolean', 'O desempate da última eleição é inválido.');
  return {
    vencedorId: dado.vencedorId,
    contagem: dado.contagem as Record<string, number>,
    desempatePeloMestre: dado.desempatePeloMestre,
  };
}

function lerGrupo(dado: unknown): EstadoGrupo {
  exigir(ehObjeto(dado), 'O arquivo não tem o grupo.');
  const ids = (lista: unknown, oQue: string) => {
    exigir(Array.isArray(lista) && lista.every((id) => typeof id === 'string' && id !== ''), `O grupo: ${oQue} são inválidos.`);
    return lista as string[];
  };
  const membros = ids(dado.membros, 'os membros');
  exigir(new Set(membros).size === membros.length, 'O grupo tem membros repetidos.');
  exigir(dado.liderId === null || typeof dado.liderId === 'string', 'O líder do grupo é inválido.');
  exigir(typeof dado.ritmo === 'string' && dado.ritmo !== '', 'O ritmo do grupo é inválido.');
  exigir(Array.isArray(dado.historico), 'O grupo está sem o diário de viagem.');
  return {
    posicao: lerCoordOuNada(dado.posicao, 'A posição do grupo'),
    membros,
    liderId: dado.liderId,
    ritmo: dado.ritmo,
    relogio: minutos(dado.relogio, 'O relógio do grupo'),
    viajadoHoje: minutos(dado.viajadoHoje, 'O tempo viajado hoje'),
    historico: dado.historico.map(lerEntradaDaViagem),
    visaoExtra: lerVisaoExtra(dado.visaoExtra),
    descansosPendentes: lerPendentes(dado.descansosPendentes, 'Os descansos pendentes do grupo'),
    // Gravado a partir da trava do movimento; grupos de antes não o têm.
    movimentoTravado: (() => {
      exigir(dado.movimentoTravado === undefined || typeof dado.movimentoTravado === 'boolean', 'A trava do movimento é inválida.');
      return dado.movimentoTravado === true;
    })(),
    eleicao: lerEleicao(dado.eleicao),
    ultimaEleicao: lerResultadoDaEleicao(dado.ultimaEleicao),
    noite: lerNoiteDoGrupo(dado.noite),
    noitesBloqueadas: (() => {
      exigir(dado.noitesBloqueadas === undefined || typeof dado.noitesBloqueadas === 'boolean', 'O bloqueio da noite é inválido.');
      return dado.noitesBloqueadas === true;
    })(),
  };
}

/** A versão 1 não tinha nome, descrição nem notas; as versões 1 e 2 não tinham revelação. */
function converterHexAntigo(hex: unknown, versao: number): unknown {
  if (!ehObjeto(hex)) {
    return hex;
  }
  return { ...(versao === 1 ? INFORMACAO_VAZIA : {}), revelado: false, ...hex };
}

function lerArquivo(texto: string): ConteudoArquivo {
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new ErroDeFormato('O arquivo não é um JSON válido.');
  }
  exigir(ehObjeto(dados) && 'versao' in dados, 'O arquivo não é um mapa do KeikowVTT.');
  exigir(
    dados.versao === 1 || dados.versao === 2 || dados.versao === 3 || dados.versao === VERSAO_ARQUIVO,
    `Este mapa usa a versão ${String(dados.versao)} do formato, que não é suportada.`,
  );
  exigir(Array.isArray(dados.hexes), 'O arquivo não tem a lista de hexes.');
  const versao = dados.versao;
  // A versão 3 só mudou o grupo: os hexes e a aparência já estão no formato atual.
  const hexesAtuais = versao === 3 || versao === VERSAO_ARQUIVO;
  const listaDeHexes: unknown[] = hexesAtuais
    ? dados.hexes
    : dados.hexes.map((hex: unknown) => converterHexAntigo(hex, versao));
  const aparenciaOculta = hexesAtuais ? lerAparencia(dados.aparenciaOculta) : APARENCIA_PADRAO;
  const grupo =
    versao === VERSAO_ARQUIVO ? lerGrupo(dados.grupo) : versao === 3 ? lerPosicaoAntiga(dados.posicaoGrupo) : GRUPO_INICIAL;

  const hexes: Record<ChaveHex, Hex> = {};
  const idsDeDecoracao = new Set<string>();
  const idsDeNota = new Set<string>();

  listaDeHexes.forEach((dado, posicao) => {
    const hex = lerHex(dado, posicao);
    const chave = chaveHex(hex.coord);
    exigir(!(chave in hexes), `O hex (${chave}) aparece mais de uma vez.`);
    for (const decoracao of hex.decoracoes) {
      exigir(!idsDeDecoracao.has(decoracao.id), `A decoração "${decoracao.id}" está repetida.`);
      idsDeDecoracao.add(decoracao.id);
    }
    for (const nota of hex.notas) {
      exigir(!idsDeNota.has(nota.id), `A nota "${nota.id}" está repetida.`);
      idsDeNota.add(nota.id);
    }
    hexes[chave] = hex;
  });

  return { estado: { hexes, aparenciaOculta }, grupo };
}

export function mapaParaObjeto(estado: EstadoMapa, grupo: EstadoGrupo) {
  const hexes = Object.values(estado.hexes).map(
    ({ coord, terreno, decoracoes, nome, descricao, notas, revelado }) => ({
      q: coord.q,
      r: coord.r,
      terreno,
      decoracoes,
      nome,
      descricao,
      notas,
      revelado,
    }),
  );
  return {
    versao: VERSAO_ARQUIVO,
    aparenciaOculta: estado.aparenciaOculta,
    grupo,
    hexes,
  };
}

export function serializarMapa(estado: EstadoMapa, grupo: EstadoGrupo): string {
  return JSON.stringify(mapaParaObjeto(estado, grupo), null, 2);
}

/** Lê um mapa salvo. Nunca lança erro: um arquivo inválido devolve o motivo. */
export function desserializarMapa(texto: string): ResultadoLeitura {
  try {
    return { ok: true, ...lerArquivo(texto) };
  } catch (erro) {
    if (erro instanceof ErroDeFormato) {
      return { ok: false, erro: erro.message };
    }
    throw erro;
  }
}

/** Imagens usadas pelo mapa que não existem no manifesto (por exemplo, arquivos renomeados). */
export function assetsDesconhecidos(estado: EstadoMapa, manifesto: Manifesto): string[] {
  const conhecidos = new Set(manifesto.assets.map((asset) => asset.id));
  const desconhecidos = new Set<string>();
  const { fundo } = estado.aparenciaOculta;
  if (fundo.tipo === 'tile' && !conhecidos.has(fundo.assetId)) {
    desconhecidos.add(fundo.assetId);
  }
  for (const hex of Object.values(estado.hexes)) {
    for (const assetId of [hex.terreno, ...hex.decoracoes.map((d) => d.assetId)]) {
      if (!conhecidos.has(assetId)) {
        desconhecidos.add(assetId);
      }
    }
  }
  return [...desconhecidos];
}

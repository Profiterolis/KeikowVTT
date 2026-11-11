import { APARENCIA_PADRAO, type AparenciaOculta, type FundoOculto } from './aparencia';
import {
  GRUPO_INICIAL,
  type AcontecimentoDaViagem,
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
  };
}

function lerAcontecimento(dado: unknown, onde: string): AcontecimentoDaViagem {
  exigir(ehObjeto(dado), `${onde} está sem o acontecimento.`);
  switch (dado.tipo) {
    case 'passo':
      exigir(typeof dado.ritmo === 'string', `${onde}: o ritmo é inválido.`);
      exigir(Array.isArray(dado.tags) && dado.tags.every((t) => typeof t === 'string'), `${onde}: as tags são inválidas.`);
      return {
        tipo: 'passo',
        de: lerCoord(dado.de, `${onde}: a origem`),
        para: lerCoord(dado.para, `${onde}: o destino`),
        minutos: minutos(dado.minutos, `${onde}: o tempo do passo`),
        ritmo: dado.ritmo,
        tags: dado.tags as string[],
      };
    case 'posicionou':
      return { tipo: 'posicionou', para: lerCoordOuNada(dado.para, `${onde}: a posição`) };
    case 'acampou':
    case 'acertouRelogio':
      return { tipo: dado.tipo };
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

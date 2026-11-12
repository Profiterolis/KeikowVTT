/**
 * Como as instâncias são guardadas: no salvamento automático (`keikow.instancias`)
 * e dentro do arquivo do Salvar, no campo `instancias`.
 */
import type { CoordHex } from './hex';
import { ehIdDeImagem } from './imagens';
import { CENA_MAPA, problemaNaInstancia, type Cena, type EstadoInstancias, type Instancia } from './instancias';
import { ehObjeto, exigir } from './leitura';
import type { TokenNaInstancia } from './tokens';
import type { ResultadoDe } from './persistencia';
import { comoResultado, lerJson } from './persistenciaCompendio';

/**
 * Aumente ao mudar o formato, com a conversão da versão anterior e um teste.
 * A 2 trouxe os tokens e a trava do movimento; a 1 abre sem tokens e destravada.
 */
export const VERSAO_INSTANCIAS = 2;

function lerCoordOuNada(dado: unknown, onde: string): CoordHex | null {
  if (dado === null) {
    return null;
  }
  exigir(ehObjeto(dado) && Number.isInteger(dado.q) && Number.isInteger(dado.r), `${onde}: o hex é inválido.`);
  return { q: dado.q as number, r: dado.r as number };
}

function lerToken(dado: unknown, onde: string): TokenNaInstancia {
  exigir(ehObjeto(dado), `${onde} não é válido.`);
  const { id, fichaId, x, y, tamanho, escondido, travado, nomeNoMapa } = dado;
  exigir(typeof id === 'string' && typeof fichaId === 'string', `${onde} está sem id ou sem ficha.`);
  exigir(typeof x === 'number' && typeof y === 'number', `${onde} está sem posição.`);
  exigir(tamanho === null || typeof tamanho === 'number', `${onde}: o tamanho não é válido.`);
  exigir(typeof escondido === 'boolean' && typeof travado === 'boolean', `${onde}: as travas não são válidas.`);
  exigir(typeof nomeNoMapa === 'string', `${onde} está sem o nome no mapa.`);
  return { id, fichaId, x, y, tamanho, escondido, travado, nomeNoMapa };
}

function lerInstancia(dado: unknown, onde: string, versao: number): Instancia {
  exigir(ehObjeto(dado), `${onde} não é válida.`);
  const { id, nome, descricao, hex, imagem, largura, altura, metrosPorPixel } = dado;
  // A versão 1 não tinha tokens nem trava.
  const tokensGuardados = versao >= 2 ? dado.tokens : [];
  const movimentoTravado = versao >= 2 ? dado.movimentoTravado : false;
  exigir(Array.isArray(tokensGuardados), `${onde} está sem a lista de tokens.`);
  exigir(typeof movimentoTravado === 'boolean', `${onde}: a trava do movimento não é válida.`);
  const tokens: Record<string, TokenNaInstancia> = {};
  tokensGuardados.forEach((item, i) => {
    const token = lerToken(item, `${onde}: o token nº ${i + 1}`);
    exigir(!(token.id in tokens), `${onde}: o token "${token.id}" está repetido.`);
    tokens[token.id] = token;
  });
  exigir(typeof id === 'string' && id !== '', `${onde} está sem id.`);
  exigir(typeof nome === 'string', `${onde} está sem nome.`);
  exigir(typeof descricao === 'string', `${onde} está sem descrição.`);
  // Só um id de imagem é aceito: nenhum outro texto entra no lugar da imagem.
  exigir(imagem === null || ehIdDeImagem(imagem), `${onde}: a imagem de fundo não é válida.`);
  exigir(typeof largura === 'number' && typeof altura === 'number', `${onde} está sem tamanho.`);
  exigir(typeof metrosPorPixel === 'number', `${onde} está sem escala.`);
  const instancia: Instancia = {
    id,
    nome,
    descricao,
    hex: lerCoordOuNada(hex, onde),
    imagem,
    largura,
    altura,
    metrosPorPixel,
    tokens,
    movimentoTravado,
  };
  const problema = problemaNaInstancia(instancia);
  exigir(problema === null, `${onde}: ${problema}`);
  return instancia;
}

function lerCena(dado: unknown, onde: string, instancias: Readonly<Record<string, Instancia>>): Cena {
  exigir(ehObjeto(dado), `${onde} não é válida.`);
  if (dado.tipo === 'mapa') {
    return CENA_MAPA;
  }
  exigir(dado.tipo === 'instancia' && typeof dado.instanciaId === 'string', `${onde} não é válida.`);
  exigir(dado.instanciaId in instancias, `${onde} aponta para uma instância que não existe.`);
  return { tipo: 'instancia', instanciaId: dado.instanciaId };
}

export function instanciasParaObjeto(estado: EstadoInstancias) {
  return {
    versao: VERSAO_INSTANCIAS,
    instancias: Object.values(estado.instancias).map((instancia) => ({ ...instancia, tokens: Object.values(instancia.tokens) })),
    cenas: estado.cenas,
    cenaInicial: estado.cenaInicial,
  };
}

function lerEstado(dados: unknown, onde: string): EstadoInstancias {
  exigir(
    ehObjeto(dados) && typeof dados.versao === 'number' && dados.versao >= 1 && dados.versao <= VERSAO_INSTANCIAS,
    `${onde} usam um formato desconhecido.`,
  );
  const versao = dados.versao as number;
  exigir(Array.isArray(dados.instancias), `${onde} estão sem a lista de instâncias.`);
  const instancias: Record<string, Instancia> = {};
  dados.instancias.forEach((item, i) => {
    const instancia = lerInstancia(item, `A instância nº ${i + 1}`, versao);
    exigir(!(instancia.id in instancias), `A instância "${instancia.id}" está repetida.`);
    instancias[instancia.id] = instancia;
  });
  exigir(ehObjeto(dados.cenas), `${onde} estão sem as cenas dos jogadores.`);
  const cenas: Record<string, Cena> = {};
  for (const [participanteId, cena] of Object.entries(dados.cenas)) {
    cenas[participanteId] = lerCena(cena, `A cena de "${participanteId}"`, instancias);
  }
  return { instancias, cenas, cenaInicial: lerCena(dados.cenaInicial, 'A cena inicial', instancias) };
}

export function serializarInstancias(estado: EstadoInstancias): string {
  return JSON.stringify(instanciasParaObjeto(estado));
}

export function desserializarInstancias(texto: string): ResultadoDe<{ readonly estado: EstadoInstancias }> {
  return comoResultado(() => ({ estado: lerEstado(lerJson(texto, 'As instâncias'), 'As instâncias') }));
}

/** As instâncias dentro de um arquivo salvo. Arquivos de antes da Fase 6 devolvem `estado: null`. */
export function lerInstanciasDoArquivo(texto: string): ResultadoDe<{ readonly estado: EstadoInstancias | null }> {
  return comoResultado(() => {
    const dados = lerJson(texto, 'O arquivo');
    if (!ehObjeto(dados) || !('instancias' in dados)) {
      return { estado: null };
    }
    return { estado: lerEstado(dados.instancias, 'As instâncias do arquivo') };
  });
}

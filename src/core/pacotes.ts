import type { EstadoCompendio } from './compendio';
import { TIPOS_ENTRADA, type Entrada, type TipoEntrada } from './entradas';
import { ehObjeto, exigir, type ResultadoDe } from './persistencia';
import { comoResultado, lerEntradas, lerJson } from './persistenciaCompendio';

/**
 * Aumente ao mudar o formato do pacote. As entradas dentro dele seguem o formato
 * atual do compêndio: quando o compêndio mudar de versão, o pacote precisa ser gerado de novo.
 */
export const VERSAO_PACOTE = 6;
export const FORMATO_PACOTE = 'keikow-pacote';

/** Um aviso de autoria ou licença que precisa aparecer para quem usa o conteúdo. */
export interface Credito {
  readonly titulo: string;
  readonly texto: string;
}

/** Conteúdo pronto para trazer ao compêndio, como o SRD 5.1. */
export interface Pacote {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  readonly creditos: readonly Credito[];
  readonly entradas: readonly Entrada[];
}

/** O que aparece na lista de pacotes disponíveis, sem precisar carregar o pacote inteiro. */
export interface ResumoPacote {
  readonly id: string;
  readonly nome: string;
  readonly descricao: string;
  /** Caminho do arquivo do pacote, relativo à pasta dos pacotes. */
  readonly arquivo: string;
  readonly creditos: readonly Credito[];
}

function lerCreditos(valor: unknown, onde: string): Credito[] {
  exigir(Array.isArray(valor) && valor.length > 0, `${onde} está sem créditos.`);
  return valor.map((item, i) => {
    exigir(
      ehObjeto(item) && typeof item.titulo === 'string' && typeof item.texto === 'string' && item.texto !== '',
      `${onde}: o crédito nº ${i + 1} não é válido.`,
    );
    return { titulo: item.titulo, texto: item.texto };
  });
}

function textoPreenchido(dados: Record<string, unknown>, campo: string, onde: string): string {
  const valor = dados[campo];
  exigir(typeof valor === 'string' && valor !== '', `${onde}: "${campo}" precisa ser um texto preenchido.`);
  return valor;
}

export function pacoteParaObjeto(pacote: Pacote) {
  return { formato: FORMATO_PACOTE, versao: VERSAO_PACOTE, ...pacote };
}

export function lerPacote(texto: string): ResultadoDe<{ readonly pacote: Pacote }> {
  return comoResultado(() => {
    const dados = lerJson(texto, 'O pacote');
    exigir(
      ehObjeto(dados) && dados.formato === FORMATO_PACOTE && dados.versao === VERSAO_PACOTE,
      'O pacote usa um formato desconhecido.',
    );
    const id = textoPreenchido(dados, 'id', 'O pacote');
    const entradas = lerEntradas(dados.entradas, 'O pacote');
    for (const entrada of entradas) {
      exigir(
        entrada.origem.tipo === 'pacote' && entrada.origem.pacote === id,
        `A entrada "${entrada.id}" não diz que veio deste pacote.`,
      );
    }
    return {
      pacote: {
        id,
        nome: textoPreenchido(dados, 'nome', 'O pacote'),
        descricao: typeof dados.descricao === 'string' ? dados.descricao : '',
        creditos: lerCreditos(dados.creditos, 'O pacote'),
        entradas,
      },
    };
  });
}

export function lerIndicePacotes(texto: string): ResultadoDe<{ readonly pacotes: readonly ResumoPacote[] }> {
  return comoResultado(() => {
    const dados = lerJson(texto, 'A lista de pacotes');
    exigir(
      ehObjeto(dados) && dados.versao === VERSAO_PACOTE && Array.isArray(dados.pacotes),
      'A lista de pacotes usa um formato desconhecido.',
    );
    return {
      pacotes: dados.pacotes.map((item, i) => {
        const onde = `O pacote nº ${i + 1} da lista`;
        exigir(ehObjeto(item), `${onde} não é válido.`);
        const arquivo = textoPreenchido(item, 'arquivo', onde);
        // Só arquivos da própria pasta de pacotes: nada de caminhos que saiam dela.
        exigir(/^[\w.-]+\.json$/.test(arquivo), `${onde} aponta para um arquivo inválido.`);
        return {
          id: textoPreenchido(item, 'id', onde),
          nome: textoPreenchido(item, 'nome', onde),
          descricao: typeof item.descricao === 'string' ? item.descricao : '',
          arquivo,
          creditos: lerCreditos(item.creditos, onde),
        };
      }),
    };
  });
}

export type ContagemPorTipo = Record<TipoEntrada, { readonly novas: number; readonly existentes: number }>;

/** Quantas entradas de cada tipo o pacote traria, e quantas já estão no compêndio. */
export function contarImportacao(estado: EstadoCompendio, pacote: Pacote): ContagemPorTipo {
  const contagem = Object.fromEntries(TIPOS_ENTRADA.map((tipo) => [tipo, { novas: 0, existentes: 0 }])) as Record<
    TipoEntrada,
    { novas: number; existentes: number }
  >;
  for (const entrada of pacote.entradas) {
    if (entrada.id in estado.entradas) {
      contagem[entrada.tipo].existentes += 1;
    } else {
      contagem[entrada.tipo].novas += 1;
    }
  }
  return contagem;
}

/**
 * As entradas do pacote que ainda não estão no compêndio, só dos tipos escolhidos.
 * As que já existem ficam como estão, para não desfazer o que o mestre editou,
 * a menos que `atualizar` peça para trazê-las de novo (as que mudaram no pacote).
 */
export function entradasParaImportar(
  estado: EstadoCompendio,
  pacote: Pacote,
  tipos: ReadonlySet<TipoEntrada>,
  atualizar = false,
): Entrada[] {
  return pacote.entradas.filter((entrada) => {
    if (!tipos.has(entrada.tipo)) {
      return false;
    }
    const atual = estado.entradas[entrada.id];
    return !atual || (atualizar && JSON.stringify(atual) !== JSON.stringify(entrada));
  });
}

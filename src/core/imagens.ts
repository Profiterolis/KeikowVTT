/**
 * Imagens da campanha (retratos, tokens, imagens de itens e, depois, mapas de instância).
 * Aqui ficam só as regras: o id de cada imagem, os tipos aceitos e quais imagens os documentos usam.
 * Os bytes ficam guardados fora, no navegador (`net/imagens.ts`) e, no online, no servidor.
 */
import type { EstadoCompendio } from './compendio';
import type { Entrada } from './entradas';
import type { EstadoFichas } from './fichas';
import { exigir } from './leitura';

/** Tipos de arquivo aceitos, com a extensão usada dentro do arquivo da campanha. */
export const TIPOS_DE_IMAGEM: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Mapas grandes passam fácil de 20 MB; acima disso, quase sempre é engano. */
export const TAMANHO_MAXIMO_IMAGEM = 60 * 1024 * 1024;

const FORMATO_ID = /^img-[0-9a-f]{64}$/;

export function ehIdDeImagem(valor: unknown): valor is string {
  return typeof valor === 'string' && FORMATO_ID.test(valor);
}

/**
 * O id sai do próprio conteúdo (SHA-256): a mesma imagem escolhida duas vezes é guardada uma vez só,
 * e o id continua o mesmo ao salvar e abrir o arquivo em outro computador.
 */
export async function calcularIdDaImagem(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const copia = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', copia));
  return `img-${Array.from(resumo, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Por que uma imagem não pode ser usada, ou `null` se pode. */
export function problemaNaImagem(tipo: string, tamanho: number): string | null {
  if (!(tipo in TIPOS_DE_IMAGEM)) {
    return 'Use uma imagem PNG, JPG, WEBP ou GIF.';
  }
  if (tamanho > TAMANHO_MAXIMO_IMAGEM) {
    return `A imagem passa de ${Math.round(TAMANHO_MAXIMO_IMAGEM / 1024 / 1024)} MB.`;
  }
  return null;
}

/** O tipo pela extensão do nome, para ler as imagens de dentro do arquivo da campanha. */
export function tipoPelaExtensao(nome: string): string | null {
  const extensao = nome.slice(nome.lastIndexOf('.') + 1).toLowerCase();
  const tipo = Object.entries(TIPOS_DE_IMAGEM).find(([, ext]) => ext === extensao)?.[0];
  return tipo ?? (extensao === 'jpeg' ? 'image/jpeg' : null);
}

/**
 * Lê um campo de imagem opcional de um dado guardado: devolve `{ [campo]: id }` ou `{}` sem ele,
 * para espalhar no objeto lido (o campo some em vez de virar `undefined`).
 */
export function lerImagemOpcional(dado: { readonly [campo: string]: unknown }, campo: string, onde: string): Record<string, string> {
  const valor = dado[campo];
  if (valor === undefined || valor === null) {
    return {};
  }
  exigir(ehIdDeImagem(valor), `${onde}: a imagem em "${campo}" não é válida.`);
  return { [campo]: valor };
}

/** O objeto com a imagem trocada; sem imagem, o campo some (em vez de ficar `undefined`). */
export function comImagem<T extends object>(objeto: T, campo: keyof T & string, id: string | undefined): T {
  const copia = { ...objeto } as Record<string, unknown>;
  if (id) {
    copia[campo] = id;
  } else {
    delete copia[campo];
  }
  return copia as T;
}

/** A imagem que um token usa: a própria do token ou, sem ela, o retrato. */
export function imagemDoToken(ficha: { readonly retrato?: string; readonly token?: string }): string | null {
  return ficha.token ?? ficha.retrato ?? null;
}

const imagemDaEntrada = (entrada: Entrada) => entrada.imagem;

/** Todas as imagens que o compêndio e as fichas citam (retratos, tokens e imagens das entradas e cópias). */
export function imagensUsadas(compendio: EstadoCompendio | null, fichas: EstadoFichas | null): Set<string> {
  const usadas = new Set<string>();
  const anotar = (id: string | undefined) => {
    if (id) {
      usadas.add(id);
    }
  };
  for (const entrada of Object.values(compendio?.entradas ?? {})) {
    anotar(imagemDaEntrada(entrada));
  }
  for (const ficha of Object.values(fichas?.fichas ?? {})) {
    anotar(ficha.retrato);
    anotar(ficha.token);
    for (const copia of Object.values(ficha.entradas)) {
      anotar(imagemDaEntrada(copia));
    }
  }
  return usadas;
}

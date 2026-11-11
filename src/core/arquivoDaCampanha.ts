/**
 * O arquivo do "Salvar": um .zip com o texto da campanha (o mesmo JSON de antes) e as imagens.
 * Arquivos .json antigos continuam abrindo: eles são só o texto, sem imagens.
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { ehIdDeImagem, TIPOS_DE_IMAGEM, tipoPelaExtensao } from './imagens';
import { ErroDeFormato } from './leitura';

const NOME_DO_TEXTO = 'campanha.json';
const PASTA_DAS_IMAGENS = 'imagens/';

export interface ImagemNoArquivo {
  readonly id: string;
  readonly tipo: string;
  readonly bytes: Uint8Array;
}

export interface ConteudoDoArquivo {
  readonly texto: string;
  readonly imagens: readonly ImagemNoArquivo[];
}

/** Monta o .zip. Imagens já vêm comprimidas (PNG, JPG), então entram sem compressão, o que é bem mais rápido. */
export function montarArquivoDaCampanha({ texto, imagens }: ConteudoDoArquivo): Uint8Array {
  const arquivos: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    [NOME_DO_TEXTO]: strToU8(texto),
  };
  for (const imagem of imagens) {
    const extensao = TIPOS_DE_IMAGEM[imagem.tipo] ?? 'bin';
    arquivos[`${PASTA_DAS_IMAGENS}${imagem.id}.${extensao}`] = [imagem.bytes, { level: 0 }];
  }
  return zipSync(arquivos, { level: 6 });
}

/** Todo .zip começa com as letras "PK". */
export function ehZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Lê o arquivo escolhido em "Abrir": um .zip da campanha ou um .json antigo.
 * Lança `ErroDeFormato` se o .zip não for de uma campanha.
 */
export function lerArquivoDaCampanha(bytes: Uint8Array): ConteudoDoArquivo {
  if (!ehZip(bytes)) {
    return { texto: strFromU8(bytes), imagens: [] };
  }
  let arquivos: Record<string, Uint8Array>;
  try {
    arquivos = unzipSync(bytes);
  } catch {
    throw new ErroDeFormato('O arquivo .zip está danificado.');
  }
  const texto = arquivos[NOME_DO_TEXTO];
  if (!texto) {
    throw new ErroDeFormato('Este .zip não é um arquivo de campanha do KeikowVTT.');
  }
  const imagens: ImagemNoArquivo[] = [];
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    if (!caminho.startsWith(PASTA_DAS_IMAGENS)) {
      continue;
    }
    const nome = caminho.slice(PASTA_DAS_IMAGENS.length);
    const id = nome.slice(0, nome.lastIndexOf('.'));
    const tipo = tipoPelaExtensao(nome);
    // Arquivos estranhos dentro do .zip são ignorados; uma imagem que falte só deixa o lugar vazio.
    if (ehIdDeImagem(id) && tipo) {
      imagens.push({ id, tipo, bytes: conteudo });
    }
  }
  return { texto: strFromU8(texto), imagens };
}

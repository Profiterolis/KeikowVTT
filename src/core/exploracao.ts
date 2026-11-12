/**
 * A memória da névoa de masmorra (Fase 6, passo 6): o que cada jogador já viu em cada instância.
 * Onde ele nunca viu fica preto; onde já viu fica escurecido, mesmo longe dali.
 *
 * Cada jogador tem a própria memória (a visão é individual). A memória é uma grade de células de
 * 0,75 m (`gradeDaExploracao`), guardada como bits em base64. Fica num documento próprio
 * (`keikow.exploracao`), fora do desfazer: ver não se desfaz. O mestre pode "Esquecer o explorado".
 */
import { exigir, ehObjeto } from './leitura';
import type { ResultadoDe } from './persistencia';
import { comoResultado, lerJson } from './persistenciaCompendio';
import { PERMITIDO, type Permissao } from './permissoes';
import { ehMestre } from './visibilidade';
import type { GradeDaExploracao } from './visaoTatica';

export interface MemoriaDaInstancia extends GradeDaExploracao {
  /** Um bit por célula, em base64. */
  readonly bits: string;
}

export interface EstadoExploracao {
  /** Pelo id da instância e depois pelo id do participante. */
  readonly instancias: Readonly<Record<string, Readonly<Record<string, MemoriaDaInstancia>>>>;
}

export const EXPLORACAO_VAZIA: EstadoExploracao = { instancias: {} };

const mesmaGrade = (a: GradeDaExploracao, b: GradeDaExploracao) =>
  a.colunas === b.colunas && a.linhas === b.linhas && Math.abs(a.celula - b.celula) < 1e-9;

function paraBase64(bytes: Uint8Array): string {
  let texto = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    texto += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(texto);
}

function deBase64(texto: string): Uint8Array {
  const bruto = atob(texto);
  const bytes = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i += 1) {
    bytes[i] = bruto.charCodeAt(i);
  }
  return bytes;
}

/** Os bits do que o participante já viu, na grade atual da instância; `null` se nunca viu nada nela. */
export function memoriaDe(
  estado: EstadoExploracao,
  instanciaId: string,
  participanteId: string,
  grade: GradeDaExploracao,
): Uint8Array | null {
  const memoria = estado.instancias[instanciaId]?.[participanteId];
  // A grade mudou (o mestre mudou o tamanho ou a escala): a memória antiga não serve mais.
  return memoria && mesmaGrade(memoria, grade) ? deBase64(memoria.bits) : null;
}

export function celulaExplorada(bits: Uint8Array, indice: number): boolean {
  return ((bits[indice >> 3] ?? 0) & (1 << (indice & 7))) !== 0;
}

/** O estado com as células acrescentadas à memória; o mesmo objeto se não houver nada novo. */
export function explorar(
  estado: EstadoExploracao,
  instanciaId: string,
  participanteId: string,
  grade: GradeDaExploracao,
  indices: readonly number[],
): EstadoExploracao {
  const total = grade.colunas * grade.linhas;
  const bits = memoriaDe(estado, instanciaId, participanteId, grade) ?? new Uint8Array(Math.ceil(total / 8));
  let novas = 0;
  for (const i of indices) {
    if (Number.isInteger(i) && i >= 0 && i < total && !celulaExplorada(bits, i)) {
      bits[i >> 3] |= 1 << (i & 7);
      novas += 1;
    }
  }
  if (novas === 0) {
    return estado;
  }
  const memoria: MemoriaDaInstancia = { celula: grade.celula, colunas: grade.colunas, linhas: grade.linhas, bits: paraBase64(bits) };
  return {
    instancias: { ...estado.instancias, [instanciaId]: { ...estado.instancias[instanciaId], [participanteId]: memoria } },
  };
}

/** Esquece tudo o que os jogadores viram numa instância. */
export function esquecer(estado: EstadoExploracao, instanciaId: string): EstadoExploracao {
  if (!(instanciaId in estado.instancias)) {
    return estado;
  }
  const { [instanciaId]: _esquecida, ...instancias } = estado.instancias;
  return { instancias };
}

/** O jogador recebe só a própria memória; o mestre, todas. */
export function exploracaoVistaPor(estado: EstadoExploracao, participanteId: string): EstadoExploracao {
  if (ehMestre(participanteId)) {
    return estado;
  }
  return {
    instancias: Object.fromEntries(
      Object.entries(estado.instancias).flatMap(([id, memorias]) =>
        memorias[participanteId] ? [[id, { [participanteId]: memorias[participanteId] }]] : [],
      ),
    ),
  };
}

export interface LojaExploracao {
  obterEstado(): EstadoExploracao;
  /** Cada um só acrescenta à própria memória (o mestre, a de qualquer um). */
  explorar(autorId: string, instanciaId: string, participanteId: string, grade: GradeDaExploracao, indices: readonly number[]): Permissao;
  /** Só o mestre. */
  esquecer(autorId: string, instanciaId: string): Permissao;
  substituir(estado: EstadoExploracao): void;
  assinar(ouvinte: () => void): () => void;
}

export function criarLojaExploracao(inicial: EstadoExploracao = EXPLORACAO_VAZIA): LojaExploracao {
  let estado = inicial;
  const ouvintes = new Set<() => void>();
  const mudar = (novo: EstadoExploracao) => {
    if (novo !== estado) {
      estado = novo;
      ouvintes.forEach((o) => o());
    }
  };
  return {
    obterEstado: () => estado,
    explorar(autorId, instanciaId, participanteId, grade, indices) {
      if (!ehMestre(autorId) && autorId !== participanteId) {
        return { ok: false, motivo: 'Cada um só guarda o que ele mesmo viu.' };
      }
      mudar(explorar(estado, instanciaId, participanteId, grade, indices));
      return PERMITIDO;
    },
    esquecer(autorId, instanciaId) {
      if (!ehMestre(autorId)) {
        return { ok: false, motivo: 'Só o mestre faz os jogadores esquecerem o mapa.' };
      }
      mudar(esquecer(estado, instanciaId));
      return PERMITIDO;
    },
    substituir: mudar,
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}

const VERSAO_EXPLORACAO = 1;

export function serializarExploracao(estado: EstadoExploracao): string {
  return JSON.stringify({ versao: VERSAO_EXPLORACAO, instancias: estado.instancias });
}

function lerMemoria(dado: unknown, onde: string): MemoriaDaInstancia {
  exigir(ehObjeto(dado), `${onde} não é válida.`);
  const { celula, colunas, linhas, bits } = dado;
  exigir(typeof celula === 'number' && celula > 0, `${onde}: a célula não é válida.`);
  exigir(Number.isInteger(colunas) && Number.isInteger(linhas), `${onde}: o tamanho não é válido.`);
  exigir(typeof bits === 'string', `${onde} está sem os bits.`);
  let bytes = -1;
  try {
    bytes = deBase64(bits).length;
  } catch {
    // Texto que não é base64: a conferência abaixo recusa.
  }
  exigir(bytes === Math.ceil(((colunas as number) * (linhas as number)) / 8), `${onde}: os bits não são válidos.`);
  return { celula, colunas: colunas as number, linhas: linhas as number, bits };
}

function lerEstado(dados: unknown, onde: string): EstadoExploracao {
  exigir(ehObjeto(dados) && dados.versao === VERSAO_EXPLORACAO, `${onde} usa um formato desconhecido.`);
  exigir(ehObjeto(dados.instancias), `${onde} está sem as instâncias.`);
  const instancias: Record<string, Record<string, MemoriaDaInstancia>> = {};
  for (const [instanciaId, memorias] of Object.entries(dados.instancias)) {
    exigir(ehObjeto(memorias), `${onde}: a instância "${instanciaId}" não é válida.`);
    instancias[instanciaId] = Object.fromEntries(
      Object.entries(memorias).map(([participanteId, m]) => [participanteId, lerMemoria(m, `${onde}: a memória de "${participanteId}"`)]),
    );
  }
  return { instancias };
}

export function desserializarExploracao(texto: string): ResultadoDe<{ readonly estado: EstadoExploracao }> {
  return comoResultado(() => ({ estado: lerEstado(lerJson(texto, 'A memória da névoa'), 'A memória da névoa') }));
}

/** A memória dentro de um arquivo salvo; arquivos de antes dela devolvem `estado: null`. */
export function lerExploracaoDoArquivo(texto: string): ResultadoDe<{ readonly estado: EstadoExploracao | null }> {
  return comoResultado(() => {
    const dados = lerJson(texto, 'O arquivo');
    if (!ehObjeto(dados) || !('exploracao' in dados)) {
      return { estado: null };
    }
    return { estado: lerEstado(dados.exploracao, 'A memória da névoa do arquivo') };
  });
}

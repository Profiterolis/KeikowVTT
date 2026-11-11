/**
 * Notificações: avisos curtos para cada participante, como "Thorin tentou te furtar" ou
 * "A eleição terminou: Lyra lidera". Cada aviso diz quem pode vê-lo, como o resto do app;
 * o mestre vê todos. Por enquanto ficam neste computador; no online, chegam na hora a cada um.
 */
import { ehObjeto, exigir, lerVisibilidade, type ResultadoDe } from './persistencia';
import { comoResultado, lerJson } from './persistenciaCompendio';
import { ehMestre, podeVer, type Visibilidade } from './visibilidade';

export const LIMITE_NOTIFICACOES = 100;
const VERSAO_NOTIFICACOES = 1;

export interface Notificacao {
  /** Cresce sempre: serve para saber o que cada um já leu. */
  readonly id: number;
  /** Milissegundos desde 1970, como Date.now(). */
  readonly momento: number;
  readonly icone: string;
  readonly texto: string;
  readonly visibilidade: Visibilidade;
}

export type NovaNotificacao = Pick<Notificacao, 'icone' | 'texto' | 'visibilidade'>;

export interface EstadoNotificacoes {
  /** Da mais nova para a mais antiga. */
  readonly lista: readonly Notificacao[];
  /** Por participante, o id da última notificação que ele já viu. */
  readonly lidas: Readonly<Record<string, number>>;
}

export const NOTIFICACOES_VAZIAS: EstadoNotificacoes = { lista: [], lidas: {} };

/** As notificações que um participante vê. */
export function notificacoesVisiveis(estado: EstadoNotificacoes, participanteId: string): readonly Notificacao[] {
  return ehMestre(participanteId) ? estado.lista : estado.lista.filter((n) => podeVer(n.visibilidade, participanteId));
}

/** Quantas notificações o participante ainda não viu. */
export function naoLidas(estado: EstadoNotificacoes, participanteId: string): number {
  const ultima = estado.lidas[participanteId] ?? 0;
  return notificacoesVisiveis(estado, participanteId).filter((n) => n.id > ultima).length;
}

export interface LojaNotificacoes {
  obterEstado(): EstadoNotificacoes;
  notificar(nova: NovaNotificacao): Notificacao;
  /** Marca como vistas todas as que o participante vê agora. */
  marcarLidas(participanteId: string): void;
  substituir(estado: EstadoNotificacoes): void;
  assinar(ouvinte: () => void): () => void;
}

export function criarLojaNotificacoes(inicial: EstadoNotificacoes = NOTIFICACOES_VAZIAS, agora: () => number = Date.now): LojaNotificacoes {
  let estado = inicial;
  const ouvintes = new Set<() => void>();
  const avisar = () => ouvintes.forEach((o) => o());
  return {
    obterEstado: () => estado,
    notificar(nova) {
      const notificacao: Notificacao = { ...nova, id: (estado.lista[0]?.id ?? 0) + 1, momento: agora() };
      estado = { ...estado, lista: [notificacao, ...estado.lista].slice(0, LIMITE_NOTIFICACOES) };
      avisar();
      return notificacao;
    },
    marcarLidas(participanteId) {
      const ultima = estado.lista[0]?.id ?? 0;
      if ((estado.lidas[participanteId] ?? 0) >= ultima) {
        return;
      }
      estado = { ...estado, lidas: { ...estado.lidas, [participanteId]: ultima } };
      avisar();
    },
    substituir(novo) {
      estado = novo;
      avisar();
    },
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}

export function serializarNotificacoes(estado: EstadoNotificacoes): string {
  return JSON.stringify({ versao: VERSAO_NOTIFICACOES, ...estado });
}

export function desserializarNotificacoes(texto: string): ResultadoDe<{ readonly estado: EstadoNotificacoes }> {
  return comoResultado(() => {
    const dados = lerJson(texto, 'As notificações');
    exigir(
      ehObjeto(dados) && dados.versao === VERSAO_NOTIFICACOES && Array.isArray(dados.lista) && ehObjeto(dados.lidas),
      'As notificações usam um formato desconhecido.',
    );
    const lista = dados.lista.map((n, i): Notificacao => {
      const onde = `A notificação nº ${i + 1}`;
      exigir(ehObjeto(n), `${onde} não é válida.`);
      exigir(Number.isInteger(n.id) && typeof n.momento === 'number', `${onde} tem números inválidos.`);
      exigir(typeof n.icone === 'string' && typeof n.texto === 'string', `${onde} está sem o texto.`);
      return {
        id: n.id as number,
        momento: n.momento as number,
        icone: n.icone,
        texto: n.texto,
        visibilidade: lerVisibilidade(n.visibilidade, onde),
      };
    });
    exigir(Object.values(dados.lidas).every((v) => Number.isInteger(v)), 'As notificações lidas não são válidas.');
    return { estado: { lista, lidas: dados.lidas as Record<string, number> } };
  });
}

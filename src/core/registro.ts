import type { AcaoCampanha } from './campanha';
import type { AcaoCompendio } from './compendio';
import type { AcaoFichas } from './fichas';
import type { AcaoGrupo } from './grupo';
import type { AcaoInstancias } from './instancias';
import type { CoordHex } from './hex';
import type { AcaoMapa } from './mapa';
import type { AcaoRegras } from './regrasDaCampanha';
import { SO_MESTRE, type Visibilidade } from './visibilidade';

/** Mesmo valor de `ID_MESTRE`. Repetido aqui para evitar que os dois arquivos dependam um do outro. */
const AUTOR_PADRAO = 'mestre';

export type TipoEvento =
  | AcaoMapa['tipo']
  | AcaoGrupo['tipo']
  | AcaoCampanha['tipo']
  | AcaoCompendio['tipo']
  | AcaoFichas['tipo']
  | AcaoRegras['tipo']
  | AcaoInstancias['tipo']
  | 'Desfazer'
  | 'Refazer'
  | 'DesfazerCompendio'
  | 'RefazerCompendio'
  | 'DesfazerFichas'
  | 'RefazerFichas'
  | 'DesfazerRegras'
  | 'RefazerRegras'
  | 'DesfazerInstancias'
  | 'RefazerInstancias';

/** Algo que acabou de acontecer. Nunca carrega textos escritos, para não vazar segredos. */
export interface EventoExecutado {
  readonly tipo: TipoEvento;
  readonly coord: CoordHex | null;
  readonly autorId: string;
  /** Eventos seguidos com o mesmo valor viram uma única linha. `null` nunca junta. */
  readonly agrupamento: string | null;
}

export interface OpcoesRegistro {
  /** Quem está agindo agora. Vem da sessão, e não de quem chama a ação. */
  readonly obterAutorId?: () => string;
  readonly aoExecutar?: (evento: EventoExecutado) => void;
  /** Uma mudança foi recusada por falta de permissão. */
  readonly aoRecusar?: (motivo: string) => void;
}

export function autorDe(opcoes: OpcoesRegistro): string {
  return opcoes.obterAutorId?.() ?? AUTOR_PADRAO;
}

export function criarEmissor(opcoes: OpcoesRegistro) {
  return (tipo: TipoEvento, coord: CoordHex | null, agrupamento: string | null) => {
    opcoes.aoExecutar?.({ tipo, coord, autorId: autorDe(opcoes), agrupamento });
  };
}

export interface EntradaRegistro {
  readonly id: number;
  readonly momento: number;
  readonly autorId: string;
  readonly tipo: TipoEvento;
  readonly coord: CoordHex | null;
  readonly quantidade: number;
  readonly visibilidade: Visibilidade;
}

export const LIMITE_REGISTRO = 500;

type OuvinteRegistro = (entradas: readonly EntradaRegistro[]) => void;

export interface LojaRegistro {
  /** Da mais antiga para a mais nova. */
  obterEntradas(): readonly EntradaRegistro[];
  registrar(evento: EventoExecutado): void;
  /** Troca todo o registro, por exemplo ao abrir uma campanha de um arquivo. */
  substituir(entradas: readonly EntradaRegistro[]): void;
  assinar(ouvinte: OuvinteRegistro): () => void;
}

export function criarLojaRegistro(
  inicial: readonly EntradaRegistro[] = [],
  agora: () => number = Date.now,
): LojaRegistro {
  let entradas = inicial;
  let ultimoAgrupamento: string | null = null;
  const ouvintes = new Set<OuvinteRegistro>();

  const proximoId = () => (entradas.at(-1)?.id ?? 0) + 1;

  const mudarPara = (novas: readonly EntradaRegistro[]) => {
    entradas = novas;
    ouvintes.forEach((ouvinte) => ouvinte(entradas));
  };

  return {
    obterEntradas: () => entradas,

    registrar(evento) {
      const ultima = entradas.at(-1);
      const junta =
        ultima !== undefined &&
        evento.agrupamento !== null &&
        evento.agrupamento === ultimoAgrupamento &&
        evento.autorId === ultima.autorId &&
        evento.tipo === ultima.tipo;
      ultimoAgrupamento = evento.agrupamento;

      if (junta) {
        const juntada = { ...ultima, momento: agora(), quantidade: ultima.quantidade + 1 };
        mudarPara([...entradas.slice(0, -1), juntada]);
        return;
      }

      const nova: EntradaRegistro = {
        id: proximoId(),
        momento: agora(),
        autorId: evento.autorId,
        tipo: evento.tipo,
        coord: evento.coord,
        quantidade: 1,
        // Por enquanto, tudo aqui são edições do mestre.
        visibilidade: SO_MESTRE,
      };
      mudarPara([...entradas, nova].slice(-LIMITE_REGISTRO));
    },

    substituir(novas) {
      ultimoAgrupamento = null;
      mudarPara(novas);
    },

    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}

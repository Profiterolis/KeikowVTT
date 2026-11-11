/**
 * O grupo de aventureiros no hexcrawl: onde está, quem faz parte, quem lidera, em que ritmo
 * viaja, que horas são no mundo e o que aconteceu na viagem.
 *
 * O relógio fica aqui, e não na campanha, porque andar um hex muda a posição e o tempo
 * de uma vez só, e quem move o grupo pode ser um jogador.
 */
import type { CoordHex } from './hex';
import { criarMapaVazio, type EstadoMapa } from './mapa';
import type { Permissao } from './permissoes';
import { autorDe, criarEmissor, type OpcoesRegistro } from './registro';
import { ehMestre } from './visibilidade';
import { REGRAS_DE_VIAGEM_PADRAO, tempoDoPasso, type RegrasDeViagem } from './viagem';

export const MINUTOS_POR_DIA = 24 * 60;

const PERMITIDO: Permissao = { ok: true };

/** O que o desfazer precisa para voltar ao momento antes de um acontecimento. */
export interface MarcoDoGrupo {
  readonly posicao: CoordHex | null;
  /** Minutos desde a meia-noite do Dia 1. */
  readonly relogio: number;
  readonly viajadoHoje: number;
}

export type AcontecimentoDaViagem =
  | {
      readonly tipo: 'passo';
      readonly de: CoordHex;
      readonly para: CoordHex;
      readonly minutos: number;
      readonly ritmo: string;
      /** As tags do hex de onde o grupo saiu, que decidiram o tempo. */
      readonly tags: readonly string[];
    }
  | { readonly tipo: 'posicionou'; readonly para: CoordHex | null }
  | { readonly tipo: 'acampou' }
  | { readonly tipo: 'avancou'; readonly ateAManha: boolean }
  | { readonly tipo: 'acertouRelogio' };

/** Uma linha do diário de viagem, que só o mestre vê. */
export interface EntradaDaViagem {
  readonly id: number;
  readonly autorId: string;
  readonly acontecimento: AcontecimentoDaViagem;
  readonly antes: MarcoDoGrupo;
  /** O relógio depois do acontecimento. */
  readonly relogioDepois: number;
}

export interface EstadoGrupo {
  /** Hex onde o grupo está, ou `null` enquanto o mestre não o posicionou. */
  readonly posicao: CoordHex | null;
  /** Ids das fichas que viajam juntas. */
  readonly membros: readonly string[];
  /** A ficha que lidera: quem a controla move o grupo. `null` deixa só o mestre mover. */
  readonly liderId: string | null;
  readonly ritmo: string;
  /** Minutos desde a meia-noite do Dia 1. */
  readonly relogio: number;
  /** Minutos viajados desde o último acampamento, para a barra das horas do dia. */
  readonly viajadoHoje: number;
  /** Da mais antiga para a mais nova; só o mestre vê. */
  readonly historico: readonly EntradaDaViagem[];
}

/** Guarda as últimas entradas: o diário é para consulta, não um arquivo eterno. */
export const LIMITE_HISTORICO = 1000;

export const GRUPO_INICIAL: EstadoGrupo = {
  posicao: null,
  membros: [],
  liderId: null,
  ritmo: 'normal',
  relogio: REGRAS_DE_VIAGEM_PADRAO.horaDaPartida * 60,
  viajadoHoje: 0,
  historico: [],
};

/** Mesmo nome de antes, para quem só precisa de um grupo vazio. */
export const GRUPO_SEM_POSICAO = GRUPO_INICIAL;

export type AcaoGrupo =
  /** O mestre põe o grupo em qualquer hex, sem gastar tempo. */
  | { readonly tipo: 'PosicionarGrupo'; readonly coord: CoordHex | null }
  /** Andar para um hex vizinho, gastando o tempo das regras de viagem. */
  | { readonly tipo: 'MoverGrupo'; readonly para: CoordHex }
  | { readonly tipo: 'AdicionarMembro'; readonly fichaId: string }
  | { readonly tipo: 'RemoverMembro'; readonly fichaId: string }
  | { readonly tipo: 'DefinirLider'; readonly fichaId: string | null }
  | { readonly tipo: 'DefinirRitmo'; readonly ritmo: string }
  /** Até a partida seguinte, com o mínimo de horas de descanso. Zera as horas do dia. */
  | { readonly tipo: 'Acampar' }
  | { readonly tipo: 'AvancarTempo'; readonly minutos: number }
  /** Até a próxima hora da partida, sem acampar. Zera as horas do dia. */
  | { readonly tipo: 'AvancarAteAManha' }
  | { readonly tipo: 'AcertarRelogio'; readonly relogio: number }
  /** Desfaz o último acontecimento do diário, com a posição e o relógio. */
  | { readonly tipo: 'DesfazerViagem' }
  | { readonly tipo: 'CarregarGrupo'; readonly estado: EstadoGrupo };

/** O que o grupo precisa saber de fora: o mapa, as regras e as fichas. */
export interface ContextoDoGrupo {
  readonly obterMapa: () => EstadoMapa;
  readonly obterViagem: () => RegrasDeViagem;
  /** Quem controla a ficha, ou `null` se ela não existe (foi apagada). */
  readonly obterDonoDaFicha: (fichaId: string) => string | null;
}

export const CONTEXTO_VAZIO: ContextoDoGrupo = {
  obterMapa: criarMapaVazio,
  obterViagem: () => REGRAS_DE_VIAGEM_PADRAO,
  obterDonoDaFicha: () => null,
};

// ---------- Relógio ----------

/** "Dia 3, 14:05". */
export function formatarRelogio(minutos: number): string {
  const dia = Math.floor(minutos / MINUTOS_POR_DIA) + 1;
  const doDia = minutos - (dia - 1) * MINUTOS_POR_DIA;
  const duasCasas = (n: number) => String(n).padStart(2, '0');
  return `Dia ${dia}, ${duasCasas(Math.floor(doDia / 60))}:${duasCasas(doDia % 60)}`;
}

/** A próxima vez que o relógio marca a hora da partida, depois de agora. */
function proximaPartida(relogio: number, viagem: RegrasDeViagem): number {
  const partida = Math.round(viagem.horaDaPartida * 60);
  const inicioDoDia = Math.floor(relogio / MINUTOS_POR_DIA) * MINUTOS_POR_DIA;
  const hoje = inicioDoDia + partida;
  return hoje > relogio ? hoje : hoje + MINUTOS_POR_DIA;
}

/**
 * Ao acampar, o grupo acorda na hora da partida, mas descansa ao menos as horas de descanso:
 * acampando às 20:00, parte às 08:00; acampando às 02:00, só às 10:00.
 */
export function fimDoAcampamento(relogio: number, viagem: RegrasDeViagem): number {
  return Math.max(proximaPartida(relogio, viagem), relogio + Math.round(viagem.horasDeDescanso * 60));
}

// ---------- Membros e líder ----------

/** Os membros cujas fichas ainda existem: uma ficha apagada sai do grupo sozinha. */
export function membrosPresentes(estado: EstadoGrupo, contexto: ContextoDoGrupo): string[] {
  return estado.membros.filter((id) => contexto.obterDonoDaFicha(id) !== null);
}

/** O líder, se ainda for membro e a ficha dele existir. */
export function liderPresente(estado: EstadoGrupo, contexto: ContextoDoGrupo): string | null {
  const { liderId } = estado;
  return liderId !== null && membrosPresentes(estado, contexto).includes(liderId) ? liderId : null;
}

/** Quem move o grupo além do mestre: quem controla o líder. */
export function quemConduz(estado: EstadoGrupo, contexto: ContextoDoGrupo): string | null {
  const lider = liderPresente(estado, contexto);
  return lider === null ? null : contexto.obterDonoDaFicha(lider);
}

// ---------- Permissões ----------

/** O que quem controla o líder pode fazer; o resto é só do mestre. */
const ACOES_DO_LIDER: ReadonlySet<AcaoGrupo['tipo']> = new Set(['MoverGrupo', 'DefinirRitmo', 'Acampar', 'DefinirLider']);

/**
 * O mestre pode tudo. Quem controla o líder anda, muda o ritmo, acampa e passa a liderança
 * para outro membro. Os outros jogadores não mudam o grupo.
 */
export function permissaoNoGrupo(
  estado: EstadoGrupo,
  acao: AcaoGrupo,
  autorId: string,
  contexto: ContextoDoGrupo,
): Permissao {
  if (ehMestre(autorId)) {
    return PERMITIDO;
  }
  const condutor = quemConduz(estado, contexto);
  if (!ACOES_DO_LIDER.has(acao.tipo) || condutor !== autorId) {
    return {
      ok: false,
      motivo: ACOES_DO_LIDER.has(acao.tipo)
        ? 'Só o mestre ou quem controla o líder do grupo faz isto.'
        : 'Só o mestre faz isto no grupo.',
    };
  }
  if (acao.tipo === 'DefinirLider' && acao.fichaId === null) {
    return { ok: false, motivo: 'O líder só passa a liderança para outro membro.' };
  }
  return PERMITIDO;
}

// ---------- Aplicar ações ----------

/** O resultado de uma ação: o estado novo (o mesmo objeto se nada mudou) ou o motivo da recusa. */
export type ResultadoNoGrupo =
  | { readonly ok: true; readonly estado: EstadoGrupo }
  | { readonly ok: false; readonly motivo: string };

const mesmaCoord = (a: CoordHex | null, b: CoordHex | null) => a?.q === b?.q && a?.r === b?.r;

export function aplicarAcaoGrupo(
  estado: EstadoGrupo,
  acao: AcaoGrupo,
  autorId: string,
  contexto: ContextoDoGrupo = CONTEXTO_VAZIO,
): ResultadoNoGrupo {
  const ok = (novo: EstadoGrupo): ResultadoNoGrupo => ({ ok: true, estado: novo });
  const recusa = (motivo: string): ResultadoNoGrupo => ({ ok: false, motivo });
  const viagem = contexto.obterViagem();

  /** Anota o acontecimento no diário, guardando como era antes para o desfazer. */
  const comAcontecimento = (
    acontecimento: AcontecimentoDaViagem,
    depois: Pick<EstadoGrupo, 'posicao' | 'relogio' | 'viajadoHoje'>,
  ): EstadoGrupo => {
    const entrada: EntradaDaViagem = {
      id: (estado.historico.at(-1)?.id ?? 0) + 1,
      autorId,
      acontecimento,
      antes: { posicao: estado.posicao, relogio: estado.relogio, viajadoHoje: estado.viajadoHoje },
      relogioDepois: depois.relogio,
    };
    return { ...estado, ...depois, historico: [...estado.historico, entrada].slice(-LIMITE_HISTORICO) };
  };

  switch (acao.tipo) {
    case 'PosicionarGrupo':
      if (mesmaCoord(estado.posicao, acao.coord)) {
        return ok(estado);
      }
      return ok(
        comAcontecimento(
          { tipo: 'posicionou', para: acao.coord },
          { posicao: acao.coord, relogio: estado.relogio, viajadoHoje: estado.viajadoHoje },
        ),
      );

    case 'MoverGrupo': {
      if (estado.posicao === null) {
        return recusa('O grupo ainda não está no mapa.');
      }
      const passo = tempoDoPasso(viagem, contexto.obterMapa(), estado.posicao, acao.para, estado.ritmo);
      if (!passo.ok) {
        return recusa(passo.motivo);
      }
      const minutos = Math.round(passo.horas * 60);
      return ok(
        comAcontecimento(
          {
            tipo: 'passo',
            de: estado.posicao,
            para: acao.para,
            minutos,
            ritmo: estado.ritmo,
            tags: passo.tagsDaOrigem.map((t) => t.id),
          },
          { posicao: acao.para, relogio: estado.relogio + minutos, viajadoHoje: estado.viajadoHoje + minutos },
        ),
      );
    }

    case 'AdicionarMembro':
      if (estado.membros.includes(acao.fichaId)) {
        return ok(estado);
      }
      if (contexto.obterDonoDaFicha(acao.fichaId) === null) {
        return recusa('Esta ficha não existe.');
      }
      return ok({ ...estado, membros: [...estado.membros, acao.fichaId] });

    case 'RemoverMembro':
      if (!estado.membros.includes(acao.fichaId)) {
        return ok(estado);
      }
      return ok({
        ...estado,
        membros: estado.membros.filter((id) => id !== acao.fichaId),
        // Sem o líder, o grupo fica sem líder até o mestre escolher outro.
        liderId: estado.liderId === acao.fichaId ? null : estado.liderId,
      });

    case 'DefinirLider':
      if (acao.fichaId === estado.liderId) {
        return ok(estado);
      }
      if (acao.fichaId !== null && !membrosPresentes(estado, contexto).includes(acao.fichaId)) {
        return recusa('Só um membro do grupo pode liderar.');
      }
      return ok({ ...estado, liderId: acao.fichaId });

    case 'DefinirRitmo':
      if (acao.ritmo === estado.ritmo) {
        return ok(estado);
      }
      if (!viagem.ritmos.some((r) => r.id === acao.ritmo)) {
        return recusa('Este ritmo não existe nas regras da campanha.');
      }
      return ok({ ...estado, ritmo: acao.ritmo });

    case 'Acampar':
      return ok(
        comAcontecimento(
          { tipo: 'acampou' },
          { posicao: estado.posicao, relogio: fimDoAcampamento(estado.relogio, viagem), viajadoHoje: 0 },
        ),
      );

    case 'AvancarTempo': {
      const minutos = Math.round(acao.minutos);
      if (!Number.isFinite(minutos) || minutos <= 0) {
        return recusa('O tempo só avança: use um número de minutos maior que zero.');
      }
      return ok(
        comAcontecimento(
          { tipo: 'avancou', ateAManha: false },
          { posicao: estado.posicao, relogio: estado.relogio + minutos, viajadoHoje: estado.viajadoHoje },
        ),
      );
    }

    case 'AvancarAteAManha':
      return ok(
        comAcontecimento(
          { tipo: 'avancou', ateAManha: true },
          { posicao: estado.posicao, relogio: proximaPartida(estado.relogio, viagem), viajadoHoje: 0 },
        ),
      );

    case 'AcertarRelogio': {
      const relogio = Math.round(acao.relogio);
      if (!Number.isFinite(relogio) || relogio < 0) {
        return recusa('O relógio começa no Dia 1, 00:00.');
      }
      if (relogio === estado.relogio) {
        return ok(estado);
      }
      return ok(
        comAcontecimento(
          { tipo: 'acertouRelogio' },
          { posicao: estado.posicao, relogio, viajadoHoje: estado.viajadoHoje },
        ),
      );
    }

    case 'DesfazerViagem': {
      const ultima = estado.historico.at(-1);
      if (!ultima) {
        return ok(estado);
      }
      return ok({ ...estado, ...ultima.antes, historico: estado.historico.slice(0, -1) });
    }

    case 'CarregarGrupo':
      return ok(acao.estado);
  }
}

// ---------- Loja ----------

type OuvinteGrupo = (estado: EstadoGrupo) => void;

export interface LojaGrupo {
  obterEstado(): EstadoGrupo;
  /** Devolve se a ação valeu; a recusa também chega pelo `aoRecusar` do registro. */
  despachar(acao: AcaoGrupo): boolean;
  assinar(ouvinte: OuvinteGrupo): () => void;
}

/** Fica separada da loja do mapa para que o Ctrl+Z do mestre nunca mova o grupo. */
export function criarLojaGrupo(
  inicial: EstadoGrupo = GRUPO_INICIAL,
  opcoes: OpcoesRegistro = {},
  contexto: ContextoDoGrupo = CONTEXTO_VAZIO,
): LojaGrupo {
  let estado = inicial;
  const ouvintes = new Set<OuvinteGrupo>();
  const emitir = criarEmissor(opcoes);

  return {
    obterEstado: () => estado,
    despachar(acao) {
      const autorId = autorDe(opcoes);
      const permissao = permissaoNoGrupo(estado, acao, autorId, contexto);
      if (!permissao.ok) {
        opcoes.aoRecusar?.(permissao.motivo);
        return false;
      }
      const resultado = aplicarAcaoGrupo(estado, acao, autorId, contexto);
      if (!resultado.ok) {
        opcoes.aoRecusar?.(resultado.motivo);
        return false;
      }
      if (resultado.estado !== estado) {
        estado = resultado.estado;
        ouvintes.forEach((ouvinte) => ouvinte(estado));
        const coord = acao.tipo === 'MoverGrupo' ? acao.para : acao.tipo === 'PosicionarGrupo' ? acao.coord : null;
        emitir(acao.tipo, coord, null);
      }
      return true;
    },
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alcanceDaVisao,
  aplicarAcaoGrupo,
  formatarDuracao,
  motivoParaNaoConduzir,
  passosPossiveis,
  podeConduzir,
  trilhaDoGrupo,
  criarLojaGrupo,
  fimDoAcampamento,
  formatarRelogio,
  GRUPO_INICIAL,
  membrosPresentes,
  quemConduz,
  type AcaoGrupo,
  type ContextoDoGrupo,
  type EstadoGrupo,
} from './grupo';
import type { CoordHex } from './hex';
import { aplicarAcao, criarMapaVazio, type EstadoMapa } from './mapa';
import type { EventoExecutado } from './registro';
import { REGRAS_DE_VIAGEM_PADRAO as VIAGEM, type MembroNaViagem } from './viagem';

const A = { q: 0, r: 0 };
const B = { q: 1, r: 0 };
const C = { q: 2, r: 0 };
const LONGE = { q: 5, r: 0 };

/** Dia 1 começa à meia-noite: 480 minutos são 08:00. */
const hora = (dia: number, h: number, min = 0) => (dia - 1) * 1440 + h * 60 + min;

function mapaCom(...tiles: [CoordHex, string][]): EstadoMapa {
  return tiles.reduce<EstadoMapa>(
    (mapa, [coord, terreno]) => aplicarAcao(mapa, { tipo: 'ColocarTile', coord, terreno }),
    criarMapaVazio(),
  );
}

const MAPA = mapaCom([A, 'hexPlains00'], [B, 'hexForestBroadleaf00'], [C, 'hexPlains00'], [LONGE, 'hexPlains00']);

/** Fichas: a da Ana (jogadora), a do Bia (jogadora) e um NPC do mestre. */
const DONOS: Record<string, string> = { ana: 'j-ana', bia: 'j-bia', guia: 'mestre' };

/** Valores de viagem de cada ficha que não sejam os padrões. */
let valores: Record<string, Record<string, number>> = {};
const PADROES: Record<string, number> = { fator_viagem: 1, visao_hexes: 1, veiculo_terra_fator: 1, veiculo_agua_fator: 1 };

const contexto: ContextoDoGrupo = {
  obterMapa: () => MAPA,
  obterViagem: () => VIAGEM,
  obterDonoDaFicha: (id) => DONOS[id] ?? null,
  obterMembroNaViagem: (id): MembroNaViagem | null =>
    id in DONOS ? { nome: id, valor: (nome) => valores[id]?.[nome] ?? PADROES[nome] ?? 0 } : null,
};

beforeEach(() => {
  valores = {};
});

const viajando: EstadoGrupo = { ...GRUPO_INICIAL, posicao: A, membros: ['ana', 'bia', 'guia'], liderId: 'ana' };

function aplicar(estado: EstadoGrupo, acao: AcaoGrupo, autorId = 'mestre'): EstadoGrupo {
  const resultado = aplicarAcaoGrupo(estado, acao, autorId, contexto);
  if (!resultado.ok) {
    throw new Error(resultado.motivo);
  }
  return resultado.estado;
}

function motivo(estado: EstadoGrupo, acao: AcaoGrupo): string {
  const resultado = aplicarAcaoGrupo(estado, acao, 'mestre', contexto);
  return resultado.ok ? '' : resultado.motivo;
}

describe('relógio', () => {
  it('começa no Dia 1, às 08:00, e mostra dia e hora', () => {
    expect(formatarRelogio(GRUPO_INICIAL.relogio)).toBe('Dia 1, 08:00');
    expect(formatarRelogio(hora(3, 14, 5))).toBe('Dia 3, 14:05');
    expect(formatarRelogio(0)).toBe('Dia 1, 00:00');
  });

  it('acampar leva até a partida, com ao menos 8 h de descanso', () => {
    expect(formatarRelogio(fimDoAcampamento(hora(1, 20), VIAGEM))).toBe('Dia 2, 08:00');
    expect(formatarRelogio(fimDoAcampamento(hora(2, 2), VIAGEM))).toBe('Dia 2, 10:00');
    expect(formatarRelogio(fimDoAcampamento(hora(1, 8), VIAGEM))).toBe('Dia 2, 08:00');
  });
});

describe('andar', () => {
  it('um passo leva o grupo ao vizinho e gasta o tempo do terreno de onde ele sai', () => {
    const depois = aplicar(viajando, { tipo: 'MoverGrupo', para: B });
    expect(depois.posicao).toEqual(B);
    expect(formatarRelogio(depois.relogio)).toBe('Dia 1, 10:00');
    expect(depois.viajadoHoje).toBe(120);
    // Saindo da floresta, o passo leva o dobro.
    const outro = aplicar(depois, { tipo: 'MoverGrupo', para: C });
    expect(formatarRelogio(outro.relogio)).toBe('Dia 1, 14:00');
    expect(outro.viajadoHoje).toBe(360);
  });

  it('o ritmo muda o tempo do passo', () => {
    const rapido = aplicar(aplicar(viajando, { tipo: 'DefinirRitmo', ritmo: 'rapido' }), { tipo: 'MoverGrupo', para: B });
    expect(rapido.viajadoHoje).toBe(90);
  });

  it('o passo entra no diário com o que decidiu o tempo', () => {
    const depois = aplicar(viajando, { tipo: 'MoverGrupo', para: B }, 'j-ana');
    expect(depois.historico).toEqual([
      {
        id: 1,
        autorId: 'j-ana',
        acontecimento: { tipo: 'passo', de: A, para: B, minutos: 120, ritmo: 'normal', tags: ['campo'] },
        antes: { posicao: A, relogio: hora(1, 8), viajadoHoje: 0 },
        relogioDepois: hora(1, 10),
      },
    ]);
  });

  it('recusa andar sem posição, para longe, para hex vazio ou ritmo desconhecido', () => {
    expect(motivo(GRUPO_INICIAL, { tipo: 'MoverGrupo', para: B })).toContain('ainda não está no mapa');
    expect(motivo(viajando, { tipo: 'MoverGrupo', para: LONGE })).toContain('vizinho');
    expect(motivo(viajando, { tipo: 'MoverGrupo', para: { q: 0, r: 1 } })).toContain('Não há terreno');
    expect(motivo(viajando, { tipo: 'DefinirRitmo', ritmo: 'galope' })).toContain('não existe');
  });

  it('pode passar das horas do dia: a marcha forçada só é avisada na tela', () => {
    let estado = viajando;
    for (let i = 0; i < 6; i++) {
      estado = aplicar(estado, { tipo: 'MoverGrupo', para: i % 2 === 0 ? B : A });
    }
    expect(estado.viajadoHoje).toBeGreaterThan(VIAGEM.horasPorDia * 60);
  });

  it('o mestre põe o grupo em qualquer hex sem gastar tempo', () => {
    const depois = aplicar(viajando, { tipo: 'PosicionarGrupo', coord: LONGE });
    expect(depois.posicao).toEqual(LONGE);
    expect(depois.relogio).toBe(viajando.relogio);
    expect(depois.historico.at(-1)?.acontecimento).toEqual({ tipo: 'posicionou', para: LONGE });
    expect(aplicar(depois, { tipo: 'PosicionarGrupo', coord: { ...LONGE } })).toBe(depois);
  });
});

describe('tempo', () => {
  it('acampar zera as horas do dia e leva até a manhã', () => {
    const cansado = aplicar(aplicar(viajando, { tipo: 'MoverGrupo', para: B }), { tipo: 'AvancarTempo', minutos: 600 });
    const acampado = aplicar(cansado, { tipo: 'Acampar' });
    expect(formatarRelogio(acampado.relogio)).toBe('Dia 2, 08:00');
    expect(acampado.viajadoHoje).toBe(0);
  });

  it('avançar o tempo não zera as horas do dia; até a manhã, sim', () => {
    const andou = aplicar(viajando, { tipo: 'MoverGrupo', para: B });
    const avancou = aplicar(andou, { tipo: 'AvancarTempo', minutos: 30 });
    expect(formatarRelogio(avancou.relogio)).toBe('Dia 1, 10:30');
    expect(avancou.viajadoHoje).toBe(120);
    const manha = aplicar(avancou, { tipo: 'AvancarAteAManha' });
    expect(formatarRelogio(manha.relogio)).toBe('Dia 2, 08:00');
    expect(manha.viajadoHoje).toBe(0);
  });

  it('recusa voltar no tempo pelo avanço, mas o mestre acerta o relógio', () => {
    expect(motivo(viajando, { tipo: 'AvancarTempo', minutos: 0 })).toContain('maior que zero');
    expect(formatarRelogio(aplicar(viajando, { tipo: 'AcertarRelogio', relogio: hora(10, 6) }).relogio)).toBe('Dia 10, 06:00');
    expect(motivo(viajando, { tipo: 'AcertarRelogio', relogio: -1 })).toContain('Dia 1');
  });

  it('desfazer volta o último acontecimento, com posição e relógio', () => {
    const andou = aplicar(aplicar(viajando, { tipo: 'MoverGrupo', para: B }), { tipo: 'MoverGrupo', para: C });
    const desfeito = aplicar(andou, { tipo: 'DesfazerViagem' });
    expect(desfeito.posicao).toEqual(B);
    expect(formatarRelogio(desfeito.relogio)).toBe('Dia 1, 10:00');
    expect(desfeito.historico).toHaveLength(1);
    const tudo = aplicar(desfeito, { tipo: 'DesfazerViagem' });
    expect(tudo).toEqual(viajando);
    expect(aplicar(tudo, { tipo: 'DesfazerViagem' })).toBe(tudo);
  });

  it('desfazer um acampamento devolve as horas do dia', () => {
    const andou = aplicar(viajando, { tipo: 'MoverGrupo', para: B });
    expect(aplicar(aplicar(andou, { tipo: 'Acampar' }), { tipo: 'DesfazerViagem' })).toEqual(andou);
  });
});

describe('membros e líder', () => {
  it('o mestre põe e tira membros; tirar o líder deixa o grupo sem líder', () => {
    const comCarla = aplicar({ ...viajando, membros: ['ana'] }, { tipo: 'AdicionarMembro', fichaId: 'bia' });
    expect(comCarla.membros).toEqual(['ana', 'bia']);
    expect(motivo(viajando, { tipo: 'AdicionarMembro', fichaId: 'fantasma' })).toContain('não existe');
    const semLider = aplicar(viajando, { tipo: 'RemoverMembro', fichaId: 'ana' });
    expect(semLider.liderId).toBeNull();
    expect(quemConduz(semLider, contexto)).toBeNull();
  });

  it('só um membro lidera', () => {
    expect(motivo({ ...viajando, membros: ['ana'] }, { tipo: 'DefinirLider', fichaId: 'bia' })).toContain('membro');
    expect(aplicar(viajando, { tipo: 'DefinirLider', fichaId: 'bia' }).liderId).toBe('bia');
  });

  it('uma ficha apagada sai do grupo sozinha, e o líder apagado deixa de conduzir', () => {
    const comApagada = { ...viajando, membros: ['ana', 'apagada'], liderId: 'apagada' };
    expect(membrosPresentes(comApagada, contexto)).toEqual(['ana']);
    expect(quemConduz(comApagada, contexto)).toBeNull();
  });

  it('quem conduz é o dono da ficha do líder', () => {
    expect(quemConduz(viajando, contexto)).toBe('j-ana');
    expect(quemConduz({ ...viajando, liderId: 'guia' }, contexto)).toBe('mestre');
  });
});

describe('loja e permissões', () => {
  function montar(autor: { id: string }, inicial: EstadoGrupo = viajando) {
    const recusas: string[] = [];
    const eventos: EventoExecutado[] = [];
    const loja = criarLojaGrupo(
      inicial,
      { obterAutorId: () => autor.id, aoRecusar: (m) => recusas.push(m), aoExecutar: (e) => eventos.push(e) },
      contexto,
    );
    return { loja, recusas, eventos };
  }

  it('quem controla o líder anda, muda o ritmo, acampa e passa a liderança', () => {
    const { loja, recusas } = montar({ id: 'j-ana' });
    expect(loja.despachar({ tipo: 'DefinirRitmo', ritmo: 'lento' })).toBe(true);
    expect(loja.despachar({ tipo: 'MoverGrupo', para: B })).toBe(true);
    expect(loja.despachar({ tipo: 'Acampar' })).toBe(true);
    expect(loja.despachar({ tipo: 'DefinirLider', fichaId: 'bia' })).toBe(true);
    expect(recusas).toEqual([]);
    expect(loja.obterEstado()).toMatchObject({ posicao: B, ritmo: 'lento', liderId: 'bia' });
    // Depois de passar a liderança, a Ana já não conduz.
    expect(loja.despachar({ tipo: 'MoverGrupo', para: C })).toBe(false);
  });

  it.each<[string, AcaoGrupo]>([
    ['pôr o grupo em qualquer hex', { tipo: 'PosicionarGrupo', coord: LONGE }],
    ['pôr membros', { tipo: 'AdicionarMembro', fichaId: 'bia' }],
    ['tirar membros', { tipo: 'RemoverMembro', fichaId: 'bia' }],
    ['avançar o tempo', { tipo: 'AvancarTempo', minutos: 60 }],
    ['avançar até a manhã', { tipo: 'AvancarAteAManha' }],
    ['acertar o relógio', { tipo: 'AcertarRelogio', relogio: 0 }],
    ['desfazer', { tipo: 'DesfazerViagem' }],
    ['deixar o grupo sem líder', { tipo: 'DefinirLider', fichaId: null }],
  ])('o líder não pode %s', (_nome, acao) => {
    const { loja, recusas } = montar({ id: 'j-ana' });
    expect(loja.despachar(acao)).toBe(false);
    expect(loja.obterEstado()).toBe(viajando);
    expect(recusas).toHaveLength(1);
  });

  it('outro jogador não move o grupo nem muda o ritmo', () => {
    const { loja, recusas } = montar({ id: 'j-bia' });
    loja.despachar({ tipo: 'MoverGrupo', para: B });
    loja.despachar({ tipo: 'DefinirRitmo', ritmo: 'rapido' });
    expect(loja.obterEstado()).toBe(viajando);
    expect(recusas).toEqual([
      'Só o mestre ou quem controla o líder do grupo faz isto.',
      'Só o mestre ou quem controla o líder do grupo faz isto.',
    ]);
  });

  it('com um NPC do mestre na liderança, só o mestre move', () => {
    const { loja } = montar({ id: 'j-ana' }, { ...viajando, liderId: 'guia' });
    expect(loja.despachar({ tipo: 'MoverGrupo', para: B })).toBe(false);
  });

  it('uma ação impossível é recusada com o motivo, sem avisar quem assinou', () => {
    const { loja, recusas } = montar({ id: 'mestre' });
    const ouvinte = vi.fn();
    loja.assinar(ouvinte);
    expect(loja.despachar({ tipo: 'MoverGrupo', para: LONGE })).toBe(false);
    expect(recusas[0]).toContain('vizinho');
    expect(ouvinte).not.toHaveBeenCalled();
  });

  it('avisa quem assinou e registra o passo com o hex de destino', () => {
    const { loja, eventos } = montar({ id: 'j-ana' });
    const ouvinte = vi.fn();
    loja.assinar(ouvinte);
    loja.despachar({ tipo: 'MoverGrupo', para: B });
    expect(ouvinte).toHaveBeenCalledExactlyOnceWith(loja.obterEstado());
    expect(eventos).toEqual([{ tipo: 'MoverGrupo', coord: B, autorId: 'j-ana', agrupamento: null }]);
  });

  it('não avisa quando nada muda, e para de avisar depois de cancelar', () => {
    const { loja } = montar({ id: 'mestre' });
    const ouvinte = vi.fn();
    const cancelar = loja.assinar(ouvinte);
    loja.despachar({ tipo: 'PosicionarGrupo', coord: A });
    expect(ouvinte).not.toHaveBeenCalled();
    cancelar();
    loja.despachar({ tipo: 'PosicionarGrupo', coord: B });
    expect(ouvinte).not.toHaveBeenCalled();
  });
});

describe('montarias, veículos e guias no passo', () => {
  it('um cavalo só ajuda se todos tiverem montaria', () => {
    valores = { ana: { fator_viagem: 1.5 } };
    expect(aplicar(viajando, { tipo: 'MoverGrupo', para: B }).viajadoHoje).toBe(120);
    valores = { ana: { fator_viagem: 1.5 }, bia: { fator_viagem: 1.5 }, guia: { fator_viagem: 1.25 } };
    expect(aplicar(viajando, { tipo: 'MoverGrupo', para: B }).viajadoHoje).toBe(96);
  });

  it('uma carruagem onde cabem todos leva o grupo inteiro', () => {
    valores = { bia: { veiculo_terra_lugares: 3, veiculo_terra_fator: 1.25 } };
    expect(aplicar(viajando, { tipo: 'MoverGrupo', para: B }).viajadoHoje).toBe(96);
    valores = { bia: { veiculo_terra_lugares: 2, veiculo_terra_fator: 1.25 } };
    expect(aplicar(viajando, { tipo: 'MoverGrupo', para: B }).viajadoHoje).toBe(120);
  });

  it('um guia de floresta tira a penalidade ao sair da floresta', () => {
    const naFloresta = { ...viajando, posicao: B };
    expect(aplicar(naFloresta, { tipo: 'MoverGrupo', para: C }).viajadoHoje).toBe(240);
    valores = { guia: { guia_floresta: 1 } };
    expect(aplicar(naFloresta, { tipo: 'MoverGrupo', para: C }).viajadoHoje).toBe(120);
  });
});

describe('visão de cada jogador', () => {
  it('sem efeitos, todos veem os vizinhos', () => {
    expect(alcanceDaVisao(viajando, 'j-ana', contexto)).toBe(1);
    expect(alcanceDaVisao(viajando, 'j-carla', contexto)).toBe(1);
  });

  it('só quem controla a ficha que enxerga longe vê mais', () => {
    valores = { ana: { visao_hexes: 2 } };
    expect(alcanceDaVisao(viajando, 'j-ana', contexto)).toBe(2);
    expect(alcanceDaVisao(viajando, 'j-bia', contexto)).toBe(1);
  });

  it('a visão extra do mestre soma à da ficha e some ao tirar o membro', () => {
    const voando = aplicar(viajando, { tipo: 'DefinirVisaoExtra', fichaId: 'bia', extra: 2 });
    expect(alcanceDaVisao(voando, 'j-bia', contexto)).toBe(3);
    expect(alcanceDaVisao(voando, 'j-ana', contexto)).toBe(1);
    expect(aplicar(voando, { tipo: 'DefinirVisaoExtra', fichaId: 'bia', extra: 0 }).visaoExtra).toEqual({});
    expect(aplicar(voando, { tipo: 'RemoverMembro', fichaId: 'bia' }).visaoExtra).toEqual({});
  });

  it('recusa visão extra negativa ou para quem não é do grupo', () => {
    expect(motivo(viajando, { tipo: 'DefinirVisaoExtra', fichaId: 'bia', extra: -1 })).toContain('zero ou mais');
    expect(motivo({ ...viajando, membros: ['ana'] }, { tipo: 'DefinirVisaoExtra', fichaId: 'bia', extra: 1 })).toContain(
      'membro',
    );
  });

  it('só o mestre dá visão extra', () => {
    const recusas: string[] = [];
    const loja = criarLojaGrupo(viajando, { obterAutorId: () => 'j-ana', aoRecusar: (m) => recusas.push(m) }, contexto);
    expect(loja.despachar({ tipo: 'DefinirVisaoExtra', fichaId: 'ana', extra: 3 })).toBe(false);
    expect(recusas).toEqual(['Só o mestre faz isto no grupo.']);
  });
});

describe('trava do movimento', () => {
  it('com o movimento travado, o líder não anda, mas o mestre sim', () => {
    const travado = aplicar(viajando, { tipo: 'TravarMovimento', travado: true });
    const recusas: string[] = [];
    const doLider = criarLojaGrupo(travado, { obterAutorId: () => 'j-ana', aoRecusar: (m) => recusas.push(m) }, contexto);
    expect(doLider.despachar({ tipo: 'MoverGrupo', para: B })).toBe(false);
    expect(recusas).toEqual(['O mestre travou o movimento do grupo.']);
    expect(aplicar(travado, { tipo: 'MoverGrupo', para: B }).posicao).toEqual(B);
  });

  it('só o mestre trava e destrava', () => {
    const doLider = criarLojaGrupo(viajando, { obterAutorId: () => 'j-ana' }, contexto);
    expect(doLider.despachar({ tipo: 'TravarMovimento', travado: true })).toBe(false);
    expect(aplicar(viajando, { tipo: 'TravarMovimento', travado: false })).toBe(viajando);
  });

  it('o líder recebe o motivo de não poder andar; os outros, nada', () => {
    const travado = { ...viajando, movimentoTravado: true };
    expect(motivoParaNaoConduzir(travado, 'j-ana', contexto)).toBe('O mestre travou o movimento do grupo.');
    expect(motivoParaNaoConduzir(travado, 'j-bia', contexto)).toBeNull();
    expect(motivoParaNaoConduzir(travado, 'mestre', contexto)).toBeNull();
    expect(motivoParaNaoConduzir(viajando, 'j-ana', contexto)).toBeNull();
  });

  it('podeConduzir: o mestre sempre; o líder, se não estiver travado; os outros, nunca', () => {
    expect(podeConduzir(viajando, 'mestre', contexto)).toBe(true);
    expect(podeConduzir(viajando, 'j-ana', contexto)).toBe(true);
    expect(podeConduzir(viajando, 'j-bia', contexto)).toBe(false);
    expect(podeConduzir({ ...viajando, movimentoTravado: true }, 'j-ana', contexto)).toBe(false);
  });
});

describe('passos possíveis e trilha', () => {
  it('mostra os 6 vizinhos, com o custo ou o motivo', () => {
    const passos = passosPossiveis(viajando, contexto);
    expect(passos).toHaveLength(6);
    const paraB = passos.find((p) => p.coord.q === B.q && p.coord.r === B.r);
    expect(paraB).toMatchObject({ ok: true, minutos: 120, marchaForcada: false });
    expect(passos.filter((p) => !p.ok).every((p) => !p.ok && p.motivo.includes('Não há terreno'))).toBe(true);
    expect(passosPossiveis(GRUPO_INICIAL, contexto)).toEqual([]);
  });

  it('avisa quando o passo passa das horas de viagem do dia', () => {
    const cansado = { ...viajando, viajadoHoje: 7 * 60 };
    const paraB = passosPossiveis(cansado, contexto).find((p) => p.coord.q === B.q && p.coord.r === B.r);
    expect(paraB).toMatchObject({ ok: true, marchaForcada: true });
  });

  it('a trilha recomeça quando o mestre posiciona o grupo', () => {
    let estado = aplicar(viajando, { tipo: 'MoverGrupo', para: B });
    estado = aplicar(estado, { tipo: 'MoverGrupo', para: C });
    expect(trilhaDoGrupo(estado)).toEqual([A, B, C]);
    estado = aplicar(estado, { tipo: 'PosicionarGrupo', coord: LONGE });
    expect(trilhaDoGrupo(estado)).toEqual([LONGE]);
    estado = aplicar(estado, { tipo: 'AvancarTempo', minutos: 10 });
    expect(trilhaDoGrupo(estado)).toEqual([LONGE]);
  });

  it('formata a duração de um passo', () => {
    expect(formatarDuracao(120)).toBe('2 h');
    expect(formatarDuracao(90)).toBe('1 h 30 min');
    expect(formatarDuracao(45)).toBe('45 min');
  });
});

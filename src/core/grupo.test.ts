import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alcanceDaVisao,
  aplicarAcaoGrupo,
  formatarDuracao,
  grupoNumPovoado,
  motivoParaNaoConduzir,
  passosPossiveis,
  podeConduzir,
  trilhaDoGrupo,
  grupoVistoPor,
  candidatos,
  contagemDaEleicao,
  eleitores,
  permissaoNoGrupo,
  votosValidos,
  VOTO_SECRETO,
  criarLojaGrupo,
  fimDoDescansoLongo,
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
    expect(formatarRelogio(fimDoDescansoLongo(hora(1, 20), VIAGEM))).toBe('Dia 2, 08:00');
    expect(formatarRelogio(fimDoDescansoLongo(hora(2, 2), VIAGEM))).toBe('Dia 2, 10:00');
    expect(formatarRelogio(fimDoDescansoLongo(hora(1, 8), VIAGEM))).toBe('Dia 2, 08:00');
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
    const acampado = aplicar(cansado, { tipo: 'Descansar', descanso: 'longo', lugar: 'acampamento' });
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
    expect(aplicar(aplicar(andou, { tipo: 'Descansar', descanso: 'longo', lugar: 'acampamento' }), { tipo: 'DesfazerViagem' })).toEqual(andou);
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
    expect(loja.despachar({ tipo: 'Descansar', descanso: 'longo', lugar: 'acampamento' })).toBe(true);
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

describe('descansos', () => {
  const longo = { tipo: 'Descansar', descanso: 'longo', lugar: 'acampamento' } as const;
  const curto = { tipo: 'Descansar', descanso: 'curto', lugar: 'acampamento' } as const;

  it('o curto leva 1 h e não zera as horas do dia; o longo vai até a manhã e zera', () => {
    const andou = aplicar(viajando, { tipo: 'MoverGrupo', para: B });
    const descansouPouco = aplicar(andou, curto);
    expect(formatarRelogio(descansouPouco.relogio)).toBe('Dia 1, 11:00');
    expect(descansouPouco.viajadoHoje).toBe(120);
    const dormiu = aplicar(andou, longo);
    expect(formatarRelogio(dormiu.relogio)).toBe('Dia 2, 08:00');
    expect(dormiu.viajadoHoje).toBe(0);
  });

  it('cada membro fica com o descanso pendente; o longo vale mais que o curto', () => {
    const descansou = aplicar(viajando, curto);
    expect(descansou.descansosPendentes).toEqual({ ana: 'curto', bia: 'curto', guia: 'curto' });
    expect(aplicar(descansou, longo).descansosPendentes).toEqual({ ana: 'longo', bia: 'longo', guia: 'longo' });
    const comLongo = aplicar(viajando, longo);
    expect(aplicar(comLongo, curto).descansosPendentes.ana).toBe('longo');
  });

  it('o diário guarda o tipo, o lugar e o nome do lugar', () => {
    const naEstalagem = aplicar(viajando, { tipo: 'Descansar', descanso: 'longo', lugar: 'abrigo', nomeDoLugar: ' Estalagem do Javali ' });
    expect(naEstalagem.historico.at(-1)?.acontecimento).toEqual({
      tipo: 'descansou',
      descanso: 'longo',
      lugar: 'abrigo',
      nomeDoLugar: 'Estalagem do Javali',
    });
  });

  it('o dono aplica o descanso da própria ficha; outro jogador não; o mestre aplica em qualquer uma', () => {
    const descansou = aplicar(viajando, longo);
    const recusas: string[] = [];
    const daBia = criarLojaGrupo(descansou, { obterAutorId: () => 'j-bia', aoRecusar: (m) => recusas.push(m) }, contexto);
    expect(daBia.despachar({ tipo: 'ConcluirDescanso', fichaId: 'ana' })).toBe(false);
    expect(daBia.despachar({ tipo: 'ConcluirDescanso', fichaId: 'bia' })).toBe(true);
    expect(daBia.obterEstado().descansosPendentes).toEqual({ ana: 'longo', guia: 'longo' });
    expect(recusas).toEqual(['Só o dono da ficha (ou o mestre) aplica o descanso nela.']);
    expect(aplicar(descansou, { tipo: 'ConcluirDescanso', fichaId: 'guia' }).descansosPendentes).toEqual({ ana: 'longo', bia: 'longo' });
  });

  it('desfazer o descanso devolve as pendências de antes; desfazer um passo não mexe nelas', () => {
    const descansou = aplicar(viajando, longo);
    expect(aplicar(descansou, { tipo: 'DesfazerViagem' }).descansosPendentes).toEqual({});
    const concluiu = aplicar(descansou, { tipo: 'ConcluirDescanso', fichaId: 'ana' });
    const andou = aplicar(concluiu, { tipo: 'MoverGrupo', para: B });
    expect(aplicar(andou, { tipo: 'DesfazerViagem' }).descansosPendentes).toEqual({ bia: 'longo', guia: 'longo' });
  });

  it('tirar um membro tira a pendência dele', () => {
    const descansou = aplicar(viajando, longo);
    expect(aplicar(descansou, { tipo: 'RemoverMembro', fichaId: 'bia' }).descansosPendentes).toEqual({ ana: 'longo', guia: 'longo' });
  });

  it('o líder pede abrigo só num povoado; o mestre, em qualquer lugar', () => {
    const abrigo = { tipo: 'Descansar', descanso: 'longo', lugar: 'abrigo' } as const;
    const recusas: string[] = [];
    const doLider = criarLojaGrupo(viajando, { obterAutorId: () => 'j-ana', aoRecusar: (m) => recusas.push(m) }, contexto);
    expect(grupoNumPovoado(viajando, contexto)).toBe(false);
    expect(doLider.despachar(abrigo)).toBe(false);
    expect(recusas[0]).toContain('povoado');
    expect(doLider.despachar(longo)).toBe(true);
    expect(aplicar(viajando, abrigo).historico.at(-1)?.acontecimento).toMatchObject({ lugar: 'abrigo' });
  });
});

describe('anotações e diário só do mestre', () => {
  it('o mestre anota no diário sem mexer no relógio; anotação vazia é recusada', () => {
    const anotou = aplicar(viajando, { tipo: 'AnotarNaViagem', texto: '  emboscada de goblins ' });
    expect(anotou.historico.at(-1)?.acontecimento).toEqual({ tipo: 'anotou', texto: 'emboscada de goblins' });
    expect(anotou.relogio).toBe(viajando.relogio);
    expect(motivo(viajando, { tipo: 'AnotarNaViagem', texto: '   ' })).toBe('Escreva alguma coisa para anotar no diário.');
    expect(aplicar(anotou, { tipo: 'DesfazerViagem' }).historico).toEqual([]);
  });

  it('só o mestre anota, nem quem controla o líder', () => {
    const daAna = criarLojaGrupo(viajando, { obterAutorId: () => 'j-ana' }, contexto);
    expect(daAna.despachar({ tipo: 'AnotarNaViagem', texto: 'oi' })).toBe(false);
  });

  it('os jogadores recebem o grupo sem o diário', () => {
    const andou = aplicar(viajando, { tipo: 'MoverGrupo', para: B });
    expect(grupoVistoPor(andou, 'mestre').historico).toHaveLength(1);
    const daAna = grupoVistoPor(andou, 'j-ana');
    expect(daAna.historico).toEqual([]);
    expect(daAna.posicao).toEqual(B);
  });
});

describe('eleição do líder', () => {
  /** Ana tem duas fichas (ana e ana2), Bia uma, e o mestre um NPC (guia). */
  const DONOS_ELEICAO: Record<string, string> = { ana: 'j-ana', ana2: 'j-ana', bia: 'j-bia', guia: 'mestre' };
  const ctx: ContextoDoGrupo = { ...contexto, obterDonoDaFicha: (id) => DONOS_ELEICAO[id] ?? null };
  const grupo: EstadoGrupo = { ...GRUPO_INICIAL, posicao: A, membros: ['ana', 'ana2', 'bia', 'guia'], liderId: 'ana' };

  function como(autorId: string, estado: EstadoGrupo, acao: AcaoGrupo): EstadoGrupo {
    const permissao = permissaoNoGrupo(estado, acao, autorId, ctx);
    if (!permissao.ok) {
      throw new Error(permissao.motivo);
    }
    const r = aplicarAcaoGrupo(estado, acao, autorId, ctx);
    if (!r.ok) {
      throw new Error(r.motivo);
    }
    return r.estado;
  }

  it('vota um jogador por vez, não uma ficha; o mestre não vota; NPCs não são candidatos', () => {
    expect(eleitores(grupo, ctx)).toEqual(['j-ana', 'j-bia']);
    expect(candidatos(grupo, ctx)).toEqual(['ana', 'ana2', 'bia']);
    const aberta = como('j-bia', grupo, { tipo: 'PedirEleicao' });
    expect(() => como('mestre', aberta, { tipo: 'Votar', fichaId: 'bia' })).toThrow('O mestre não vota');
    expect(() => como('j-bia', aberta, { tipo: 'Votar', fichaId: 'guia' })).toThrow('personagem de jogador');
    expect(() => como('j-cid', grupo, { tipo: 'PedirEleicao' })).toThrow('Só quem tem um personagem no grupo');
  });

  it('com todos os votos, conta sozinha e o mais votado lidera; pode trocar o voto antes', () => {
    let e = como('j-ana', grupo, { tipo: 'PedirEleicao' });
    e = como('j-ana', e, { tipo: 'Votar', fichaId: 'ana' });
    e = como('j-ana', e, { tipo: 'Votar', fichaId: 'bia' });
    expect(e.eleicao?.votos).toEqual({ 'j-ana': 'bia' });
    e = como('j-bia', e, { tipo: 'Votar', fichaId: 'bia' });
    expect(e.eleicao).toBeNull();
    expect(e.liderId).toBe('bia');
    expect(e.ultimaEleicao).toEqual({ vencedorId: 'bia', contagem: { bia: 2 }, desempatePeloMestre: false });
  });

  it('no empate, o mestre escolhe entre os empatados', () => {
    let e = como('j-ana', grupo, { tipo: 'PedirEleicao' });
    e = como('j-ana', e, { tipo: 'Votar', fichaId: 'ana' });
    e = como('j-bia', e, { tipo: 'Votar', fichaId: 'bia' });
    expect(e.eleicao?.empatados).toEqual(['ana', 'bia']);
    expect(() => como('j-ana', e, { tipo: 'Votar', fichaId: 'bia' })).toThrow('empatou');
    expect(() => como('j-ana', e, { tipo: 'DesempatarEleicao', fichaId: 'ana' })).toThrow('Só o mestre');
    expect(() => como('mestre', e, { tipo: 'DesempatarEleicao', fichaId: 'ana2' })).toThrow('Escolha um dos empatados');
    e = como('mestre', e, { tipo: 'DesempatarEleicao', fichaId: 'bia' });
    expect(e.liderId).toBe('bia');
    expect(e.ultimaEleicao).toEqual({ vencedorId: 'bia', contagem: { ana: 1, bia: 1 }, desempatePeloMestre: true });
  });

  it('o mestre encerra antes; sem votos, nada muda', () => {
    const aberta = como('j-ana', grupo, { tipo: 'PedirEleicao' });
    const semVotos = como('mestre', aberta, { tipo: 'EncerrarEleicao' });
    expect(semVotos.liderId).toBe('ana');
    expect(semVotos.ultimaEleicao).toEqual({ vencedorId: null, contagem: {}, desempatePeloMestre: false });
    const umVoto = como('mestre', como('j-bia', aberta, { tipo: 'Votar', fichaId: 'bia' }), { tipo: 'EncerrarEleicao' });
    expect(umVoto.liderId).toBe('bia');
  });

  it('cancelam o mestre e quem pediu; uma eleição por vez; precisa de dois candidatos', () => {
    const aberta = como('j-ana', grupo, { tipo: 'PedirEleicao' });
    expect(() => como('j-bia', aberta, { tipo: 'CancelarEleicao' })).toThrow('quem pediu');
    expect(como('j-ana', aberta, { tipo: 'CancelarEleicao' }).eleicao).toBeNull();
    expect(como('mestre', aberta, { tipo: 'CancelarEleicao' }).eleicao).toBeNull();
    expect(() => como('j-bia', aberta, { tipo: 'PedirEleicao' })).toThrow('Já há uma eleição');
    const sozinha = { ...grupo, membros: ['bia', 'guia'] };
    expect(() => como('mestre', sozinha, { tipo: 'PedirEleicao' })).toThrow('pelo menos dois');
  });

  it('quem sai do grupo perde o voto; votos num candidato que saiu deixam de valer', () => {
    let e = como('j-ana', grupo, { tipo: 'PedirEleicao' });
    e = como('j-ana', e, { tipo: 'Votar', fichaId: 'ana2' });
    e = como('mestre', e, { tipo: 'RemoverMembro', fichaId: 'ana2' });
    expect(votosValidos(e, ctx)).toEqual({});
    e = como('j-ana', e, { tipo: 'Votar', fichaId: 'ana' });
    expect(e.eleicao).not.toBeNull();
    expect(contagemDaEleicao(e, ctx)).toEqual({ ana: 1 });
  });

  it('cada jogador vê o próprio voto e só que os outros votaram; o mestre vê tudo', () => {
    let e = como('j-ana', grupo, { tipo: 'PedirEleicao' });
    e = como('j-ana', e, { tipo: 'Votar', fichaId: 'bia' });
    expect(grupoVistoPor(e, 'j-ana').eleicao?.votos).toEqual({ 'j-ana': 'bia' });
    const daBia = grupoVistoPor(e, 'j-bia');
    expect(daBia.eleicao?.votos).toEqual({ 'j-ana': VOTO_SECRETO });
    expect(Object.keys(votosValidos(daBia, ctx))).toEqual(['j-ana']);
    expect(contagemDaEleicao(daBia, ctx)).toEqual({});
    expect(grupoVistoPor(e, 'mestre').eleicao?.votos).toEqual({ 'j-ana': 'bia' });
  });
});

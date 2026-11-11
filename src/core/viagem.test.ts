import { describe, expect, it } from 'vitest';
import { aplicarAcao, criarMapaVazio, type EstadoMapa } from './mapa';
import type { CoordHex } from './hex';
import {
  lerViagem,
  multiplicadorDasTags,
  problemasNaViagem,
  REGRAS_DE_VIAGEM_PADRAO as VIAGEM,
  tagsDoTile,
  tempoDoPasso,
  type MembroNaViagem,
  type RegrasDeViagem,
} from './viagem';

const ids = (tile: string, viagem: RegrasDeViagem = VIAGEM) => tagsDoTile(viagem, tile).map((t) => t.id);

function mapaCom(...tiles: [CoordHex, string][]): EstadoMapa {
  return tiles.reduce<EstadoMapa>(
    (mapa, [coord, terreno]) => aplicarAcao(mapa, { tipo: 'ColocarTile', coord, terreno }),
    criarMapaVazio(),
  );
}

const A = { q: 0, r: 0 };
const B = { q: 1, r: 0 };

describe('tags de terreno', () => {
  it('saem do nome do arquivo do tile, sem marcar nada à mão', () => {
    expect(ids('hexPlains00')).toEqual(['campo']);
    expect(ids('hexForestBroadleaf00')).toEqual(['floresta']);
    expect(ids('hexMountainSnow00')).toEqual(['montanha', 'neve']);
    expect(ids('hexForestPineSnowCovered00')).toEqual(['floresta', 'neve']);
    expect(ids('hexDirtVillage00')).toEqual(['povoado']);
    expect(ids('hexVolcanoActive00')).toEqual(['montanha', 'lava']);
    expect(ids('hexOcean00')).toEqual(['agua']);
    expect(ids('hexDirt00')).toEqual([]);
  });

  it('um tile com tags escolhidas ignora o nome do arquivo', () => {
    expect(ids('hexDesertYellowCactiForest00')).toEqual(['deserto']);
    expect(ids('hexMountainSnow00', { ...VIAGEM, tagsPorTile: { hexMountainSnow00: [] } })).toEqual([]);
  });

  it('as tags se multiplicam: montanha com neve atrapalha mais que cada uma', () => {
    const montanha = multiplicadorDasTags(tagsDoTile(VIAGEM, 'hexMountain00'));
    const neve = multiplicadorDasTags(tagsDoTile(VIAGEM, 'hexSnowField00'));
    const as2 = multiplicadorDasTags(tagsDoTile(VIAGEM, 'hexMountainSnow00'));
    expect([montanha, neve, as2]).toEqual([2, 1.5, 3]);
  });
});

describe('tempo de um passo', () => {
  it('no ritmo normal, 9 km a 4,5 km/h dão 2 h em terreno aberto', () => {
    const passo = tempoDoPasso(VIAGEM, mapaCom([A, 'hexPlains00'], [B, 'hexPlains00']), A, B, 'normal');
    expect(passo.ok && passo.horas).toBe(2);
  });

  it('conta o terreno de onde o grupo sai, não o de destino', () => {
    const daFloresta = tempoDoPasso(VIAGEM, mapaCom([A, 'hexForestBroadleaf00'], [B, 'hexDirtVillage00']), A, B, 'normal');
    const daCidade = tempoDoPasso(VIAGEM, mapaCom([A, 'hexDirtVillage00'], [B, 'hexForestBroadleaf00']), A, B, 'normal');
    expect(daFloresta.ok && daFloresta.horas).toBe(4);
    expect(daCidade.ok && daCidade.horas).toBe(1);
  });

  it('explica a conta: base do ritmo e cada tag que muda o tempo', () => {
    const passo = tempoDoPasso(VIAGEM, mapaCom([A, 'hexMountainSnow00'], [B, 'hexPlains00']), A, B, 'lento');
    expect(passo.ok && passo.horas).toBe(9);
    expect(passo.ok && passo.partes.map((p) => [p.texto, p.valor])).toEqual([
      ['Ritmo lento: 9 km a 3 km/h', 3],
      ['Montanha', 2],
      ['Neve', 1.5],
    ]);
  });

  it('o ritmo rápido encurta o passo; um ritmo desconhecido vale o normal', () => {
    const mapa = mapaCom([A, 'hexPlains00'], [B, 'hexPlains00']);
    const rapido = tempoDoPasso(VIAGEM, mapa, A, B, 'rapido');
    const sumido = tempoDoPasso(VIAGEM, mapa, A, B, 'galope');
    expect(rapido.ok && rapido.horas).toBe(1.5);
    expect(sumido.ok && sumido.horas).toBe(2);
  });

  it('recusa hex que não é vizinho, sem terreno ou intransponível', () => {
    const mapa = mapaCom([A, 'hexPlains00'], [B, 'hexOcean00'], [{ q: 3, r: 0 }, 'hexPlains00']);
    const motivo = (para: CoordHex) => {
      const passo = tempoDoPasso(VIAGEM, mapa, A, para, 'normal');
      return passo.ok ? '' : passo.motivo;
    };
    expect(motivo({ q: 3, r: 0 })).toContain('vizinho');
    expect(motivo({ q: 0, r: 1 })).toContain('Não há terreno');
    expect(motivo(B)).toContain('água');
  });

  it('o grupo pode sair de um hex intransponível onde o mestre o pôs', () => {
    const passo = tempoDoPasso(VIAGEM, mapaCom([A, 'hexOcean00'], [B, 'hexPlains00']), A, B, 'normal');
    expect(passo.ok && passo.horas).toBe(2);
  });
});

describe('montarias, veículos, barcos e guias', () => {
  const PADROES: Record<string, number> = { fator_viagem: 1, veiculo_terra_fator: 1, veiculo_agua_fator: 1 };
  const membro = (nome: string, valores: Record<string, number> = {}): MembroNaViagem => ({
    nome,
    valor: (n) => valores[n] ?? PADROES[n] ?? 0,
  });
  const PLANICIES = mapaCom([A, 'hexPlains00'], [B, 'hexPlains00']);
  const horas = (membros: MembroNaViagem[], mapa = PLANICIES) => {
    const passo = tempoDoPasso(VIAGEM, mapa, A, B, 'normal', membros);
    return passo.ok ? passo.horas : passo.motivo;
  };

  it('vale o mais lento: o cavalo de um só não acelera o grupo', () => {
    expect(horas([membro('Ana', { fator_viagem: 1.5 }), membro('Bia')])).toBe(2);
    expect(horas([membro('Ana', { fator_viagem: 2 }), membro('Bia', { fator_viagem: 2 })])).toBe(1);
  });

  it('a explicação diz quem segura o grupo', () => {
    const passo = tempoDoPasso(VIAGEM, PLANICIES, A, B, 'normal', [
      membro('Ana', { fator_viagem: 2 }),
      membro('Bia', { fator_viagem: 1.25 }),
    ]);
    expect(passo.ok && passo.partes.map((p) => p.texto)).toEqual([
      'Ritmo normal: 9 km a 4,5 km/h',
      'Velocidade do mais lento (Bia)',
    ]);
  });

  it('um veículo onde cabem todos leva o grupo; com lugares de menos, não', () => {
    const carruagem = { veiculo_terra_lugares: 2, veiculo_terra_fator: 2 };
    expect(horas([membro('Ana', carruagem), membro('Bia')])).toBe(1);
    expect(horas([membro('Ana', carruagem), membro('Bia'), membro('Caio')])).toBe(2);
  });

  it('o veículo não atrasa quem já anda mais rápido', () => {
    const lento = { veiculo_terra_lugares: 4, veiculo_terra_fator: 1.25, fator_viagem: 2 };
    expect(horas([membro('Ana', lento), membro('Bia', { fator_viagem: 2 })])).toBe(1);
  });

  it('um barco onde cabem todos deixa entrar na água e leva o grupo nela', () => {
    const costa = mapaCom([A, 'hexPlains00'], [B, 'hexOcean00']);
    const barco = { veiculo_agua_lugares: 4, veiculo_agua_fator: 0.5 };
    expect(horas([membro('Ana'), membro('Bia')], costa)).toContain('sem um barco');
    expect(horas([membro('Ana', barco), membro('Bia')], costa)).toBe(2);
    const mar = mapaCom([A, 'hexOcean00'], [B, 'hexOcean00']);
    expect(horas([membro('Ana', barco), membro('Bia')], mar)).toBe(4);
    // Montarias não ajudam no mar.
    expect(horas([membro('Ana', { ...barco, fator_viagem: 2 }), membro('Bia', { fator_viagem: 2 })], mar)).toBe(4);
  });

  it('um guia tira a penalidade do terreno dele, mas não o bônus das estradas', () => {
    const daFloresta = mapaCom([A, 'hexForestPineSnowCovered00'], [B, 'hexPlains00']);
    expect(horas([membro('Ana'), membro('Bia')], daFloresta)).toBe(6);
    expect(horas([membro('Ana', { guia_floresta: 1 }), membro('Bia')], daFloresta)).toBe(3);
    expect(horas([membro('Ana', { guia_floresta: 1, guia_neve: 1 })], daFloresta)).toBe(2);
    const daVila = mapaCom([A, 'hexDirtVillage00'], [B, 'hexPlains00']);
    expect(horas([membro('Ana', { guia_povoado: 1 })], daVila)).toBe(1);
  });

  it('a explicação mostra o guia', () => {
    const daFloresta = mapaCom([A, 'hexForestBroadleaf00'], [B, 'hexPlains00']);
    const passo = tempoDoPasso(VIAGEM, daFloresta, A, B, 'normal', [membro('Ana', { guia_floresta: 1 })]);
    expect(passo.ok && passo.partes.map((p) => p.texto)).toContain('Floresta, sem penalidade (guia: Ana)');
  });
});

describe('conferência e leitura', () => {
  it('as regras padrão não têm problema e voltam iguais depois de gravadas', () => {
    expect(problemasNaViagem(VIAGEM)).toEqual([]);
    expect(lerViagem(JSON.parse(JSON.stringify(VIAGEM)), VIAGEM)).toEqual(VIAGEM);
    expect(lerViagem(undefined, VIAGEM)).toBe(VIAGEM);
  });

  it.each<[string, Partial<RegrasDeViagem>, string]>([
    ['hex de tamanho zero', { kmPorHex: 0 }, 'tamanho do hex'],
    ['dia de 30 horas', { horasPorDia: 30 }, 'até 24'],
    ['partida às 24 h', { horaDaPartida: 24 }, 'hora da partida'],
    ['descanso negativo', { horasDeDescanso: -1 }, 'horas de descanso'],
    ['descanso curto de 30 h', { horasDeDescansoCurto: 30 }, 'descanso curto'],
    ['sem ritmos', { ritmos: [] }, 'ao menos um ritmo'],
    ['ritmo parado', { ritmos: [{ id: 'x', nome: 'X', kmPorHora: 0, nota: '' }] }, 'velocidade'],
    ['tag repetida', { tags: [...VIAGEM.tags, VIAGEM.tags[0]] }, 'duas tags'],
    ['tag sem efeito', { tags: [{ ...VIAGEM.tags[0], multiplicador: -1 }] }, 'multiplicador'],
    ['tile com tag que não existe', { tagsPorTile: { hexPlains00: ['lamaçal'] } }, 'não existe'],
  ])('aponta problemas: %s', (_nome, mudanca, trecho) => {
    expect(problemasNaViagem({ ...VIAGEM, ...mudanca }).map((p) => p.erro).join(' ')).toContain(trecho);
  });

  it('tags gravadas antes dos barcos: só a água é navegável', () => {
    const antigas = JSON.parse(JSON.stringify(VIAGEM));
    for (const tag of antigas.tags) {
      delete tag.navegavel;
    }
    expect(lerViagem(antigas, VIAGEM)).toEqual(VIAGEM);
  });

  it('um bloco gravado sem a hora da partida e o descanso ganha os padrões', () => {
    const { horaDaPartida: _p, horasDeDescanso: _d, horasDeDescansoCurto: _c, ...antigo } = VIAGEM;
    expect(lerViagem(JSON.parse(JSON.stringify(antigo)), VIAGEM)).toEqual(VIAGEM);
  });

  it('recusa um bloco de viagem malformado', () => {
    expect(() => lerViagem({ ...VIAGEM, tags: 'floresta' }, VIAGEM)).toThrow('tags de terreno');
    expect(() => lerViagem({ ...VIAGEM, kmPorHex: '9' }, VIAGEM)).toThrow('kmPorHex');
  });
});

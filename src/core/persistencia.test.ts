import { describe, expect, it } from 'vitest';
import { APARENCIA_PADRAO, type AparenciaOculta } from './aparencia';
import { GRUPO_SEM_POSICAO, type EstadoGrupo } from './grupo';
import { aplicarAcao, criarMapaVazio, type EstadoMapa } from './mapa';
import type { Manifesto } from './manifesto';
import { assetsDesconhecidos, desserializarMapa, serializarMapa } from './persistencia';
import { SO_MESTRE, VISIVEL_A_TODOS } from './visibilidade';

const A = { q: -2, r: 3 };
const B = { q: 1, r: 0 };

function mapaExemplo(): EstadoMapa {
  return [
    { tipo: 'ColocarTile', coord: A, terreno: 'hexPlains00' },
    { tipo: 'ColocarTile', coord: B, terreno: 'hexHills00' },
    {
      tipo: 'ColocarDecoracao',
      coord: A,
      decoracao: { id: 'd1', assetId: 'house00', deslocamento: { x: 10.5, y: -20 } },
    },
    { tipo: 'EditarInformacaoHex', coord: A, campos: { nome: 'Vau', descricao: 'Rio "raso"\nAo norte' } },
    { tipo: 'AdicionarNota', coord: A, nota: { id: 'n1', texto: 'Ponte', visibilidade: VISIVEL_A_TODOS } },
    { tipo: 'AdicionarNota', coord: A, nota: { id: 'n2', texto: 'Dragão', visibilidade: SO_MESTRE } },
  ].reduce(aplicarAcao as never, criarMapaVazio()) as EstadoMapa;
}

const hexValido = {
  q: 0,
  r: 0,
  terreno: 't',
  decoracoes: [],
  nome: '',
  descricao: '',
  notas: [],
  revelado: false,
};
const arquivo = (conteudo: unknown) => JSON.stringify(conteudo);
const comHexes = (...hexes: unknown[]) =>
  arquivo({ versao: 3, aparenciaOculta: APARENCIA_PADRAO, posicaoGrupo: null, hexes });
const decoracao = (id: string) => ({ id, assetId: 'a', deslocamento: { x: 0, y: 0 } });
const nota = (id: string) => ({ id, texto: 'x', visibilidade: { tipo: 'mestre' } });

function erroDe(texto: string): string {
  const resultado = desserializarMapa(texto);
  if (resultado.ok) {
    throw new Error('Era esperado um erro de leitura.');
  }
  return resultado.erro;
}

describe('salvar e carregar', () => {
  it('um mapa salvo e carregado volta idêntico', () => {
    const mapa = mapaExemplo();
    expect(desserializarMapa(serializarMapa(mapa, GRUPO_SEM_POSICAO))).toEqual({
      ok: true,
      estado: mapa,
      grupo: GRUPO_SEM_POSICAO,
    });
  });

  it('um mapa vazio também funciona', () => {
    expect(desserializarMapa(serializarMapa(criarMapaVazio(), GRUPO_SEM_POSICAO))).toEqual({
      ok: true,
      estado: criarMapaVazio(),
      grupo: GRUPO_SEM_POSICAO,
    });
  });

  it('preserva revelação, posição do grupo e cada tipo de aparência', () => {
    const fundos: AparenciaOculta['fundo'][] = [
      { tipo: 'escuro', grid: true },
      { tipo: 'neblina', variante: 'clara' },
      { tipo: 'tile', assetId: 'hexVoid00' },
    ];
    for (const fundo of fundos) {
      const aparencia: AparenciaOculta = { fundo, bordasSuaves: true };
      let mapa = aplicarAcao(mapaExemplo(), { tipo: 'RevelarHex', coord: B });
      mapa = aplicarAcao(mapa, { tipo: 'DefinirAparenciaOculta', aparencia });
      const grupo = { ...GRUPO_SEM_POSICAO, posicao: { q: -3, r: 4 } };
      expect(desserializarMapa(serializarMapa(mapa, grupo))).toEqual({
        ok: true,
        estado: mapa,
        grupo,
      });
    }
  });
});

describe('o grupo no arquivo (versão 4)', () => {
  const grupoCompleto: EstadoGrupo = {
    posicao: { q: 1, r: 0 },
    membros: ['f1', 'f2'],
    liderId: 'f1',
    ritmo: 'rapido',
    relogio: 2000,
    viajadoHoje: 90,
    visaoExtra: { f2: 2 },
    historico: [
      {
        id: 1,
        autorId: 'mestre',
        acontecimento: { tipo: 'posicionou', para: { q: 0, r: 0 } },
        antes: { posicao: null, relogio: 1910, viajadoHoje: 0 },
        relogioDepois: 1910,
      },
      {
        id: 2,
        autorId: 'j1',
        acontecimento: { tipo: 'passo', de: { q: 0, r: 0 }, para: { q: 1, r: 0 }, minutos: 90, ritmo: 'rapido', tags: ['campo'] },
        antes: { posicao: { q: 0, r: 0 }, relogio: 1910, viajadoHoje: 0 },
        relogioDepois: 2000,
      },
      { id: 3, autorId: 'mestre', acontecimento: { tipo: 'acampou' }, antes: { posicao: { q: 1, r: 0 }, relogio: 2000, viajadoHoje: 90 }, relogioDepois: 2000 },
      { id: 4, autorId: 'mestre', acontecimento: { tipo: 'avancou', ateAManha: true }, antes: { posicao: { q: 1, r: 0 }, relogio: 2000, viajadoHoje: 90 }, relogioDepois: 2000 },
      { id: 5, autorId: 'mestre', acontecimento: { tipo: 'acertouRelogio' }, antes: { posicao: { q: 1, r: 0 }, relogio: 2000, viajadoHoje: 90 }, relogioDepois: 2000 },
    ],
  };

  it('guarda membros, líder, ritmo, relógio e o diário, e volta igual', () => {
    expect(desserializarMapa(serializarMapa(criarMapaVazio(), grupoCompleto))).toEqual({
      ok: true,
      estado: criarMapaVazio(),
      grupo: grupoCompleto,
    });
  });

  it('um grupo gravado antes da visão extra ganha uma vazia', () => {
    const { visaoExtra: _v, ...antigo } = grupoCompleto;
    const resultado = desserializarMapa(arquivo({ versao: 4, aparenciaOculta: APARENCIA_PADRAO, grupo: antigo, hexes: [] }));
    expect(resultado.ok && resultado.grupo.visaoExtra).toEqual({});
  });

  it('um mapa da versão 3 mantém a posição do grupo e ganha o resto padrão', () => {
    const resultado = desserializarMapa(
      arquivo({ versao: 3, aparenciaOculta: APARENCIA_PADRAO, posicaoGrupo: { q: 2, r: 2 }, hexes: [hexValido] }),
    );
    expect(resultado.ok && resultado.grupo).toEqual({ ...GRUPO_SEM_POSICAO, posicao: { q: 2, r: 2 } });
    expect(resultado.ok && resultado.estado.hexes['0,0']).toBeTruthy();
  });

  const comGrupo = (grupo: unknown) => arquivo({ versao: 4, aparenciaOculta: APARENCIA_PADRAO, grupo, hexes: [] });

  it.each<[string, unknown, string]>([
    ['ausente', undefined, 'não tem o grupo'],
    ['com membros repetidos', { ...grupoCompleto, membros: ['f1', 'f1'] }, 'repetidos'],
    ['com relógio negativo', { ...grupoCompleto, relogio: -5 }, 'relógio'],
    ['com líder numérico', { ...grupoCompleto, liderId: 3 }, 'líder'],
    ['sem diário', { ...grupoCompleto, historico: undefined }, 'diário'],
    ['com visão extra negativa', { ...grupoCompleto, visaoExtra: { f1: -1 } }, 'visão extra'],
    [
      'com acontecimento desconhecido',
      { ...grupoCompleto, historico: [{ ...grupoCompleto.historico[0], acontecimento: { tipo: 'voou' } }] },
      'desconhecido',
    ],
    [
      'com um passo sem destino',
      { ...grupoCompleto, historico: [{ ...grupoCompleto.historico[1], acontecimento: { ...grupoCompleto.historico[1].acontecimento, para: null } }] },
      'destino',
    ],
  ])('recusa um grupo %s', (_nome, grupo, trecho) => {
    expect(erroDe(comGrupo(grupo))).toContain(trecho);
  });
});

describe('mapas na versão 2', () => {
  const antigo = arquivo({
    versao: 2,
    hexes: [
      { q: 1, r: 1, terreno: 't', decoracoes: [], nome: 'Vau', descricao: 'Rio', notas: [nota('n')] },
    ],
  });

  it('abre preservando as informações, sem revelação e sem grupo', () => {
    const resultado = desserializarMapa(antigo);
    if (!resultado.ok) {
      throw new Error(resultado.erro);
    }
    expect(resultado.grupo).toEqual(GRUPO_SEM_POSICAO);
    expect(resultado.estado.aparenciaOculta).toEqual(APARENCIA_PADRAO);
    expect(resultado.estado.hexes['1,1']).toMatchObject({
      nome: 'Vau',
      descricao: 'Rio',
      notas: [{ id: 'n' }],
      revelado: false,
    });
  });

  it('continua exigindo os campos que a versão 2 já tinha', () => {
    expect(erroDe(arquivo({ versao: 2, hexes: [{ q: 0, r: 0, terreno: 't', decoracoes: [] }] }))).toContain(
      'sem nome',
    );
  });
});

describe('mapas no formato antigo (versão 1)', () => {
  const antigo = arquivo({
    versao: 1,
    hexes: [
      {
        q: 2,
        r: -1,
        terreno: 'hexPlains00',
        decoracoes: [decoracao('d1')],
      },
    ],
  });

  it('abre preservando terreno e decorações, com as informações vazias', () => {
    expect(desserializarMapa(antigo)).toEqual({
      ok: true,
      grupo: GRUPO_SEM_POSICAO,
      estado: {
        aparenciaOculta: APARENCIA_PADRAO,
        hexes: {
          '2,-1': {
            coord: { q: 2, r: -1 },
            terreno: 'hexPlains00',
            decoracoes: [decoracao('d1')],
            nome: '',
            descricao: '',
            notas: [],
            revelado: false,
          },
        },
      },
    });
  });

  it('continua recusando hexes inválidos', () => {
    expect(erroDe(arquivo({ versao: 1, hexes: [{ q: 'a', r: 0 }] }))).toContain('coordenadas');
    expect(erroDe(arquivo({ versao: 1, hexes: ['texto'] }))).toContain('nº 1');
  });

  it('ao salvar de novo, passa para a versão atual', () => {
    const resultado = desserializarMapa(antigo);
    if (!resultado.ok) {
      throw new Error(resultado.erro);
    }
    expect(JSON.parse(serializarMapa(resultado.estado, resultado.grupo)).versao).toBe(4);
  });
});

describe('arquivos inválidos', () => {
  it('recusa um texto que não é JSON', () => {
    expect(erroDe('isto não é json')).toContain('JSON');
  });

  it.each([['null'], ['[]'], ['123'], ['{"nome":"outro arquivo"}']])(
    'recusa um JSON que não é mapa: %s',
    (texto) => {
      expect(erroDe(texto)).toContain('não é um mapa');
    },
  );

  it('recusa uma versão desconhecida', () => {
    expect(erroDe(arquivo({ versao: 99, hexes: [] }))).toContain('99');
  });

  it('recusa um arquivo sem a lista de hexes', () => {
    expect(erroDe(arquivo({ versao: 1 }))).toContain('lista de hexes');
  });

  it.each([
    ['coordenada fracionária', { ...hexValido, q: 1.5 }],
    ['coordenada ausente', { terreno: 't', decoracoes: [] }],
    ['coordenada em texto', { ...hexValido, r: '2' }],
    ['terreno ausente', { q: 0, r: 0, decoracoes: [] }],
    ['terreno vazio', { ...hexValido, terreno: '' }],
    ['decorações ausentes', { q: 0, r: 0, terreno: 't' }],
  ])('recusa um hex com %s e diz qual é', (_, hex) => {
    expect(erroDe(comHexes(hexValido, hex))).toContain('nº 2');
  });

  it.each([
    ['sem id', { assetId: 'a', deslocamento: { x: 0, y: 0 } }],
    ['sem imagem', { id: 'd', deslocamento: { x: 0, y: 0 } }],
    ['sem posição', { id: 'd', assetId: 'a' }],
    ['com posição em texto', { id: 'd', assetId: 'a', deslocamento: { x: '1', y: 0 } }],
  ])('recusa uma decoração %s', (_, invalida) => {
    expect(erroDe(comHexes({ ...hexValido, decoracoes: [invalida] }))).toContain('decoração');
  });

  it.each([
    ['sem nome', { q: 0, r: 0, terreno: 't', decoracoes: [], descricao: '', notas: [] }],
    ['com nome que não é texto', { ...hexValido, nome: 5 }],
    ['sem descrição', { q: 0, r: 0, terreno: 't', decoracoes: [], nome: '', notas: [] }],
    ['sem lista de notas', { q: 0, r: 0, terreno: 't', decoracoes: [], nome: '', descricao: '' }],
  ])('recusa um hex %s', (_, hex) => {
    expect(erroDe(comHexes(hex))).toContain('nº 1');
  });

  it.each([
    ['sem id', { texto: 'x', visibilidade: { tipo: 'todos' } }],
    ['sem texto', { id: 'n', visibilidade: { tipo: 'todos' } }],
    ['sem visibilidade', { id: 'n', texto: 'x' }],
    ['com visibilidade em texto', { id: 'n', texto: 'x', visibilidade: 'todos' }],
    ['com visibilidade desconhecida', { id: 'n', texto: 'x', visibilidade: { tipo: 'outra' } }],
  ])('recusa uma nota %s', (_, invalida) => {
    expect(erroDe(comHexes({ ...hexValido, notas: [invalida] }))).toContain('nota nº 1');
  });

  it('aceita uma nota com texto vazio', () => {
    const vazia = { id: 'n', texto: '', visibilidade: { tipo: 'todos' } };
    expect(desserializarMapa(comHexes({ ...hexValido, notas: [vazia] })).ok).toBe(true);
  });

  it('recusa o mesmo id de nota em hexes diferentes', () => {
    const texto = comHexes(
      { ...hexValido, notas: [nota('n')] },
      { ...hexValido, q: 1, notas: [nota('n')] },
    );
    expect(erroDe(texto)).toContain('repetida');
  });

  it.each([
    ['ausente', { q: 0, r: 0, terreno: 't', decoracoes: [], nome: '', descricao: '', notas: [] }],
    ['que não é verdadeiro ou falso', { ...hexValido, revelado: 'sim' }],
  ])('recusa, na versão atual, uma revelação %s', (_, hex) => {
    expect(erroDe(comHexes(hex))).toContain('revelado');
  });

  const comTopo = (topo: object) =>
    arquivo({ versao: 3, aparenciaOculta: APARENCIA_PADRAO, posicaoGrupo: null, hexes: [], ...topo });

  it.each([
    ['ausente', undefined],
    ['sem bordas', { fundo: { tipo: 'escuro', grid: false } }],
    ['sem fundo', { bordasSuaves: false }],
    ['de tipo desconhecido', { fundo: { tipo: 'chuva' }, bordasSuaves: false }],
    ['escura sem grid definido', { fundo: { tipo: 'escuro' }, bordasSuaves: false }],
    ['de neblina desconhecida', { fundo: { tipo: 'neblina', variante: 'roxa' }, bordasSuaves: false }],
    ['de tile sem imagem', { fundo: { tipo: 'tile', assetId: '' }, bordasSuaves: false }],
  ])('recusa uma aparência %s', (_, aparenciaOculta) => {
    expect(erroDe(comTopo({ aparenciaOculta }))).toContain('aparência');
  });

  it.each([
    ['ausente', undefined],
    ['fracionária', { q: 1.5, r: 0 }],
    ['em texto', 'centro'],
  ])('recusa uma posição do grupo %s', (_, posicaoGrupo) => {
    expect(erroDe(comTopo({ posicaoGrupo }))).toContain('posição do grupo');
  });

  it('recusa um hex repetido', () => {
    expect(erroDe(comHexes(hexValido, hexValido))).toContain('mais de uma vez');
  });

  it('recusa o mesmo id de decoração em hexes diferentes', () => {
    const texto = comHexes(
      { ...hexValido, decoracoes: [decoracao('d')] },
      { ...hexValido, q: 1, decoracoes: [decoracao('d')] },
    );
    expect(erroDe(texto)).toContain('repetida');
  });
});

describe('assetsDesconhecidos', () => {
  const manifesto = {
    categorias: [],
    assets: [{ id: 'hexPlains00' }, { id: 'house00' }],
  } as unknown as Manifesto;

  it('lista terrenos e decorações que não existem, sem repetir', () => {
    expect(assetsDesconhecidos(mapaExemplo(), manifesto)).toEqual(['hexHills00']);
  });

  it('inclui o tile escolhido como aparência, se ele não existir', () => {
    const mapa = aplicarAcao(mapaExemplo(), {
      tipo: 'DefinirAparenciaOculta',
      aparencia: { fundo: { tipo: 'tile', assetId: 'tileApagado' }, bordasSuaves: false },
    });
    expect(assetsDesconhecidos(mapa, manifesto)).toContain('tileApagado');
  });

  it('devolve lista vazia quando tudo existe', () => {
    const completo = {
      ...manifesto,
      assets: [...manifesto.assets, { id: 'hexHills00' }],
    } as unknown as Manifesto;
    expect(assetsDesconhecidos(mapaExemplo(), completo)).toEqual([]);
  });
});

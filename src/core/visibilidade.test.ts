import { describe, expect, it } from 'vitest';
import { aparenciasIguais, APARENCIA_PADRAO, type AparenciaOculta } from './aparencia';
import { aplicarAcao, criarMapaVazio, hexEm, type AcaoMapa, type EstadoMapa, type Nota } from './mapa';
import { mesmaVisibilidade, nivelDeVisao, paraJogadores, podeVer, SO_MESTRE, VISIVEL_A_TODOS, visaoDoJogador } from './visibilidade';

const A = { q: 0, r: 0 };
const VIZINHO = { q: 1, r: 0 };
const OUTRO_VIZINHO = { q: 0, r: -1 };
const DISTANTE = { q: 5, r: 0 };

const publica: Nota = { id: 'n1', texto: 'Uma ponte antiga', visibilidade: VISIVEL_A_TODOS };
const secreta: Nota = { id: 'n2', texto: 'Há um dragão sob a ponte', visibilidade: SO_MESTRE };
const casa = { id: 'd1', assetId: 'house00', deslocamento: { x: 1, y: 2 } };

function comInformacao(coord: typeof A, nome: string): AcaoMapa[] {
  return [
    { tipo: 'ColocarTile', coord, terreno: `terreno-${nome}` },
    { tipo: 'EditarInformacaoHex', coord, campos: { nome, descricao: `Descrição de ${nome}` } },
    { tipo: 'AdicionarNota', coord, nota: { ...publica, id: `pub-${nome}`, texto: `Pública de ${nome}` } },
    { tipo: 'AdicionarNota', coord, nota: { ...secreta, id: `sec-${nome}`, texto: `Segredo de ${nome}` } },
    { tipo: 'ColocarDecoracao', coord, decoracao: { ...casa, id: `dec-${nome}` } },
  ];
}

function aplicarTodas(acoes: AcaoMapa[], inicial: EstadoMapa = criarMapaVazio()): EstadoMapa {
  return acoes.reduce(aplicarAcao, inicial);
}

const mapa = () =>
  aplicarTodas([
    ...comInformacao(A, 'Centro'),
    ...comInformacao(VIZINHO, 'Vizinho'),
    ...comInformacao(OUTRO_VIZINHO, 'Outro'),
    ...comInformacao(DISTANTE, 'Distante'),
  ]);

describe('RevelarHex e OcultarHex', () => {
  it('um hex nasce sem revelação manual', () => {
    expect(hexEm(mapa(), A)?.revelado).toBe(false);
  });

  it('revela e oculta', () => {
    const revelado = aplicarAcao(mapa(), { tipo: 'RevelarHex', coord: A });
    expect(hexEm(revelado, A)?.revelado).toBe(true);
    const oculto = aplicarAcao(revelado, { tipo: 'OcultarHex', coord: A });
    expect(hexEm(oculto, A)?.revelado).toBe(false);
  });

  it('repetir não muda nada', () => {
    const inicial = mapa();
    expect(aplicarAcao(inicial, { tipo: 'OcultarHex', coord: A })).toBe(inicial);
  });

  it('um hex vazio não pode ser revelado', () => {
    const inicial = mapa();
    expect(aplicarAcao(inicial, { tipo: 'RevelarHex', coord: { q: 30, r: 30 } })).toBe(inicial);
  });

  it('trocar o terreno mantém a revelação', () => {
    const revelado = aplicarAcao(mapa(), { tipo: 'RevelarHex', coord: A });
    const trocado = aplicarAcao(revelado, { tipo: 'ColocarTile', coord: A, terreno: 'outro' });
    expect(hexEm(trocado, A)?.revelado).toBe(true);
  });
});

describe('visaoDoJogador', () => {
  it('sem posição e sem revelação, o jogador não vê nada', () => {
    expect(visaoDoJogador(mapa(), []).hexes).toEqual({});
  });

  it('no hex do grupo, mostra tudo o que é público', () => {
    expect(hexEm(visaoDoJogador(mapa(), [A]), A)).toMatchObject({
      terreno: 'terreno-Centro',
      nome: 'Centro',
      descricao: 'Descrição de Centro',
      notas: [{ texto: 'Pública de Centro' }],
    });
  });

  it('nos vizinhos, mostra só terreno e decorações', () => {
    expect(hexEm(visaoDoJogador(mapa(), [A]), VIZINHO)).toMatchObject({
      terreno: 'terreno-Vizinho',
      decoracoes: [{ id: 'dec-Vizinho' }],
      nome: '',
      descricao: '',
      notas: [],
    });
  });

  it('hexes além dos vizinhos não existem na visão', () => {
    expect(hexEm(visaoDoJogador(mapa(), [A]), DISTANTE)).toBeUndefined();
  });

  it('ao andar, o que ficou para trás volta a sumir', () => {
    const visao = visaoDoJogador(mapa(), [DISTANTE]);
    expect(hexEm(visao, A)).toBeUndefined();
    expect(hexEm(visao, DISTANTE)?.nome).toBe('Distante');
  });

  it('um hex revelado é avistado de longe, só com terreno e decorações', () => {
    const revelado = aplicarAcao(mapa(), { tipo: 'RevelarHex', coord: DISTANTE });
    expect(hexEm(visaoDoJogador(revelado, [A]), DISTANTE)).toMatchObject({
      terreno: 'terreno-Distante',
      decoracoes: [{ id: 'dec-Distante' }],
      nome: '',
      notas: [],
    });
  });

  it('um hex revelado aparece mesmo sem posição definida', () => {
    const revelado = aplicarAcao(mapa(), { tipo: 'RevelarHex', coord: DISTANTE });
    expect(Object.keys(visaoDoJogador(revelado, []).hexes)).toEqual(['5,0']);
  });

  it('um hex revelado onde o grupo está mostra tudo o que é público', () => {
    const revelado = aplicarAcao(mapa(), { tipo: 'RevelarHex', coord: A });
    expect(hexEm(visaoDoJogador(revelado, [A]), A)?.nome).toBe('Centro');
  });

  it('com mais de uma posição, soma as visões', () => {
    const visao = visaoDoJogador(mapa(), [A, DISTANTE]);
    expect(hexEm(visao, A)?.nome).toBe('Centro');
    expect(hexEm(visao, DISTANTE)?.nome).toBe('Distante');
  });

  it('um hex que é posição de um e vizinho de outro mostra tudo o que é público', () => {
    expect(hexEm(visaoDoJogador(mapa(), [A, VIZINHO]), VIZINHO)?.nome).toBe('Vizinho');
  });

  it('nenhum segredo sobra em lugar nenhum da visão', () => {
    const revelado = aplicarAcao(mapa(), { tipo: 'RevelarHex', coord: DISTANTE });
    expect(JSON.stringify(visaoDoJogador(revelado, [A]))).not.toContain('Segredo');
  });

  it('o que é de hexes só avistados não sobra na visão', () => {
    const texto = JSON.stringify(visaoDoJogador(mapa(), [A]));
    expect(texto).not.toContain('Pública de Vizinho');
    expect(texto).not.toContain('Descrição de Vizinho');
    expect(texto).not.toContain('Distante');
  });

  it('não revela quais hexes o mestre marcou como revelados', () => {
    const revelado = aplicarAcao(mapa(), { tipo: 'RevelarHex', coord: DISTANTE });
    expect(hexEm(visaoDoJogador(revelado, [A]), DISTANTE)?.revelado).toBe(false);
  });

  it('mantém a aparência escolhida para o mapa', () => {
    const aparencia: AparenciaOculta = {
      fundo: { tipo: 'neblina', variante: 'escura' },
      bordasSuaves: true,
    };
    const inicial = aplicarAcao(mapa(), { tipo: 'DefinirAparenciaOculta', aparencia });
    expect(visaoDoJogador(inicial, [A]).aparenciaOculta).toEqual(aparencia);
  });

  it('não altera o mapa do mestre', () => {
    const inicial = mapa();
    visaoDoJogador(inicial, [A]);
    expect(hexEm(inicial, A)?.notas).toHaveLength(2);
  });
});

describe('alcance da visão', () => {
  const DOIS = { q: 2, r: 0 };
  const TRES = { q: 3, r: 0 };
  const longe = () =>
    aplicarTodas([
      { tipo: 'ColocarTile', coord: A, terreno: 't' },
      { tipo: 'ColocarTile', coord: VIZINHO, terreno: 't' },
      { tipo: 'ColocarTile', coord: DOIS, terreno: 't' },
      { tipo: 'ColocarTile', coord: TRES, terreno: 't' },
      ...comInformacao(DOIS, 'Torre'),
    ]);

  it('com alcance 1, só os vizinhos; com alcance 2, um anel a mais', () => {
    expect(Object.keys(visaoDoJogador(longe(), [A]).hexes).sort()).toEqual(['0,0', '1,0']);
    expect(Object.keys(visaoDoJogador(longe(), [A], '', 2).hexes).sort()).toEqual(['0,0', '1,0', '2,0']);
  });

  it('o que se vê de longe é só terreno e decorações, sem nome nem notas', () => {
    const torre = hexEm(visaoDoJogador(longe(), [A], 'j1', 2), DOIS);
    expect(torre?.nome).toBe('');
    expect(torre?.notas).toEqual([]);
  });

  it('nivelDeVisao segue o alcance', () => {
    const hex = hexEm(longe(), TRES)!;
    expect(nivelDeVisao(hex, [A], 2)).toBe('oculto');
    expect(nivelDeVisao(hex, [A], 3)).toBe('avistado');
  });
});

describe('nivelDeVisao', () => {
  const nivelEm = (estado: EstadoMapa, coord: typeof A, posicoes: (typeof A)[]) =>
    nivelDeVisao(hexEm(estado, coord)!, posicoes);

  it('o hex do grupo é completo', () => {
    expect(nivelEm(mapa(), A, [A])).toBe('completo');
  });

  it('um vizinho é avistado', () => {
    expect(nivelEm(mapa(), VIZINHO, [A])).toBe('avistado');
  });

  it('um hex distante é oculto', () => {
    expect(nivelEm(mapa(), DISTANTE, [A])).toBe('oculto');
  });

  it('sem posição, tudo é oculto', () => {
    expect(nivelEm(mapa(), A, [])).toBe('oculto');
  });

  it('um hex revelado à mão é avistado', () => {
    const revelado = aplicarAcao(mapa(), { tipo: 'RevelarHex', coord: DISTANTE });
    expect(nivelEm(revelado, DISTANTE, [A])).toBe('avistado');
  });

  it('um hex revelado onde o grupo está é completo', () => {
    const revelado = aplicarAcao(mapa(), { tipo: 'RevelarHex', coord: A });
    expect(nivelEm(revelado, A, [A])).toBe('completo');
  });
});

describe('DefinirAparenciaOculta', () => {
  it('um mapa novo usa a aparência padrão', () => {
    expect(criarMapaVazio().aparenciaOculta).toEqual(APARENCIA_PADRAO);
  });

  it('troca a aparência e mantém os hexes', () => {
    const aparencia: AparenciaOculta = {
      fundo: { tipo: 'tile', assetId: 'hexVoid00' },
      bordasSuaves: false,
    };
    const resultado = aplicarAcao(mapa(), { tipo: 'DefinirAparenciaOculta', aparencia });
    expect(resultado.aparenciaOculta).toEqual(aparencia);
    expect(hexEm(resultado, A)).toBeDefined();
  });

  it('a mesma aparência não muda nada', () => {
    const inicial = mapa();
    const acao: AcaoMapa = { tipo: 'DefinirAparenciaOculta', aparencia: { ...APARENCIA_PADRAO } };
    expect(aplicarAcao(inicial, acao)).toBe(inicial);
  });

  it('editar o mapa não perde a aparência', () => {
    const aparencia: AparenciaOculta = { ...APARENCIA_PADRAO, bordasSuaves: true };
    const resultado = aplicarTodas(
      [
        { tipo: 'DefinirAparenciaOculta', aparencia },
        { tipo: 'RemoverTile', coord: A },
        { tipo: 'ColocarTile', coord: { q: 9, r: 9 }, terreno: 't' },
      ],
      mapa(),
    );
    expect(resultado.aparenciaOculta).toEqual(aparencia);
  });
});

describe('aparenciasIguais', () => {
  it('distingue variantes da neblina e tiles diferentes', () => {
    const neblina = (variante: 'clara' | 'escura'): AparenciaOculta => ({
      fundo: { tipo: 'neblina', variante },
      bordasSuaves: false,
    });
    const tile = (assetId: string): AparenciaOculta => ({
      fundo: { tipo: 'tile', assetId },
      bordasSuaves: false,
    });
    expect(aparenciasIguais(neblina('clara'), neblina('clara'))).toBe(true);
    expect(aparenciasIguais(neblina('clara'), neblina('escura'))).toBe(false);
    expect(aparenciasIguais(tile('a'), tile('b'))).toBe(false);
  });
});

describe('jogadores escolhidos', () => {
  it('o mestre vê tudo; cada jogador, o que é de todos ou foi mostrado a ele', () => {
    const paraAna = paraJogadores(['ana']);
    expect(podeVer(SO_MESTRE, 'mestre')).toBe(true);
    expect(podeVer(paraAna, 'mestre')).toBe(true);
    expect(podeVer(SO_MESTRE, 'ana')).toBe(false);
    expect(podeVer(paraAna, 'ana')).toBe(true);
    expect(podeVer(paraAna, 'bia')).toBe(false);
    expect(podeVer(VISIVEL_A_TODOS, 'bia')).toBe(true);
  });

  it('a lista não repete jogadores e a ordem não importa', () => {
    expect(paraJogadores(['ana', 'ana', 'bia'])).toEqual({ tipo: 'jogadores', ids: ['ana', 'bia'] });
    expect(mesmaVisibilidade(paraJogadores(['ana', 'bia']), paraJogadores(['bia', 'ana']))).toBe(true);
    expect(mesmaVisibilidade(paraJogadores(['ana']), SO_MESTRE)).toBe(false);
  });

  it('no hex do grupo, cada jogador lê só as notas mostradas a ele', () => {
    const estado = aplicarTodas(
      [{ tipo: 'AdicionarNota', coord: A, nota: { id: 'ana', texto: 'Só para Ana', visibilidade: paraJogadores(['ana']) } }],
      mapa(),
    );
    const textos = (id?: string) => hexEm(visaoDoJogador(estado, [A], id), A)?.notas.map((n) => n.texto);
    expect(textos('ana')).toEqual(['Pública de Centro', 'Só para Ana']);
    expect(textos('bia')).toEqual(['Pública de Centro']);
    expect(textos()).toEqual(['Pública de Centro']);
  });

  it('mudar os jogadores escolhidos de uma nota muda a nota', () => {
    const comNota = aplicarTodas(
      [{ tipo: 'AdicionarNota', coord: A, nota: { id: 'x', texto: 'x', visibilidade: paraJogadores(['ana']) } }],
      mapa(),
    );
    const mudou = aplicarAcao(comNota, { tipo: 'DefinirVisibilidadeNota', coord: A, notaId: 'x', visibilidade: paraJogadores(['bia']) });
    expect(hexEm(mudou, A)?.notas.find((n) => n.id === 'x')?.visibilidade).toEqual(paraJogadores(['bia']));
  });
});

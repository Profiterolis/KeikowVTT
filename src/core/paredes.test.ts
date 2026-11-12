import { describe, expect, it } from 'vitest';
import {
  aplicarAcaoInstancias,
  cenaNaInstancia,
  criarInstanciasVazias,
  criarLojaInstancias,
  instanciasVistasPor,
  novaInstancia,
  type AcaoInstancias,
  type EstadoInstancias,
} from './instancias';
import {
  alcancaAPorta,
  alinharAngulo,
  barraMovimento,
  barraVisao,
  caminhoLivre,
  distanciaAoSegmento,
  novaParede,
  pontaProxima,
  pontoDeParada,
  primeiroContato,
  raioDoCorpo,
} from './paredes';
import { desserializarInstancias, serializarInstancias } from './persistenciaInstancias';
import { destinoDoMovimento, novoToken, permissaoParaPorta, type ContextoDasInstancias } from './tokens';
import { criarFicha } from './fichas';

const aplicar = (estado: EstadoInstancias, ...acoes: AcaoInstancias[]) => acoes.reduce(aplicarAcaoInstancias, estado);

/** Uma parede vertical em x = 100, de y = 0 a y = 200. */
const muro = novaParede('muro', { x: 100, y: 0 }, { x: 100, y: 200 }, 'parede');

describe('geometria das paredes', () => {
  it('mede a distância de um ponto a um segmento', () => {
    expect(distanciaAoSegmento({ x: 50, y: 100 }, muro.a, muro.b)).toBe(50);
    expect(distanciaAoSegmento({ x: 100, y: 230 }, muro.a, muro.b)).toBe(30);
  });

  it('acha o primeiro contato de um corpo andando contra a parede', () => {
    // Centro de x = 0 a x = 200, raio 10: encosta quando o centro chega a x = 90.
    expect(primeiroContato({ x: 0, y: 100 }, { x: 200, y: 100 }, 10, [muro])).toBeCloseTo(0.45);
    // Passando por baixo da ponta (y = 215, raio 10): livre.
    expect(primeiroContato({ x: 0, y: 215 }, { x: 200, y: 215 }, 10, [muro])).toBeNull();
    // Raspando a ponta (y = 205, raio 10): encosta no círculo da ponta.
    const t = primeiroContato({ x: 0, y: 205 }, { x: 200, y: 205 }, 10, [muro]);
    expect(t).not.toBeNull();
    expect(t!).toBeLessThan(0.5);
    // Andando ao lado, paralelo: livre.
    expect(primeiroContato({ x: 50, y: 0 }, { x: 50, y: 200 }, 10, [muro])).toBeNull();
  });

  it('para logo antes da parede, sem atravessar', () => {
    const parada = pontoDeParada({ x: 0, y: 100 }, { x: 200, y: 100 }, 10, [muro]);
    expect(parada.x).toBeGreaterThan(89);
    expect(parada.x).toBeLessThan(90);
    expect(caminhoLivre({ x: 0, y: 100 }, parada, 10, [muro])).toBe(true);
    expect(caminhoLivre({ x: 0, y: 100 }, { x: 200, y: 100 }, 10, [muro])).toBe(false);
  });

  it('um corpo que já começa encostado sai da parede, mas não entra nela', () => {
    const encostado = { x: 95, y: 100 };
    expect(caminhoLivre(encostado, { x: 0, y: 100 }, 10, [muro])).toBe(true);
    expect(caminhoLivre(encostado, { x: 150, y: 100 }, 10, [muro])).toBe(false);
  });

  it('porta aberta deixa passar; fechada, trancada e janela barram', () => {
    const porta = novaParede('p', muro.a, muro.b, 'porta');
    expect(barraMovimento(porta)).toBe(true);
    expect(barraMovimento({ ...porta, estado: 'aberta' })).toBe(false);
    expect(barraMovimento({ ...porta, estado: 'trancada' })).toBe(true);
    const janela = novaParede('j', muro.a, muro.b, 'janela');
    expect(barraMovimento(janela)).toBe(true);
    expect(barraVisao(janela)).toBe(false);
    expect(caminhoLivre({ x: 0, y: 100 }, { x: 200, y: 100 }, 10, [{ ...porta, estado: 'aberta' }])).toBe(true);
  });

  it('o corpo de um Médio passa numa porta de 1,5 m; o de um Grande, não', () => {
    // Escala padrão: 0,015 m por pixel. Paredes dos dois lados de uma passagem de 100 px (1,5 m) em x = 300.
    const esquerda = novaParede('e', { x: 300, y: 0 }, { x: 300, y: 450 }, 'parede');
    const direita = novaParede('d', { x: 300, y: 550 }, { x: 300, y: 1000 }, 'parede');
    const medio = raioDoCorpo(1.5, 0.015);
    const grande = raioDoCorpo(3, 0.015);
    expect(caminhoLivre({ x: 100, y: 500 }, { x: 500, y: 500 }, medio, [esquerda, direita])).toBe(true);
    expect(caminhoLivre({ x: 100, y: 500 }, { x: 500, y: 500 }, grande, [esquerda, direita])).toBe(false);
  });

  it('alinha a 45° com Shift e gruda nas pontas próximas', () => {
    const alinhado = alinharAngulo({ x: 0, y: 0 }, { x: 100, y: 8 });
    expect(alinhado.x).toBeCloseTo(Math.hypot(100, 8));
    expect(alinhado.y).toBeCloseTo(0);
    expect(pontaProxima({ x: 104, y: 3 }, [muro], 10)).toEqual({ x: 100, y: 0 });
    expect(pontaProxima({ x: 130, y: 3 }, [muro], 10)).toBeNull();
  });

  it('o alcance da porta conta a partir da borda do token', () => {
    const porta = novaParede('p', muro.a, muro.b, 'porta');
    // Raio 50 px; 1,5 m = 100 px. Centro a 150 px da porta: a borda está a 100 px.
    expect(alcancaAPorta({ x: -50, y: 100 }, 50, porta, 0.015)).toBe(true);
    expect(alcancaAPorta({ x: -60, y: 100 }, 50, porta, 0.015)).toBe(false);
  });
});

describe('paredes nas instâncias', () => {
  const DONOS: Record<string, string> = { lyra: 'j-ana', goblin: 'mestre' };
  const contexto: ContextoDasInstancias = {
    obterDonoDaFicha: (id) => DONOS[id] ?? null,
    obterFicha: (id) => (id in DONOS ? criarFicha('personagem', id, DONOS[id]) : undefined),
  };
  const porta = novaParede('porta', { x: 500, y: 0 }, { x: 500, y: 2000 }, 'porta');
  const base = aplicar(
    criarInstanciasVazias(),
    { tipo: 'CriarInstancia', instancia: novaInstancia('cripta', 'Cripta', null) },
    { tipo: 'CriarParedes', instanciaId: 'cripta', paredes: [porta, novaParede('janela', { x: 0, y: 900 }, { x: 400, y: 900 }, 'janela')] },
    { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-lyra', 'lyra', 400, 500), levar: ['j-ana'] },
  );

  it('cria, edita, apaga e muda portas; parede de tipo comum não guarda estado', () => {
    expect(Object.keys(base.instancias.cripta.paredes)).toEqual(['porta', 'janela']);
    const estranha = aplicar(base, {
      tipo: 'CriarParedes',
      instanciaId: 'cripta',
      paredes: [{ ...novaParede('x', { x: 0, y: 0 }, { x: 1, y: 1 }, 'parede'), estado: 'aberta', secreta: true }],
    });
    expect(estranha.instancias.cripta.paredes.x).toMatchObject({ estado: 'fechada', secreta: false });
    // Parede sem comprimento não entra.
    expect(aplicar(base, { tipo: 'CriarParedes', instanciaId: 'cripta', paredes: [novaParede('z', { x: 1, y: 1 }, { x: 1, y: 1 }, 'parede')] })).toBe(base);

    const aberta = aplicar(base, { tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'porta', estado: 'aberta' });
    expect(aberta.instancias.cripta.paredes.porta.estado).toBe('aberta');
    expect(aplicar(aberta, { tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'janela', estado: 'aberta' })).toBe(aberta);

    const movida = aplicar(base, {
      tipo: 'EditarParedes',
      instanciaId: 'cripta',
      paredes: [{ ...porta, a: { x: 600, y: 0 } }],
    });
    expect(movida.instancias.cripta.paredes.porta.a).toEqual({ x: 600, y: 0 });
    const apagada = aplicar(base, { tipo: 'ApagarParedes', instanciaId: 'cripta', paredeIds: ['janela', 'nada'] });
    expect(Object.keys(apagada.instancias.cripta.paredes)).toEqual(['porta']);
    // Editar a instância não mexe nas paredes; duplicar copia as paredes.
    const copia = aplicar(base, { tipo: 'DuplicarInstancia', instanciaId: 'cripta', novoId: 'copia' });
    expect(Object.keys(copia.instancias.copia.paredes)).toEqual(['porta', 'janela']);
  });

  it('o token para na porta fechada e passa pela aberta; o mestre atravessa com Shift', () => {
    const instancia = base.instancias.cripta;
    const lyra = instancia.tokens['t-lyra'];
    const parada = destinoDoMovimento(instancia, lyra, { x: 900, y: 500 }, contexto);
    // Corpo de um Médio: raio de 35 px; para antes de x = 465.
    expect(parada.x).toBeLessThan(465);
    expect(parada.x).toBeGreaterThan(464);
    expect(destinoDoMovimento(instancia, lyra, { x: 900, y: 500 }, contexto, true)).toEqual({ x: 900, y: 500 });
    const aberta = aplicar(base, { tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'porta', estado: 'aberta' });
    expect(destinoDoMovimento(aberta.instancias.cripta, lyra, { x: 900, y: 500 }, contexto)).toEqual({ x: 900, y: 500 });
  });

  it('o jogador abre e fecha portas perto de um token dele; trancada e secreta não', () => {
    expect(permissaoParaPorta(base, 'cripta', 'porta', 'j-ana', contexto)).toMatchObject({ ok: true });
    const longe = aplicar(base, { tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 't-lyra', x: 100, y: 500 });
    expect(permissaoParaPorta(longe, 'cripta', 'porta', 'j-ana', contexto)).toMatchObject({ ok: false });
    const trancada = aplicar(base, { tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'porta', estado: 'trancada' });
    expect(permissaoParaPorta(trancada, 'cripta', 'porta', 'j-ana', contexto)).toMatchObject({ motivo: 'Trancada.' });
    expect(permissaoParaPorta(trancada, 'cripta', 'porta', 'mestre', contexto)).toMatchObject({ ok: true });
    const secreta = aplicar(base, { tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'porta', secreta: true });
    expect(permissaoParaPorta(secreta, 'cripta', 'porta', 'j-ana', contexto)).toMatchObject({ ok: false });
  });

  it('a loja confere portas e paredes para o jogador', () => {
    const recusas: string[] = [];
    let autor = 'j-ana';
    const loja = criarLojaInstancias(base, { obterAutorId: () => autor, aoRecusar: (m) => recusas.push(m) }, contexto);
    loja.despachar({ tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'porta', estado: 'aberta' });
    expect(loja.obterEstado().instancias.cripta.paredes.porta.estado).toBe('aberta');
    loja.despachar({ tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'porta', estado: 'trancada' });
    loja.despachar({ tipo: 'ApagarParedes', instanciaId: 'cripta', paredeIds: ['janela'] });
    expect(recusas).toHaveLength(2);
    // Com a porta fechada pelo mestre, a jogadora não atravessa.
    autor = 'mestre';
    loja.despachar({ tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'porta', estado: 'fechada' });
    autor = 'j-ana';
    loja.despachar({ tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 't-lyra', x: 900, y: 500 });
    expect(recusas.at(-1)).toBe('Uma parede está no caminho.');
    expect(loja.obterEstado().instancias.cripta.tokens['t-lyra'].x).toBe(400);
  });

  it('o jogador não sabe das portas secretas', () => {
    const secreta = aplicar(base, { tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'porta', secreta: true });
    const vista = instanciasVistasPor(secreta, 'j-ana').instancias.cripta.paredes;
    expect(vista.porta).toMatchObject({ tipo: 'parede', secreta: false, estado: 'fechada' });
    const aberta = aplicar(secreta, { tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'porta', estado: 'aberta' });
    expect(instanciasVistasPor(aberta, 'j-ana').instancias.cripta.paredes.porta).toBeUndefined();
    expect(instanciasVistasPor(aberta, 'mestre').instancias.cripta.paredes.porta.secreta).toBe(true);
    expect(cenaNaInstancia('cripta')).toEqual(secreta.cenas['j-ana']);
  });

  it('salva e lê as paredes; a versão 2 abre sem paredes', () => {
    const lida = desserializarInstancias(serializarInstancias(base));
    expect(lida.ok && lida.estado).toEqual(base);
    const v2 = JSON.parse(serializarInstancias(base));
    v2.versao = 2;
    for (const i of v2.instancias) {
      delete i.paredes;
    }
    const convertida = desserializarInstancias(JSON.stringify(v2));
    expect(convertida.ok && convertida.estado.instancias.cripta.paredes).toEqual({});
    const ruim = JSON.parse(serializarInstancias(base));
    ruim.instancias[0].paredes[0].tipo = 'muralha';
    expect(desserializarInstancias(JSON.stringify(ruim)).ok).toBe(false);
  });
});

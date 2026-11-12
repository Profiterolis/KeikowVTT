import { describe, expect, it } from 'vitest';
import { criarEntrada } from './entradas';
import { criarFicha, fichaDeMonstro, type Ficha } from './fichas';
import { aplicarAcaoInstancias, criarInstanciasVazias, novaInstancia, type AcaoInstancias, type EstadoInstancias } from './instancias';
import { dentroDoPoligono, linhaLivre, poligonoDeVisao } from './linhaDeVisao';
import { luzPeloRelogio, nivelDoAmbiente, novaFonteDeLuz } from './luz';
import { novaParede } from './paredes';
import { REGRAS_PADRAO } from './regrasPadrao';
import { novoToken, type ContextoDasInstancias } from './tokens';
import {
  celulasVistas,
  gradeDaExploracao,
  instanciaPelaVisao,
  luzDoToken,
  nivelDeLuzEm,
  tokensQueVe,
  vePonto,
  visaoDaFicha,
  visaoNaInstancia,
  type FontesDaVisao,
} from './visaoTatica';

const aplicar = (estado: EstadoInstancias, ...acoes: AcaoInstancias[]) => acoes.reduce(aplicarAcaoInstancias, estado);

/** Uma habilidade com um efeito "no mínimo", como o traço Darkvision. */
function comHabilidade(ficha: Ficha, alvo: string, valor: string): Ficha {
  const habilidade = {
    ...criarEntrada('habilidade', `hab-${alvo}`),
    nome: alvo,
    efeitos: [{ id: 'e1', alvo, operacao: 'minimo' as const, valor, quando: 'sempre' as const }],
  };
  return { ...ficha, entradas: { ...ficha.entradas, [habilidade.id]: habilidade }, extras: [...ficha.extras, habilidade.id] };
}

const LYRA = criarFicha('personagem', 'lyra', 'j-ana');
const ANAO = comHabilidade(criarFicha('personagem', 'thorin', 'j-bia'), 'visao_no_escuro', '18');
const GOBLIN = criarFicha('npc', 'goblin');
const FICHAS: Record<string, Ficha> = { lyra: LYRA, thorin: ANAO, goblin: GOBLIN };

const contexto: ContextoDasInstancias = {
  obterDonoDaFicha: (id) => FICHAS[id]?.donoId ?? null,
  obterFicha: (id) => FICHAS[id],
};
const fontes = (relogio = 12 * 60): FontesDaVisao => ({ fichas: FICHAS, regras: REGRAS_PADRAO, contexto, relogio });

// Escala padrão: 100 px = 1,5 m. Uma parede vertical em x = 1000, de y = 0 a 1500 (deixa passar por baixo).
const base = aplicar(
  criarInstanciasVazias(),
  { tipo: 'CriarInstancia', instancia: novaInstancia('cripta', 'Cripta', null) },
  { tipo: 'CriarParedes', instanciaId: 'cripta', paredes: [novaParede('w', { x: 1000, y: 0 }, { x: 1000, y: 1500 }, 'parede')] },
  { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-lyra', 'lyra', 500, 500) },
  { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-thorin', 'thorin', 600, 500) },
  { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-gob', 'goblin', 1500, 500) },
);

describe('linha de visão', () => {
  const parede = [{ a: { x: 10, y: -10 }, b: { x: 10, y: 10 } }];

  it('a parede corta a linha; passar por cima da ponta não', () => {
    expect(linhaLivre({ x: 0, y: 0 }, { x: 20, y: 0 }, parede)).toBe(false);
    expect(linhaLivre({ x: 0, y: 0 }, { x: 20, y: 30 }, parede)).toBe(true);
    expect(linhaLivre({ x: 0, y: 0 }, { x: 5, y: 0 }, parede)).toBe(true);
  });

  it('o polígono para nas paredes e nas bordas do mapa', () => {
    const area = poligonoDeVisao({ x: 0.5, y: 0.5 }, [{ a: { x: 5, y: -1 }, b: { x: 5, y: 2 } }], 20, 20);
    expect(dentroDoPoligono({ x: 3, y: 0.5 }, area)).toBe(true);
    expect(dentroDoPoligono({ x: 8, y: 0.5 }, area)).toBe(false); // atrás da parede
    expect(dentroDoPoligono({ x: 8, y: 15 }, area)).toBe(true); // passa por baixo dela
    expect(dentroDoPoligono({ x: 25, y: 5 }, area)).toBe(false); // fora do mapa
  });

  it('com alcance, a área é um círculo cortado', () => {
    const area = poligonoDeVisao({ x: 50, y: 50 }, [], 100, 100, 10);
    expect(dentroDoPoligono({ x: 58, y: 50 }, area)).toBe(true);
    expect(dentroDoPoligono({ x: 62, y: 50 }, area)).toBe(false);
  });

  it('uma luz presa na parede ilumina os dois lados', () => {
    const area = poligonoDeVisao({ x: 10, y: 0 }, parede, 100, 100, 5);
    expect(dentroDoPoligono({ x: 7, y: 2 }, area)).toBe(true);
    expect(dentroDoPoligono({ x: 13, y: 2 }, area)).toBe(true);
  });
});

describe('luz', () => {
  it('pelo relógio: dia claro, crepúsculo em penumbra, noite escura', () => {
    expect(luzPeloRelogio(12 * 60)).toBe('clara');
    expect(luzPeloRelogio(6 * 60)).toBe('penumbra');
    expect(luzPeloRelogio(19 * 60 + 30)).toBe('penumbra');
    expect(luzPeloRelogio(23 * 60)).toBe('escuridao');
    // Dia 3, 02:00.
    expect(luzPeloRelogio(2 * 24 * 60 + 2 * 60)).toBe('escuridao');
    expect(nivelDoAmbiente('penumbra', 12 * 60)).toBe('penumbra');
  });

  it('valores da ficha: visão no escuro e uma tocha', () => {
    expect(visaoDaFicha(ANAO, REGRAS_PADRAO).noEscuro).toBe(18);
    expect(visaoDaFicha(LYRA, REGRAS_PADRAO)).toEqual({ noEscuro: 0, luzClara: 0, luzPenumbra: 0 });
    const tocha = comHabilidade(comHabilidade(LYRA, 'luz_clara', '6'), 'luz_penumbra', '6');
    const luz = luzDoToken(novoToken('t', 'lyra', 0, 0), visaoDaFicha(tocha, REGRAS_PADRAO));
    expect(luz).toMatchObject({ clara: 6, penumbra: 6, tremular: true });
    expect(luzDoToken(novoToken('t', 'lyra', 0, 0), visaoDaFicha(LYRA, REGRAS_PADRAO))).toBeNull();
    // A luz posta pelo mestre vence a da ficha.
    const magica = { clara: 6, penumbra: 6, cor: 0xffffff, tremular: false };
    expect(luzDoToken({ ...novoToken('t', 'lyra', 0, 0), luz: magica }, undefined)).toBe(magica);
  });

  it('monstro: a visão no escuro vem do texto de sentidos', () => {
    const lobo = { ...criarEntrada('monstro', 'lobo'), nome: 'Lobo' };
    const comSentidos = { ...lobo, dados: { ...lobo.dados, sentidos: 'darkvision 18 m, passive Perception 13' } };
    expect(visaoDaFicha(fichaDeMonstro(comSentidos, 'f-lobo'), REGRAS_PADRAO).noEscuro).toBe(18);
  });

  it('nível de luz: clara, penumbra e escuridão, com paredes cortando a luz', () => {
    const escura = aplicar(
      base,
      { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas: { luzAmbiente: 'escuridao' } },
      { tipo: 'CriarLuz', instanciaId: 'cripta', luz: novaFonteDeLuz('braseiro', 500, 1000) },
    );
    const visao = visaoNaInstancia(escura.instancias.cripta, 'mestre', fontes());
    // 6 m = 400 px de luz clara e mais 400 px de penumbra.
    expect(nivelDeLuzEm(visao, { x: 500, y: 700 })).toBe('clara');
    expect(nivelDeLuzEm(visao, { x: 500, y: 300 })).toBe('penumbra');
    expect(nivelDeLuzEm(visao, { x: 500, y: 100 })).toBe('escuridao');
    // Do outro lado da parede, perto do braseiro, não chega luz.
    expect(nivelDeLuzEm(visao, { x: 1100, y: 1000 })).toBe('escuridao');
  });
});

describe('o que cada um vê', () => {
  it('o mestre vê tudo; o jogador não vê atrás da parede', () => {
    const cripta = base.instancias.cripta;
    expect(tokensQueVe(visaoNaInstancia(cripta, 'mestre', fontes()), cripta, 'mestre', fontes())).toEqual(
      new Set(['t-lyra', 't-thorin', 't-gob']),
    );
    const daAna = visaoNaInstancia(cripta, 'j-ana', fontes());
    expect(daAna.observadores.map((o) => o.tokenId)).toEqual(['t-lyra']);
    // O próprio token sempre; o de Thorin (aliado) está à vista; o goblin está atrás da parede.
    expect(tokensQueVe(daAna, cripta, 'j-ana', fontes())).toEqual(new Set(['t-lyra', 't-thorin']));
    expect(Object.keys(instanciaPelaVisao(cripta, new Set(['t-lyra'])).tokens)).toEqual(['t-lyra']);
  });

  it('basta um pedaço do token aparecer pela ponta da parede', () => {
    // O goblin quase todo atrás da parede, só a borda passando da ponta de baixo (y = 1500).
    const espiando = aplicar(base, { tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 't-gob', x: 1060, y: 1530 });
    const cripta = espiando.instancias.cripta;
    expect(tokensQueVe(visaoNaInstancia(cripta, 'j-ana', fontes()), cripta, 'j-ana', fontes()).has('t-gob')).toBe(true);
  });

  it('no escuro, só a visão no escuro e as luzes mostram', () => {
    // Sem a parede, para ver só o efeito da luz: o goblin a 13,5 m de Thorin.
    const escura = aplicar(
      base,
      { tipo: 'ApagarParedes', instanciaId: 'cripta', paredeIds: ['w'] },
      { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas: { luzAmbiente: 'escuridao' } },
    );
    const cripta = escura.instancias.cripta;
    expect(tokensQueVe(visaoNaInstancia(cripta, 'j-ana', fontes()), cripta, 'j-ana', fontes()).has('t-gob')).toBe(false);
    expect(tokensQueVe(visaoNaInstancia(cripta, 'j-bia', fontes()), cripta, 'j-bia', fontes()).has('t-gob')).toBe(true);
    // Longe demais para a visão no escuro de 18 m (1200 px), mas com uma tocha o goblin aparece para todos.
    const longe = aplicar(escura, { tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 't-gob', x: 2900, y: 500 });
    expect(tokensQueVe(visaoNaInstancia(longe.instancias.cripta, 'j-bia', fontes()), longe.instancias.cripta, 'j-bia', fontes()).has('t-gob')).toBe(false);
    const comTocha = aplicar(longe, {
      tipo: 'EditarToken',
      instanciaId: 'cripta',
      tokenId: 't-gob',
      mudancas: { luz: { clara: 6, penumbra: 6, cor: 0xffb35c, tremular: true } },
    });
    const c = comTocha.instancias.cripta;
    expect(tokensQueVe(visaoNaInstancia(c, 'j-ana', fontes()), c, 'j-ana', fontes()).has('t-gob')).toBe(true);
    // Pelo relógio: de dia, tudo claro; à noite, escuro.
    const aoArLivre = aplicar(escura, { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas: { luzAmbiente: 'relogio' } });
    const ar = aoArLivre.instancias.cripta;
    expect(tokensQueVe(visaoNaInstancia(ar, 'j-ana', fontes(12 * 60)), ar, 'j-ana', fontes()).has('t-gob')).toBe(true);
    expect(tokensQueVe(visaoNaInstancia(ar, 'j-ana', fontes(23 * 60)), ar, 'j-ana', fontes()).has('t-gob')).toBe(false);
  });

  it('a luz de um token escondido pelo mestre não conta para os jogadores', () => {
    const escondido = aplicar(
      base,
      { tipo: 'EditarToken', instanciaId: 'cripta', tokenId: 't-gob', mudancas: { escondido: true, luz: { clara: 6, penumbra: 0, cor: 0, tremular: false } } },
    );
    const cripta = escondido.instancias.cripta;
    expect(visaoNaInstancia(cripta, 'j-ana', fontes()).luzes).toEqual([]);
    expect(visaoNaInstancia(cripta, 'mestre', fontes()).luzes).toHaveLength(1);
  });

  it('com a visão desligada, o jogador vê tudo; sem token, não vê nada', () => {
    const livre = aplicar(base, { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas: { visao: 'livre' } });
    const cripta = livre.instancias.cripta;
    expect(tokensQueVe(visaoNaInstancia(cripta, 'j-ana', fontes()), cripta, 'j-ana', fontes()).has('t-gob')).toBe(true);
    const semToken = visaoNaInstancia(base.instancias.cripta, 'j-caio', fontes());
    expect(semToken.observadores).toEqual([]);
    expect(vePonto(semToken, { x: 500, y: 500 })).toBe(false);
  });

  it('as portas abertas e as janelas deixam ver; as fechadas não', () => {
    const comPorta = aplicar(
      base,
      { tipo: 'ApagarParedes', instanciaId: 'cripta', paredeIds: ['w'] },
      { tipo: 'CriarParedes', instanciaId: 'cripta', paredes: [novaParede('p', { x: 1000, y: 0 }, { x: 1000, y: 2000 }, 'porta')] },
    );
    const ve = (estado: EstadoInstancias) =>
      tokensQueVe(visaoNaInstancia(estado.instancias.cripta, 'j-ana', fontes()), estado.instancias.cripta, 'j-ana', fontes()).has('t-gob');
    expect(ve(comPorta)).toBe(false);
    expect(ve(aplicar(comPorta, { tipo: 'MudarPorta', instanciaId: 'cripta', paredeId: 'p', estado: 'aberta' }))).toBe(true);
    const janela = aplicar(
      base,
      { tipo: 'ApagarParedes', instanciaId: 'cripta', paredeIds: ['w'] },
      { tipo: 'CriarParedes', instanciaId: 'cripta', paredes: [novaParede('j', { x: 1000, y: 0 }, { x: 1000, y: 2000 }, 'janela')] },
    );
    expect(ve(janela)).toBe(true);
  });
});

describe('névoa de masmorra: células vistas', () => {
  it('a grade tem células de 0,75 m e não passa do limite', () => {
    expect(gradeDaExploracao(base.instancias.cripta)).toEqual({ celula: 50, colunas: 60, linhas: 40 });
    const enorme = gradeDaExploracao({ largura: 50_000, altura: 50_000, metrosPorPixel: 0.015 });
    expect(enorme.colunas * enorme.linhas).toBeLessThanOrEqual(250 * 250);
  });

  it('marca o que o jogador vê, sem o que fica atrás da parede', () => {
    const cripta = base.instancias.cripta;
    const grade = gradeDaExploracao(cripta);
    const vistas = new Set(celulasVistas(visaoNaInstancia(cripta, 'j-ana', fontes()), grade));
    const indice = (x: number, y: number) => Math.floor(y / grade.celula) * grade.colunas + Math.floor(x / grade.celula);
    expect(vistas.has(indice(500, 500))).toBe(true);
    expect(vistas.has(indice(1500, 500))).toBe(false);
    expect(vistas.has(indice(1100, 1990))).toBe(true); // por baixo da ponta da parede
    expect(celulasVistas(visaoNaInstancia(cripta, 'j-caio', fontes()), grade)).toEqual([]);
  });
});

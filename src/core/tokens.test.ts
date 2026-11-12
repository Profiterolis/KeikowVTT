import { describe, expect, it } from 'vitest';
import { criarEntrada } from './entradas';
import { criarFicha, fichaDeMonstro } from './fichas';
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
import { desserializarInstancias, serializarInstancias } from './persistenciaInstancias';
import {
  conferirInstancias,
  diametroEmMetros,
  nomeNumerado,
  novoToken,
  permissaoParaMover,
  tamanhoDaFicha,
  tokenDaFicha,
  tokensVistos,
  type ContextoDasInstancias,
} from './tokens';
import { REGRAS_PADRAO } from './regrasPadrao';

const aplicar = (estado: EstadoInstancias, ...acoes: AcaoInstancias[]) => acoes.reduce(aplicarAcaoInstancias, estado);

/** Lyra é da Ana; o goblin é do mestre. */
const DONOS: Record<string, string> = { lyra: 'j-ana', goblin: 'mestre', thorin: 'j-bia' };
const contexto: ContextoDasInstancias = { obterDonoDaFicha: (id) => DONOS[id] ?? null };

const base = aplicar(
  criarInstanciasVazias(),
  { tipo: 'CriarInstancia', instancia: novaInstancia('cripta', 'Cripta', null) },
  { tipo: 'CriarInstancia', instancia: novaInstancia('clareira', 'Clareira', null) },
  { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-lyra', 'lyra', 100, 100) },
  { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-gob', 'goblin', 500, 300) },
  { tipo: 'LevarParaCena', participanteIds: ['j-ana', 'j-bia'], cena: cenaNaInstancia('cripta') },
);

describe('tokens nas instâncias', () => {
  it('põe tokens no mapa, dentro dos limites', () => {
    expect(Object.keys(base.instancias.cripta.tokens)).toEqual(['t-lyra', 't-gob']);
    const fora = aplicar(base, { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-x', 'thorin', -50, 99_999) });
    expect(fora.instancias.cripta.tokens['t-x']).toMatchObject({ x: 0, y: 2000 });
  });

  it('uma ficha tem um token só no jogo: pôr em outra instância tira da primeira', () => {
    const movida = aplicar(base, { tipo: 'ColocarToken', instanciaId: 'clareira', token: novoToken('t-novo', 'lyra', 10, 10) });
    expect(movida.instancias.cripta.tokens['t-lyra']).toBeUndefined();
    expect(movida.instancias.clareira.tokens['t-novo'].fichaId).toBe('lyra');
    expect(tokenDaFicha(movida, 'lyra')?.instancia.id).toBe('clareira');
    expect(tokenDaFicha(movida, 'ninguem')).toBeNull();
  });

  it('move, edita e tira; ações sem efeito devolvem o mesmo estado', () => {
    const movida = aplicar(base, { tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 't-lyra', x: 250, y: 260 });
    expect(movida.instancias.cripta.tokens['t-lyra']).toMatchObject({ x: 250, y: 260 });
    expect(aplicar(movida, { tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 't-lyra', x: 250, y: 260 })).toBe(movida);
    expect(aplicar(base, { tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 'nada', x: 1, y: 1 })).toBe(base);

    const editada = aplicar(base, {
      tipo: 'EditarToken',
      instanciaId: 'cripta',
      tokenId: 't-gob',
      mudancas: { escondido: true, nomeNoMapa: 'Vulto', tamanho: 3 },
    });
    expect(editada.instancias.cripta.tokens['t-gob']).toMatchObject({ escondido: true, nomeNoMapa: 'Vulto', tamanho: 3, x: 500 });
    // Tamanho fora dos limites não vale.
    expect(aplicar(base, { tipo: 'EditarToken', instanciaId: 'cripta', tokenId: 't-gob', mudancas: { tamanho: 0 } })).toBe(base);

    const tirada = aplicar(base, { tipo: 'TirarToken', instanciaId: 'cripta', tokenId: 't-gob' });
    expect(Object.keys(tirada.instancias.cripta.tokens)).toEqual(['t-lyra']);
  });

  it('diminuir o mapa traz os tokens para dentro; a cópia de uma instância sai sem tokens', () => {
    const menor = aplicar(base, { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas: { largura: 300, altura: 200 } });
    expect(menor.instancias.cripta.tokens['t-gob']).toMatchObject({ x: 300, y: 200 });
    const copia = aplicar(base, { tipo: 'DuplicarInstancia', instanciaId: 'cripta', novoId: 'copia' });
    expect(copia.instancias.copia.tokens).toEqual({});
  });

  it('o jogador não recebe os tokens escondidos', () => {
    const escondido = aplicar(base, { tipo: 'EditarToken', instanciaId: 'cripta', tokenId: 't-gob', mudancas: { escondido: true } });
    expect(Object.keys(instanciasVistasPor(escondido, 'j-ana').instancias.cripta.tokens)).toEqual(['t-lyra']);
    expect(Object.keys(instanciasVistasPor(escondido, 'mestre').instancias.cripta.tokens)).toEqual(['t-lyra', 't-gob']);
  });

  it('o jogador move só os próprios tokens, na instância em que está e sem trava', () => {
    expect(permissaoParaMover(base, 'cripta', 't-lyra', 'j-ana', contexto).ok).toBe(true);
    expect(permissaoParaMover(base, 'cripta', 't-gob', 'j-ana', contexto)).toMatchObject({ ok: false });
    expect(permissaoParaMover(base, 'cripta', 't-gob', 'mestre', contexto).ok).toBe(true);

    const longe = aplicar(base, { tipo: 'LevarParaCena', participanteIds: ['j-ana'], cena: cenaNaInstancia('clareira') });
    expect(permissaoParaMover(longe, 'cripta', 't-lyra', 'j-ana', contexto)).toMatchObject({ motivo: 'Você não está nesta instância.' });

    const travada = aplicar(base, { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas: { movimentoTravado: true } });
    expect(permissaoParaMover(travada, 'cripta', 't-lyra', 'j-ana', contexto).ok).toBe(false);
    expect(permissaoParaMover(travada, 'cripta', 't-lyra', 'mestre', contexto).ok).toBe(true);

    const tokenTravado = aplicar(base, { tipo: 'EditarToken', instanciaId: 'cripta', tokenId: 't-lyra', mudancas: { travado: true } });
    expect(permissaoParaMover(tokenTravado, 'cripta', 't-lyra', 'j-ana', contexto)).toMatchObject({ motivo: 'O mestre travou este token.' });
  });

  it('a loja confere: o jogador move o dele e não muda mais nada', () => {
    const recusas: string[] = [];
    let autor = 'j-ana';
    const loja = criarLojaInstancias(base, { obterAutorId: () => autor, aoRecusar: (m) => recusas.push(m) }, contexto);
    loja.despachar({ tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 't-lyra', x: 400, y: 400 });
    expect(loja.obterEstado().instancias.cripta.tokens['t-lyra']).toMatchObject({ x: 400, y: 400 });

    loja.despachar({ tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 't-gob', x: 1, y: 1 });
    loja.despachar({ tipo: 'EditarToken', instanciaId: 'cripta', tokenId: 't-lyra', mudancas: { tamanho: 6 } });
    loja.despachar({ tipo: 'TirarToken', instanciaId: 'cripta', tokenId: 't-lyra' });
    loja.despachar({ tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-th', 'thorin', 5, 5) });
    expect(recusas).toHaveLength(4);
    expect(loja.obterEstado().instancias.cripta.tokens['t-gob'].x).toBe(500);

    // O mestre move qualquer um; o jogador não desfaz o que o mestre fez.
    autor = 'mestre';
    loja.despachar({ tipo: 'MoverToken', instanciaId: 'cripta', tokenId: 't-gob', x: 9, y: 9 });
    autor = 'j-ana';
    loja.desfazer();
    expect(loja.obterEstado().instancias.cripta.tokens['t-gob'].x).toBe(9);
  });

  it('conferirInstancias recusa mudanças de jogador fora dos tokens', () => {
    const renomeada = aplicar(base, { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas: { nome: 'X' } });
    expect(conferirInstancias(base, renomeada, 'j-ana', contexto).ok).toBe(false);
    expect(conferirInstancias(base, renomeada, 'mestre', contexto).ok).toBe(true);
  });

  it('tamanho vem do monstro ou da espécie; o mestre pode escolher outro', () => {
    const ogro = criarEntrada('monstro', 'm-ogro');
    const fichaOgro = fichaDeMonstro({ ...ogro, dados: { ...ogro.dados, tamanho: 'grande' } }, 'f-ogro');
    expect(tamanhoDaFicha(fichaOgro)).toBe('grande');
    expect(diametroEmMetros(novoToken('t', 'f-ogro', 0, 0), fichaOgro)).toBe(3);
    expect(diametroEmMetros({ ...novoToken('t', 'f-ogro', 0, 0), tamanho: 4 }, fichaOgro)).toBe(4);

    const halfling = criarEntrada('especie', 'e-hal');
    const pequena = {
      ...criarFicha('personagem', 'f-p'),
      especieId: 'e-hal',
      entradas: { 'e-hal': { ...halfling, dados: { ...halfling.dados, tamanho: 'pequeno' as const } } },
    };
    expect(tamanhoDaFicha(pequena)).toBe('pequeno');
    expect(diametroEmMetros(novoToken('t', 'f-p', 0, 0), pequena)).toBe(1.5);
    expect(diametroEmMetros(novoToken('t', 'sumiu', 0, 0), undefined)).toBe(1.5);
  });

  it('numera monstros iguais com o primeiro número livre', () => {
    expect(nomeNumerado('Goblin', [])).toBe('Goblin 1');
    expect(nomeNumerado('Goblin', ['Goblin 1', 'goblin 2', 'Orc 3'])).toBe('Goblin 3');
    expect(nomeNumerado('Goblin', ['Goblin 2'])).toBe('Goblin 1');
    expect(nomeNumerado('  ', [])).toBe('Monstro 1');
  });

  it('salva e lê os tokens; a versão 1 abre sem tokens', () => {
    const travada = aplicar(base, { tipo: 'EditarToken', instanciaId: 'cripta', tokenId: 't-gob', mudancas: { travado: true, tamanho: 3 } });
    const lida = desserializarInstancias(serializarInstancias(travada));
    expect(lida.ok && lida.estado).toEqual(travada);

    const antiga = {
      versao: 1,
      instancias: [{ id: 'a', nome: 'A', descricao: '', hex: null, imagem: null, largura: 100, altura: 100, metrosPorPixel: 0.015 }],
      cenas: {},
      cenaInicial: { tipo: 'mapa' },
    };
    const convertida = desserializarInstancias(JSON.stringify(antiga));
    expect(convertida.ok && convertida.estado.instancias.a).toMatchObject({ tokens: {}, movimentoTravado: false });

    const ruim = JSON.parse(serializarInstancias(base));
    ruim.instancias[0].tokens[0].x = 'longe';
    expect(desserializarInstancias(JSON.stringify(ruim)).ok).toBe(false);
  });

  it('cada participante vê o nome que pode saber, os PV só se for dono ou mestre e se pode mover', () => {
    const lyra = { ...criarFicha('personagem', 'lyra', 'j-ana'), nome: 'Lyra', pvAtuais: 3 };
    const goblin = { ...fichaDeMonstro(criarEntrada('monstro', 'm-gob'), 'goblin'), nome: 'Goblin 1' };
    const fichas = { lyra, goblin };
    const comNome = aplicar(base, {
      tipo: 'EditarToken',
      instanciaId: 'cripta',
      tokenId: 't-gob',
      mudancas: { nomeNoMapa: 'Vulto' },
    });
    const daAna = tokensVistos(comNome, instanciasVistasPor(comNome, 'j-ana').instancias.cripta, 'j-ana', fichas, REGRAS_PADRAO, contexto);
    const lyraVista = daAna.find((t) => t.id === 't-lyra')!;
    const goblinVisto = daAna.find((t) => t.id === 't-gob')!;
    expect(lyraVista).toMatchObject({ nome: 'Lyra', podeMover: true, tipo: 'personagem' });
    // Sem classe, a ficha ainda não tem PV máximos: fica sem barra.
    expect(lyraVista.pv).toBeNull();
    // 1,5 m na escala padrão (0,015 m por pixel) = 100 pixels.
    expect(lyraVista.diametro).toBeCloseTo(100);
    expect(goblinVisto).toMatchObject({ nome: 'Vulto', pv: null, podeMover: false });

    const doMestre = tokensVistos(comNome, comNome.instancias.cripta, 'mestre', fichas, REGRAS_PADRAO, contexto);
    expect(doMestre.find((t) => t.id === 't-gob')).toMatchObject({ nome: 'Vulto (Goblin 1)', podeMover: true });
    expect(doMestre.find((t) => t.id === 't-gob')?.pv).not.toBeNull();

    // Ficha apagada: o token some da tela, sem mudar o estado.
    expect(tokensVistos(comNome, comNome.instancias.cripta, 'mestre', { lyra }, REGRAS_PADRAO, contexto).map((t) => t.id)).toEqual(['t-lyra']);
  });

  it('pôr o personagem de um jogador na instância leva o jogador junto, num passo só', () => {
    const vazia = aplicar(criarInstanciasVazias(), { tipo: 'CriarInstancia', instancia: novaInstancia('cripta', 'Cripta', null) });
    const posta = aplicar(vazia, {
      tipo: 'ColocarToken',
      instanciaId: 'cripta',
      token: novoToken('t-lyra', 'lyra', 10, 10),
      levar: ['j-ana'],
    });
    expect(posta.cenas['j-ana']).toEqual(cenaNaInstancia('cripta'));
    // O mestre não tem cena guardada, e o token igual com o jogador já lá não muda nada.
    expect(aplicar(posta, { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-lyra', 'lyra', 10, 10), levar: ['j-ana'] })).toBe(posta);
    expect(aplicar(vazia, { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-g', 'goblin', 1, 1), levar: ['mestre'] }).cenas).toEqual({});
    // Token que já estava lá, com o jogador fora: só o jogador muda.
    const fora = aplicar(posta, { tipo: 'LevarParaCena', participanteIds: ['j-ana'], cena: { tipo: 'mapa' } });
    const deVolta = aplicar(fora, { tipo: 'ColocarToken', instanciaId: 'cripta', token: novoToken('t-lyra', 'lyra', 10, 10), levar: ['j-ana'] });
    expect(deVolta.cenas['j-ana']).toEqual(cenaNaInstancia('cripta'));
    expect(deVolta.instancias).toBe(fora.instancias);
  });
});

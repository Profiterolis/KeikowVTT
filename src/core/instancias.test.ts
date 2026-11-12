import { describe, expect, it } from 'vitest';
import {
  aplicarAcaoInstancias,
  CENA_MAPA,
  cenaDe,
  cenaNaInstancia,
  criarInstanciasVazias,
  criarLojaInstancias,
  instanciaDe,
  instanciasDoHex,
  instanciasEmOrdem,
  instanciasVistasPor,
  novaInstancia,
  pixelsEmMetros,
  problemaNaInstancia,
  quemEstaNaCena,
  situacaoDoHex,
  type AcaoInstancias,
  type EstadoInstancias,
} from './instancias';
import { aplicarAcao, criarMapaVazio } from './mapa';

const aplicar = (estado: EstadoInstancias, ...acoes: AcaoInstancias[]) => acoes.reduce(aplicarAcaoInstancias, estado);

const cripta = novaInstancia('cripta', 'Cripta', { q: 1, r: 2 });
const clareira = novaInstancia('clareira', 'Clareira', null);
const comDuas = aplicar(
  criarInstanciasVazias(),
  { tipo: 'CriarInstancia', instancia: cripta },
  { tipo: 'CriarInstancia', instancia: clareira },
);

describe('instâncias', () => {
  it('começa vazia, com todos no mapa-mundi', () => {
    const vazio = criarInstanciasVazias();
    expect(vazio.instancias).toEqual({});
    expect(cenaDe(vazio, 'j-ana')).toEqual(CENA_MAPA);
    expect(instanciaDe(vazio, 'j-ana')).toBeNull();
  });

  it('uma instância nova tem a escala padrão de 100 pixels = 1,5 m', () => {
    expect(pixelsEmMetros(cripta, 100)).toBeCloseTo(1.5);
    expect(cripta.imagem).toBeNull();
    expect(problemaNaInstancia(cripta)).toBeNull();
  });

  it('cria, edita só os campos informados e recusa valores inválidos', () => {
    expect(Object.keys(comDuas.instancias)).toEqual(['cripta', 'clareira']);
    // Id repetido não cria nada.
    expect(aplicar(comDuas, { tipo: 'CriarInstancia', instancia: { ...clareira, nome: 'Outra' } })).toBe(comDuas);

    const editada = aplicar(comDuas, {
      tipo: 'EditarInstancia',
      instanciaId: 'cripta',
      mudancas: { nome: 'Cripta antiga', descricao: 'Um lich dorme aqui.', hex: null },
    });
    expect(editada.instancias.cripta).toEqual({ ...cripta, nome: 'Cripta antiga', descricao: 'Um lich dorme aqui.', hex: null });

    // Nada muda: o mesmo objeto volta.
    expect(aplicar(comDuas, { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas: { nome: 'Cripta' } })).toBe(comDuas);
    for (const mudancas of [{ largura: 0 }, { altura: 60_000 }, { metrosPorPixel: -1 }, { metrosPorPixel: Number.NaN }]) {
      expect(aplicar(comDuas, { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas })).toBe(comDuas);
    }
    expect(aplicar(comDuas, { tipo: 'EditarInstancia', instanciaId: 'nenhuma', mudancas: { nome: 'X' } })).toBe(comDuas);
  });

  it('duplica com um id novo e "(cópia)" no nome', () => {
    const duplicado = aplicar(comDuas, { tipo: 'DuplicarInstancia', instanciaId: 'clareira', novoId: 'clareira-2' });
    expect(duplicado.instancias['clareira-2']).toEqual({ ...clareira, id: 'clareira-2', nome: 'Clareira (cópia)' });
    expect(aplicar(comDuas, { tipo: 'DuplicarInstancia', instanciaId: 'clareira', novoId: 'cripta' })).toBe(comDuas);
  });

  it('lista em ordem alfabética e acha as instâncias de um hex', () => {
    expect(instanciasEmOrdem(comDuas).map((i) => i.id)).toEqual(['clareira', 'cripta']);
    expect(instanciasDoHex(comDuas, { q: 1, r: 2 }).map((i) => i.id)).toEqual(['cripta']);
    expect(instanciasDoHex(comDuas, { q: 0, r: 0 })).toEqual([]);
  });

  it('um hex apagado não apaga a instância: ela fica com a coordenada, sem terreno', () => {
    const mapa = aplicarAcao(criarMapaVazio(), { tipo: 'ColocarTile', coord: { q: 1, r: 2 }, terreno: 'hexPlains00' });
    expect(situacaoDoHex(cripta, mapa)).toBe('noHex');
    expect(situacaoDoHex(cripta, criarMapaVazio())).toBe('hexSemTerreno');
    expect(situacaoDoHex(clareira, mapa)).toBe('universal');
  });
});

describe('cenas', () => {
  it('o mestre leva um ou vários jogadores; a cena dele não é guardada', () => {
    const levados = aplicar(comDuas, {
      tipo: 'LevarParaCena',
      participanteIds: ['j-ana', 'j-bia', 'mestre'],
      cena: cenaNaInstancia('cripta'),
    });
    expect(levados.cenas).toEqual({ 'j-ana': cenaNaInstancia('cripta'), 'j-bia': cenaNaInstancia('cripta') });
    expect(instanciaDe(levados, 'j-ana')?.nome).toBe('Cripta');
    expect(cenaDe(levados, 'j-caio')).toEqual(CENA_MAPA);
    expect(quemEstaNaCena(levados, cenaNaInstancia('cripta'), ['mestre', 'j-ana', 'j-bia', 'j-caio'])).toEqual(['j-ana', 'j-bia']);
    expect(quemEstaNaCena(levados, CENA_MAPA, ['mestre', 'j-ana', 'j-caio'])).toEqual(['j-caio']);

    // Levar para onde já está, ou para uma instância que não existe, não muda nada.
    expect(aplicar(levados, { tipo: 'LevarParaCena', participanteIds: ['j-ana'], cena: cenaNaInstancia('cripta') })).toBe(levados);
    expect(aplicar(levados, { tipo: 'LevarParaCena', participanteIds: ['j-ana'], cena: cenaNaInstancia('nenhuma') })).toBe(levados);

    const voltou = aplicar(levados, { tipo: 'LevarParaCena', participanteIds: ['j-bia'], cena: CENA_MAPA });
    expect(cenaDe(voltou, 'j-bia')).toEqual(CENA_MAPA);
    expect(cenaDe(voltou, 'j-ana')).toEqual(cenaNaInstancia('cripta'));
  });

  it('quem não tem cena vai para a cena inicial', () => {
    const inicial = aplicar(comDuas, { tipo: 'DefinirCenaInicial', cena: cenaNaInstancia('clareira') });
    expect(cenaDe(inicial, 'j-novo')).toEqual(cenaNaInstancia('clareira'));
    expect(aplicar(comDuas, { tipo: 'DefinirCenaInicial', cena: cenaNaInstancia('nenhuma') })).toBe(comDuas);
    expect(aplicar(comDuas, { tipo: 'DefinirCenaInicial', cena: CENA_MAPA })).toBe(comDuas);
  });

  it('apagar uma instância devolve ao mapa-mundi quem estava nela e a cena inicial', () => {
    const preparado = aplicar(
      comDuas,
      { tipo: 'LevarParaCena', participanteIds: ['j-ana'], cena: cenaNaInstancia('cripta') },
      { tipo: 'LevarParaCena', participanteIds: ['j-bia'], cena: cenaNaInstancia('clareira') },
      { tipo: 'DefinirCenaInicial', cena: cenaNaInstancia('cripta') },
    );
    const apagado = aplicar(preparado, { tipo: 'ApagarInstancia', instanciaId: 'cripta' });
    expect(apagado.instancias.cripta).toBeUndefined();
    expect(apagado.cenas).toEqual({ 'j-ana': CENA_MAPA, 'j-bia': cenaNaInstancia('clareira') });
    expect(apagado.cenaInicial).toEqual(CENA_MAPA);
    expect(cenaDe(apagado, 'j-novo')).toEqual(CENA_MAPA);
  });
});

describe('o que cada um vê', () => {
  const preparado = aplicar(
    comDuas,
    { tipo: 'EditarInstancia', instanciaId: 'cripta', mudancas: { descricao: 'Um lich dorme aqui.' } },
    { tipo: 'LevarParaCena', participanteIds: ['j-ana'], cena: cenaNaInstancia('cripta') },
    { tipo: 'LevarParaCena', participanteIds: ['j-bia'], cena: cenaNaInstancia('clareira') },
  );

  it('o mestre vê tudo', () => {
    expect(instanciasVistasPor(preparado, 'mestre')).toBe(preparado);
  });

  it('o jogador recebe só a instância em que está, sem a descrição, e só a própria cena', () => {
    const daAna = instanciasVistasPor(preparado, 'j-ana');
    expect(Object.keys(daAna.instancias)).toEqual(['cripta']);
    expect(daAna.instancias.cripta.descricao).toBe('');
    expect(daAna.cenas).toEqual({ 'j-ana': cenaNaInstancia('cripta') });
    expect(cenaDe(daAna, 'j-ana')).toEqual(cenaNaInstancia('cripta'));
    expect(JSON.stringify(daAna)).not.toContain('Clareira');
    expect(JSON.stringify(daAna)).not.toContain('lich');
  });

  it('no mapa-mundi, o jogador não recebe nenhuma instância, nem a cena inicial secreta', () => {
    const comInicial = aplicar(preparado, { tipo: 'DefinirCenaInicial', cena: cenaNaInstancia('clareira') });
    const levado = aplicar(comInicial, { tipo: 'LevarParaCena', participanteIds: ['j-caio'], cena: CENA_MAPA });
    const doCaio = instanciasVistasPor(levado, 'j-caio');
    expect(doCaio).toEqual({ instancias: {}, cenas: { 'j-caio': CENA_MAPA }, cenaInicial: CENA_MAPA });
  });
});

describe('loja das instâncias', () => {
  it('só o mestre muda, e o desfazer volta o passo', () => {
    const sessao = { autorId: 'mestre' };
    const recusas: string[] = [];
    const eventos: string[] = [];
    const loja = criarLojaInstancias(undefined, {
      obterAutorId: () => sessao.autorId,
      aoRecusar: (motivo) => recusas.push(motivo),
      aoExecutar: (evento) => eventos.push(evento.tipo),
    });
    loja.despachar({ tipo: 'CriarInstancia', instancia: cripta });
    expect(loja.obterEstado().instancias.cripta).toBeDefined();

    sessao.autorId = 'j-ana';
    loja.despachar({ tipo: 'LevarParaCena', participanteIds: ['j-ana'], cena: cenaNaInstancia('cripta') });
    expect(cenaDe(loja.obterEstado(), 'j-ana')).toEqual(CENA_MAPA);
    expect(recusas).toEqual(['Só o mestre muda as instâncias.']);
    expect(loja.podeDesfazer()).toBe(false);

    sessao.autorId = 'mestre';
    loja.desfazer();
    expect(loja.obterEstado().instancias).toEqual({});
    expect(eventos).toEqual(['CriarInstancia', 'DesfazerInstancias']);
  });
});

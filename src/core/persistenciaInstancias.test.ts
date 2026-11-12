import { describe, expect, it } from 'vitest';
import { criarCampanhaInicial } from './campanha';
import { GRUPO_SEM_POSICAO } from './grupo';
import { imagensUsadas } from './imagens';
import {
  aplicarAcaoInstancias,
  cenaNaInstancia,
  criarInstanciasVazias,
  novaInstancia,
  type AcaoInstancias,
  type EstadoInstancias,
} from './instancias';
import { criarMapaVazio } from './mapa';
import { serializarArquivoCompleto } from './persistenciaCampanha';
import {
  desserializarInstancias,
  instanciasParaObjeto,
  lerInstanciasDoArquivo,
  serializarInstancias,
} from './persistenciaInstancias';

const FUNDO = `img-${'e'.repeat(64)}`;

function exemplo(): EstadoInstancias {
  const acoes: AcaoInstancias[] = [
    { tipo: 'CriarInstancia', instancia: { ...novaInstancia('cripta', 'Cripta', { q: -1, r: 3 }), descricao: 'Segredo', imagem: FUNDO } },
    { tipo: 'CriarInstancia', instancia: { ...novaInstancia('clareira', 'Clareira', null), largura: 1200, metrosPorPixel: 0.02 } },
    { tipo: 'LevarParaCena', participanteIds: ['j-ana'], cena: cenaNaInstancia('cripta') },
    { tipo: 'LevarParaCena', participanteIds: ['j-bia'], cena: { tipo: 'mapa' } },
    { tipo: 'DefinirCenaInicial', cena: cenaNaInstancia('clareira') },
  ];
  return acoes.reduce(aplicarAcaoInstancias, criarInstanciasVazias());
}

describe('salvamento das instâncias', () => {
  it('vai e volta sem perder nada', () => {
    const estado = exemplo();
    expect(desserializarInstancias(serializarInstancias(estado))).toEqual({ ok: true, estado });
    expect(desserializarInstancias(serializarInstancias(criarInstanciasVazias()))).toEqual({
      ok: true,
      estado: criarInstanciasVazias(),
    });
  });

  it('recusa dados estranhos', () => {
    const objeto = instanciasParaObjeto(exemplo());
    const recusado = (dados: unknown) => desserializarInstancias(JSON.stringify(dados)).ok;
    expect(desserializarInstancias('não é json').ok).toBe(false);
    expect(recusado({ ...objeto, versao: 99 })).toBe(false);
    // Só um id de imagem entra no lugar da imagem de fundo.
    expect(recusado({ ...objeto, instancias: objeto.instancias.map((i) => ({ ...i, imagem: '../segredo.png' })) })).toBe(false);
    expect(recusado({ ...objeto, instancias: objeto.instancias.map((i) => ({ ...i, largura: -5 })) })).toBe(false);
    expect(recusado({ ...objeto, instancias: [...objeto.instancias, objeto.instancias[0]] })).toBe(false);
    expect(recusado({ ...objeto, cenas: { 'j-ana': { tipo: 'instancia', instanciaId: 'sumiu' } } })).toBe(false);
    expect(recusado({ ...objeto, cenaInicial: { tipo: 'outra' } })).toBe(false);
  });

  it('o arquivo do botão Salvar traz as instâncias; arquivos antigos não têm', () => {
    const estado = exemplo();
    const conteudo = { campanha: criarCampanhaInicial(), registro: [] };
    const com = serializarArquivoCompleto(criarMapaVazio(), GRUPO_SEM_POSICAO, conteudo, undefined, undefined, estado);
    expect(lerInstanciasDoArquivo(com)).toEqual({ ok: true, estado });
    const sem = serializarArquivoCompleto(criarMapaVazio(), GRUPO_SEM_POSICAO, conteudo);
    expect(lerInstanciasDoArquivo(sem)).toEqual({ ok: true, estado: null });
  });

  it('a imagem de fundo entra na lista de imagens do arquivo', () => {
    expect([...imagensUsadas(null, null, exemplo())]).toEqual([FUNDO]);
  });
});

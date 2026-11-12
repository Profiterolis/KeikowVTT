import { describe, expect, it } from 'vitest';
import {
  celulaExplorada,
  criarLojaExploracao,
  desserializarExploracao,
  EXPLORACAO_VAZIA,
  explorar,
  exploracaoVistaPor,
  lerExploracaoDoArquivo,
  memoriaDe,
  serializarExploracao,
} from './exploracao';

const GRADE = { celula: 50, colunas: 10, linhas: 5 };

describe('memória da névoa de masmorra', () => {
  it('acrescenta células e lembra delas; nada novo devolve o mesmo estado', () => {
    const estado = explorar(EXPLORACAO_VAZIA, 'cripta', 'j-ana', GRADE, [0, 7, 49]);
    const bits = memoriaDe(estado, 'cripta', 'j-ana', GRADE)!;
    expect([0, 7, 49].every((i) => celulaExplorada(bits, i))).toBe(true);
    expect(celulaExplorada(bits, 1)).toBe(false);
    expect(explorar(estado, 'cripta', 'j-ana', GRADE, [7, 49])).toBe(estado);
    // Índices fora da grade são ignorados.
    expect(explorar(estado, 'cripta', 'j-ana', GRADE, [50, -1, 2.5])).toBe(estado);
    // Outra grade (o mestre mudou o tamanho): a memória antiga não vale.
    expect(memoriaDe(estado, 'cripta', 'j-ana', { ...GRADE, colunas: 11 })).toBeNull();
  });

  it('cada jogador vê só a própria memória; o mestre vê todas', () => {
    let estado = explorar(EXPLORACAO_VAZIA, 'cripta', 'j-ana', GRADE, [1]);
    estado = explorar(estado, 'cripta', 'j-bia', GRADE, [2]);
    expect(Object.keys(exploracaoVistaPor(estado, 'j-ana').instancias.cripta)).toEqual(['j-ana']);
    expect(exploracaoVistaPor(estado, 'j-caio').instancias).toEqual({});
    expect(exploracaoVistaPor(estado, 'mestre')).toBe(estado);
  });

  it('a loja: cada um guarda o que viu; só o mestre faz esquecer', () => {
    const loja = criarLojaExploracao();
    expect(loja.explorar('j-ana', 'cripta', 'j-bia', GRADE, [1]).ok).toBe(false);
    expect(loja.explorar('j-ana', 'cripta', 'j-ana', GRADE, [1]).ok).toBe(true);
    expect(loja.esquecer('j-ana', 'cripta').ok).toBe(false);
    expect(loja.esquecer('mestre', 'cripta').ok).toBe(true);
    expect(loja.obterEstado().instancias).toEqual({});
  });

  it('vai e volta pelo texto; recusa bits estranhos; arquivos antigos não têm memória', () => {
    const estado = explorar(EXPLORACAO_VAZIA, 'cripta', 'j-ana', GRADE, [3, 4]);
    expect(desserializarExploracao(serializarExploracao(estado))).toEqual({ ok: true, estado });
    const ruim = JSON.parse(serializarExploracao(estado));
    ruim.instancias.cripta['j-ana'].bits = '%%%';
    expect(desserializarExploracao(JSON.stringify(ruim)).ok).toBe(false);
    ruim.instancias.cripta['j-ana'].bits = btoa('a');
    expect(desserializarExploracao(JSON.stringify(ruim)).ok).toBe(false);
    expect(lerExploracaoDoArquivo('{"versao":4}')).toEqual({ ok: true, estado: null });
    const arquivo = JSON.stringify({ exploracao: JSON.parse(serializarExploracao(estado)) });
    expect(lerExploracaoDoArquivo(arquivo)).toEqual({ ok: true, estado });
  });
});

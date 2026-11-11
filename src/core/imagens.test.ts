import { describe, expect, it } from 'vitest';
import { aplicarAcaoCompendio, criarCompendioVazio } from './compendio';
import { criarEntrada } from './entradas';
import { criarFicha } from './fichas';
import {
  calcularIdDaImagem,
  comImagem,
  ehIdDeImagem,
  imagemDoToken,
  imagensUsadas,
  lerImagemOpcional,
  problemaNaImagem,
  tipoPelaExtensao,
} from './imagens';
import { lerEntrada } from './persistenciaCompendio';
import { entradasParaImportar } from './pacotes';

const ID_A = `img-${'a'.repeat(64)}`;
const ID_B = `img-${'b'.repeat(64)}`;
const ID_C = `img-${'c'.repeat(64)}`;

describe('ids das imagens', () => {
  it('o id sai do conteúdo: a mesma imagem dá o mesmo id, outra dá outro', async () => {
    const um = await calcularIdDaImagem(new Uint8Array([1, 2, 3]));
    expect(ehIdDeImagem(um)).toBe(true);
    expect(await calcularIdDaImagem(new Uint8Array([1, 2, 3]).buffer)).toBe(um);
    expect(await calcularIdDaImagem(new Uint8Array([1, 2, 4]))).not.toBe(um);
  });

  it('recusa ids que não têm o formato (nada de caminhos ou endereços)', () => {
    expect(ehIdDeImagem('img-123')).toBe(false);
    expect(ehIdDeImagem('https://exemplo.com/a.png')).toBe(false);
    expect(() => lerImagemOpcional({ retrato: '../a.png' }, 'retrato', 'A ficha')).toThrow('imagem');
    expect(lerImagemOpcional({}, 'retrato', 'A ficha')).toEqual({});
    expect(lerImagemOpcional({ retrato: ID_A }, 'retrato', 'A ficha')).toEqual({ retrato: ID_A });
  });
});

describe('arquivos aceitos', () => {
  it('aceita PNG, JPG, WEBP e GIF até o tamanho máximo', () => {
    expect(problemaNaImagem('image/png', 1000)).toBeNull();
    expect(problemaNaImagem('image/svg+xml', 1000)).toContain('PNG');
    expect(problemaNaImagem('image/jpeg', 500 * 1024 * 1024)).toContain('MB');
  });

  it('descobre o tipo pela extensão', () => {
    expect(tipoPelaExtensao(`${ID_A}.png`)).toBe('image/png');
    expect(tipoPelaExtensao('foto.JPEG')).toBe('image/jpeg');
    expect(tipoPelaExtensao('texto.txt')).toBeNull();
  });
});

describe('imagens nos documentos', () => {
  it('trocar e tirar a imagem não deixa o campo vazio para trás', () => {
    const ficha = criarFicha('personagem', 'f1', 'ana');
    const com = comImagem(ficha, 'retrato', ID_A);
    expect(com.retrato).toBe(ID_A);
    expect('retrato' in comImagem(com, 'retrato', undefined)).toBe(false);
  });

  it('o token usa a própria imagem ou, sem ela, o retrato', () => {
    expect(imagemDoToken({})).toBeNull();
    expect(imagemDoToken({ retrato: ID_A })).toBe(ID_A);
    expect(imagemDoToken({ retrato: ID_A, token: ID_B })).toBe(ID_B);
  });

  it('acha as imagens usadas no compêndio, nas fichas e nas cópias dentro delas', () => {
    const espada = { ...criarEntrada('item', 'espada'), imagem: ID_C };
    const compendio = aplicarAcaoCompendio(criarCompendioVazio(), { tipo: 'AdicionarEntrada', entrada: espada });
    const ficha = { ...criarFicha('personagem', 'f1', 'ana'), retrato: ID_A, token: ID_B };
    const copia = { ...criarEntrada('item', 'escudo'), imagem: `img-${'d'.repeat(64)}` };
    const fichas = { fichas: { f1: { ...ficha, entradas: { escudo: copia } } } };
    expect([...imagensUsadas(compendio, fichas)].sort()).toEqual([ID_A, ID_B, ID_C, copia.imagem].sort());
    expect(imagensUsadas(null, null).size).toBe(0);
  });

  it('a imagem de uma entrada vai e volta pelo salvamento', () => {
    const espada = { ...criarEntrada('item', 'espada'), imagem: ID_A };
    expect(lerEntrada(JSON.parse(JSON.stringify(espada)), 'A espada')).toEqual(espada);
    expect('imagem' in lerEntrada(JSON.parse(JSON.stringify(criarEntrada('item', 'x'))), 'X')).toBe(false);
  });

  it('atualizar um pacote mantém a imagem que o mestre pôs na entrada', () => {
    const doPacote = { ...criarEntrada('item', 'espada'), nome: 'Longsword' };
    const local = { ...doPacote, imagem: ID_A };
    const compendio = aplicarAcaoCompendio(criarCompendioVazio(), { tipo: 'AdicionarEntrada', entrada: local });
    const pacote = { nome: 'srd', versao: 1, entradas: [doPacote] } as unknown as Parameters<typeof entradasParaImportar>[1];
    // Igual ao pacote, a não ser pela imagem: não conta como desatualizada.
    expect(entradasParaImportar(compendio, pacote, new Set(['item']), true)).toEqual([]);
    const novo = { ...doPacote, descricao: 'Texto novo.' };
    const pacoteNovo = { ...pacote, entradas: [novo] } as typeof pacote;
    expect(entradasParaImportar(compendio, pacoteNovo, new Set(['item']), true)).toEqual([{ ...novo, imagem: ID_A }]);
    const depois = aplicarAcaoCompendio(compendio, { tipo: 'ImportarEntradas', entradas: [novo], substituir: true });
    expect(depois.entradas.espada).toEqual({ ...novo, imagem: ID_A });
  });
});

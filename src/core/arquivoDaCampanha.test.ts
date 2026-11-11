import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { ehZip, lerArquivoDaCampanha, montarArquivoDaCampanha } from './arquivoDaCampanha';

const ID = `img-${'a'.repeat(64)}`;

describe('arquivo da campanha', () => {
  it('o .zip leva o texto e as imagens, e volta igual', () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const zip = montarArquivoDaCampanha({ texto: '{"versao":4}', imagens: [{ id: ID, tipo: 'image/png', bytes }] });
    expect(ehZip(zip)).toBe(true);
    const lido = lerArquivoDaCampanha(zip);
    expect(lido.texto).toBe('{"versao":4}');
    expect(lido.imagens).toEqual([{ id: ID, tipo: 'image/png', bytes }]);
  });

  it('um .json antigo abre como antes, sem imagens', () => {
    const texto = '{"versao":3,"tiles":[]}';
    expect(lerArquivoDaCampanha(strToU8(texto))).toEqual({ texto, imagens: [] });
  });

  it('ignora arquivos estranhos dentro do .zip', () => {
    const zip = zipSync({
      'campanha.json': strToU8('{}'),
      'imagens/nao-e-id.png': new Uint8Array([1]),
      [`imagens/${ID}.exe`]: new Uint8Array([1]),
      'outra/coisa.txt': strToU8('oi'),
    });
    expect(lerArquivoDaCampanha(zip).imagens).toEqual([]);
  });

  it('recusa um .zip que não é de campanha ou está danificado', () => {
    expect(() => lerArquivoDaCampanha(zipSync({ 'foto.png': new Uint8Array([1]) }))).toThrow('não é um arquivo de campanha');
    const danificado = montarArquivoDaCampanha({ texto: '{}', imagens: [] }).slice(0, 30);
    expect(() => lerArquivoDaCampanha(danificado)).toThrow('danificado');
  });
});

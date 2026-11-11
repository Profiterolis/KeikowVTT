import { describe, expect, it, vi } from 'vitest';
import { criarLojaGrupo } from '../core/grupo';
import { hexParaMundo } from '../core/hex';
import { criarLojaMapa } from '../core/loja';
import { hexEm } from '../core/mapa';
import type { Asset, Manifesto } from '../core/manifesto';
import { criarControlador, type Ferramenta } from './controladorFerramentas';

function asset(id: string, tipo: Asset['tipo']): Asset {
  return { id, tipo, categoria: 'c', arquivo: '', largura: 1, altura: 1, escala: 1, ancora: { x: 0, y: 0 } };
}

const manifesto: Manifesto = {
  categorias: [{ id: 'c', nome: 'C' }],
  assets: [asset('tile', 'tile'), asset('rio', 'sobreposicao'), asset('casa', 'decoracao')],
};

const A = { q: 0, r: 0 };
const B = { q: 1, r: 0 };
const centroB = hexParaMundo(B);

function montar() {
  const loja = criarLojaMapa();
  const cena = {
    mostrarPrevia: vi.fn(),
    mostrarPreviaDecoracao: vi.fn(),
    limparPrevia: vi.fn(),
    decoracaoEm: vi.fn().mockReturnValue(null),
    moverDecoracaoVisual: vi.fn(),
    sincronizarDecoracoes: vi.fn(),
  };
  const aoSelecionarHex = vi.fn();
  const aoAvisar = vi.fn();
  const lojaGrupo = criarLojaGrupo();
  const controlador = criarControlador(
    loja,
    lojaGrupo,
    manifesto,
    () => cena,
    aoSelecionarHex,
    aoAvisar,
  );
  const usar = (ferramenta: Ferramenta) => controlador.definirFerramenta(ferramenta);
  const colocarTerreno = () => {
    loja.despachar({ tipo: 'ColocarTile', coord: A, terreno: 'tile' });
    loja.despachar({ tipo: 'ColocarTile', coord: B, terreno: 'tile' });
  };
  const decoracoes = (coord = A) => hexEm(loja.obterEstado(), coord)?.decoracoes ?? [];
  return {
    loja,
    lojaGrupo,
    cena,
    controlador,
    usar,
    colocarTerreno,
    decoracoes,
    aoSelecionarHex,
    aoAvisar,
  };
}

describe('posicionar o grupo', () => {
  it('coloca o grupo no hex clicado', () => {
    const { lojaGrupo, controlador, usar, colocarTerreno } = montar();
    colocarTerreno();
    usar({ tipo: 'posicionar' });
    controlador.aoIniciarTraco(centroB);
    controlador.aoTerminarTraco();
    expect(lojaGrupo.obterEstado().posicao).toEqual(B);
  });

  it('não coloca o grupo em hex vazio', () => {
    const { lojaGrupo, controlador, usar } = montar();
    usar({ tipo: 'posicionar' });
    controlador.aoIniciarTraco(centroB);
    controlador.aoTerminarTraco();
    expect(lojaGrupo.obterEstado().posicao).toBeNull();
  });

  it('arrastar não leva o grupo junto', () => {
    const { lojaGrupo, controlador, usar, colocarTerreno } = montar();
    colocarTerreno();
    usar({ tipo: 'posicionar' });
    controlador.aoIniciarTraco({ x: 0, y: 0 });
    controlador.aoContinuarTraco(B);
    controlador.aoTerminarTraco();
    expect(lojaGrupo.obterEstado().posicao).toEqual(A);
  });

  it('o Ctrl+Z do mapa não move o grupo', () => {
    const { loja, lojaGrupo, controlador, usar, colocarTerreno } = montar();
    colocarTerreno();
    usar({ tipo: 'posicionar' });
    controlador.aoIniciarTraco(centroB);
    controlador.aoTerminarTraco();
    loja.desfazer();
    expect(lojaGrupo.obterEstado().posicao).toEqual(B);
  });

  it('um clique com a ferramenta não abre o painel', () => {
    const { controlador, usar, aoSelecionarHex } = montar();
    usar({ tipo: 'posicionar' });
    controlador.aoClicar(centroB);
    expect(aoSelecionarHex).not.toHaveBeenCalled();
  });
});

describe('modo somente leitura', () => {
  function emLeitura() {
    const montado = montar();
    montado.colocarTerreno();
    montado.controlador.colocarAsset('casa', { x: 5, y: 5 });
    return montado;
  }

  const ferramentas: Ferramenta[] = [
    { tipo: 'colocar', assetId: 'tile' },
    { tipo: 'colocar', assetId: 'casa' },
    { tipo: 'apagar' },
    { tipo: 'posicionar' },
    { tipo: 'revelar' },
    { tipo: 'ocultar' },
    { tipo: 'nenhuma' },
  ];

  it.each(ferramentas)('nenhum traço altera o mapa ou o grupo: %j', (ferramenta) => {
    const { loja, lojaGrupo, cena, controlador, usar, decoracoes } = emLeitura();
    usar(ferramenta);
    controlador.definirSomenteLeitura(true);
    cena.decoracaoEm.mockReturnValue({
      decoracaoId: decoracoes()[0].id,
      assetId: 'casa',
      coord: A,
      posicao: { x: 5, y: 5 },
    });
    const antes = loja.obterEstado();
    controlador.aoIniciarTraco({ x: 5, y: 5 });
    controlador.aoContinuarTraco(B);
    controlador.aoMoverDuranteTraco(centroB);
    controlador.aoTerminarTraco();
    expect(loja.obterEstado()).toBe(antes);
    expect(lojaGrupo.obterEstado().posicao).toBeNull();
  });

  it('continua sem editar mesmo se uma ferramenta for escolhida depois', () => {
    const { loja, controlador, usar } = emLeitura();
    controlador.definirSomenteLeitura(true);
    usar({ tipo: 'apagar' });
    const antes = loja.obterEstado();
    controlador.aoIniciarTraco({ x: 0, y: 0 });
    controlador.aoContinuarTraco(B);
    controlador.aoTerminarTraco();
    expect(loja.obterEstado()).toBe(antes);
  });

  it('arrastar da paleta não coloca nem mostra prévia', () => {
    const { loja, cena, controlador } = emLeitura();
    controlador.definirSomenteLeitura(true);
    const antes = loja.obterEstado();
    controlador.colocarAsset('tile', centroB);
    controlador.mostrarPrevia('tile', centroB);
    expect(loja.obterEstado()).toBe(antes);
    expect(cena.mostrarPrevia).not.toHaveBeenCalled();
  });

  it('sem posição do grupo, o clique em hex oculto não abre nada', () => {
    const { controlador, aoSelecionarHex } = emLeitura();
    controlador.definirSomenteLeitura(true);
    controlador.aoClicar(centroB);
    expect(aoSelecionarHex).not.toHaveBeenCalled();
  });

  it('o clique abre o hex do grupo e os vizinhos', () => {
    const { lojaGrupo, controlador, aoSelecionarHex } = emLeitura();
    lojaGrupo.despachar({ tipo: 'PosicionarGrupo', coord: A });
    controlador.definirSomenteLeitura(true);
    controlador.aoClicar({ x: 0, y: 0 });
    controlador.aoClicar(centroB);
    expect(aoSelecionarHex.mock.calls).toEqual([[A], [B]]);
  });

  it('o clique não abre um hex com terreno fora da visão', () => {
    const { loja, lojaGrupo, controlador, aoSelecionarHex } = emLeitura();
    const distante = { q: 5, r: 0 };
    loja.despachar({ tipo: 'ColocarTile', coord: distante, terreno: 'tile' });
    lojaGrupo.despachar({ tipo: 'PosicionarGrupo', coord: A });
    controlador.definirSomenteLeitura(true);
    controlador.aoClicar(hexParaMundo(distante));
    expect(aoSelecionarHex).not.toHaveBeenCalled();
  });

  it('o clique abre um hex revelado à mão, mesmo sem grupo', () => {
    const { loja, controlador, aoSelecionarHex } = emLeitura();
    loja.despachar({ tipo: 'RevelarHex', coord: B });
    controlador.definirSomenteLeitura(true);
    controlador.aoClicar(centroB);
    expect(aoSelecionarHex).toHaveBeenCalledExactlyOnceWith(B);
  });

  it('ao sair do modo, volta sem ferramenta e consegue editar', () => {
    const { loja, controlador, usar, aoSelecionarHex } = emLeitura();
    usar({ tipo: 'apagar' });
    controlador.definirSomenteLeitura(true);
    controlador.definirSomenteLeitura(false);
    const antes = loja.obterEstado();
    controlador.aoIniciarTraco(centroB);
    controlador.aoTerminarTraco();
    expect(loja.obterEstado()).toBe(antes);
    controlador.aoClicar(centroB);
    expect(aoSelecionarHex).toHaveBeenCalledExactlyOnceWith(B);
  });
});

describe('mapa travado', () => {
  function travado() {
    const montado = montar();
    montado.colocarTerreno();
    montado.controlador.colocarAsset('casa', { x: 5, y: 5 });
    montado.cena.decoracaoEm.mockReturnValue({
      decoracaoId: montado.decoracoes()[0].id,
      assetId: 'casa',
      coord: A,
      posicao: { x: 5, y: 5 },
    });
    montado.controlador.definirTravado(true);
    return montado;
  }

  it('arrastar uma decoração sem querer não a move', () => {
    const { loja, cena, controlador } = travado();
    const antes = loja.obterEstado();
    controlador.aoIniciarTraco({ x: 5, y: 5 });
    controlador.aoMoverDuranteTraco(centroB);
    controlador.aoTerminarTraco();
    expect(loja.obterEstado()).toBe(antes);
    expect(cena.moverDecoracaoVisual).not.toHaveBeenCalled();
  });

  it.each<Ferramenta>([{ tipo: 'colocar', assetId: 'tile' }, { tipo: 'colocar', assetId: 'casa' }, { tipo: 'apagar' }])(
    'não pinta, não coloca e não apaga: %j',
    (ferramenta) => {
      const { loja, controlador, usar } = travado();
      usar(ferramenta);
      const antes = loja.obterEstado();
      controlador.aoIniciarTraco(centroB);
      controlador.aoContinuarTraco(A);
      controlador.aoTerminarTraco();
      controlador.colocarAsset('tile', hexParaMundo({ q: 3, r: 0 }));
      expect(loja.obterEstado()).toBe(antes);
    },
  );

  it('travar no meio de um arraste devolve a decoração ao lugar', () => {
    const montado = montar();
    montado.colocarTerreno();
    montado.controlador.colocarAsset('casa', { x: 5, y: 5 });
    montado.cena.decoracaoEm.mockReturnValue({
      decoracaoId: montado.decoracoes()[0].id,
      assetId: 'casa',
      coord: A,
      posicao: { x: 5, y: 5 },
    });
    montado.controlador.aoIniciarTraco({ x: 5, y: 5 });
    montado.controlador.aoMoverDuranteTraco(centroB);
    montado.controlador.definirTravado(true);
    montado.controlador.aoTerminarTraco();
    expect(montado.decoracoes(A)).toHaveLength(1);
    expect(montado.cena.sincronizarDecoracoes).toHaveBeenCalled();
  });

  it('continua revelando, posicionando o grupo e abrindo hexes', () => {
    const { loja, lojaGrupo, controlador, usar, aoSelecionarHex } = travado();
    usar({ tipo: 'revelar' });
    controlador.aoIniciarTraco(centroB);
    controlador.aoTerminarTraco();
    expect(hexEm(loja.obterEstado(), B)?.revelado).toBe(true);
    usar({ tipo: 'posicionar' });
    controlador.aoIniciarTraco(centroB);
    controlador.aoTerminarTraco();
    expect(lojaGrupo.obterEstado().posicao).toEqual(B);
    usar({ tipo: 'nenhuma' });
    controlador.aoClicar(centroB);
    expect(aoSelecionarHex).toHaveBeenCalledExactlyOnceWith(B);
  });

  it('ao destravar, volta a editar', () => {
    const { controlador, decoracoes } = travado();
    controlador.definirTravado(false);
    controlador.aoIniciarTraco({ x: 5, y: 5 });
    controlador.aoMoverDuranteTraco(centroB);
    controlador.aoTerminarTraco();
    expect(decoracoes(B)).toHaveLength(1);
  });
});

describe('revelar e ocultar', () => {
  const revelado = (loja: ReturnType<typeof montar>['loja'], coord: typeof A) =>
    hexEm(loja.obterEstado(), coord)?.revelado;

  it('uma pincelada revela vários hexes e é desfeita de uma vez', () => {
    const { loja, controlador, usar, colocarTerreno } = montar();
    colocarTerreno();
    usar({ tipo: 'revelar' });
    controlador.aoIniciarTraco({ x: 0, y: 0 });
    controlador.aoContinuarTraco(B);
    controlador.aoTerminarTraco();
    expect(revelado(loja, A)).toBe(true);
    expect(revelado(loja, B)).toBe(true);
    loja.desfazer();
    expect(revelado(loja, A)).toBe(false);
    expect(revelado(loja, B)).toBe(false);
  });

  it('ocultar desfaz a revelação', () => {
    const { loja, controlador, usar, colocarTerreno } = montar();
    colocarTerreno();
    loja.despachar({ tipo: 'RevelarHex', coord: A });
    usar({ tipo: 'ocultar' });
    controlador.aoIniciarTraco({ x: 0, y: 0 });
    controlador.aoTerminarTraco();
    expect(revelado(loja, A)).toBe(false);
  });

  it('um clique com a ferramenta não abre o painel', () => {
    const { controlador, usar, aoSelecionarHex } = montar();
    usar({ tipo: 'revelar' });
    controlador.aoClicar(centroB);
    expect(aoSelecionarHex).not.toHaveBeenCalled();
  });
});

describe('aviso ao apagar hexes anotados', () => {
  function comAnotacao() {
    const montado = montar();
    montado.colocarTerreno();
    montado.loja.despachar({ tipo: 'EditarInformacaoHex', coord: A, campos: { nome: 'Vau' } });
    montado.usar({ tipo: 'apagar' });
    return montado;
  }

  it('avisa ao fim do traço, uma única vez', () => {
    const { controlador, aoAvisar } = comAnotacao();
    controlador.aoIniciarTraco({ x: 0, y: 0 });
    expect(aoAvisar).not.toHaveBeenCalled();
    controlador.aoTerminarTraco();
    expect(aoAvisar).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Um hex'));
  });

  it('conta quantos hexes anotados o traço apagou', () => {
    const { loja, controlador, aoAvisar } = comAnotacao();
    loja.despachar({ tipo: 'EditarInformacaoHex', coord: B, campos: { descricao: 'Algo' } });
    controlador.aoIniciarTraco({ x: 0, y: 0 });
    controlador.aoContinuarTraco(B);
    controlador.aoTerminarTraco();
    expect(aoAvisar).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('2 hexes'));
  });

  it('não avisa ao apagar hexes sem anotações', () => {
    const { controlador, aoAvisar } = comAnotacao();
    controlador.aoIniciarTraco(centroB);
    controlador.aoTerminarTraco();
    expect(aoAvisar).not.toHaveBeenCalled();
  });

  it('a contagem recomeça a cada traço', () => {
    const { loja, controlador, aoAvisar } = comAnotacao();
    controlador.aoIniciarTraco({ x: 0, y: 0 });
    controlador.aoTerminarTraco();
    loja.despachar({ tipo: 'EditarInformacaoHex', coord: B, campos: { nome: 'Outro' } });
    controlador.aoIniciarTraco(centroB);
    controlador.aoTerminarTraco();
    expect(aoAvisar).toHaveBeenLastCalledWith(expect.stringContaining('Um hex'));
  });
});

describe('selecionar hex', () => {
  it('sem ferramenta, um clique seleciona o hex do ponto', () => {
    const { controlador, aoSelecionarHex } = montar();
    controlador.aoClicar(centroB);
    expect(aoSelecionarHex).toHaveBeenCalledExactlyOnceWith(B);
  });

  it('com uma ferramenta ativa, o clique não seleciona', () => {
    const { controlador, usar, aoSelecionarHex } = montar();
    usar({ tipo: 'colocar', assetId: 'tile' });
    controlador.aoClicar(centroB);
    usar({ tipo: 'apagar' });
    controlador.aoClicar(centroB);
    expect(aoSelecionarHex).not.toHaveBeenCalled();
  });

  it('clicar em uma decoração seleciona o hex sem movê-la', () => {
    const { loja, cena, controlador, colocarTerreno, decoracoes, aoSelecionarHex } = montar();
    colocarTerreno();
    controlador.colocarAsset('casa', { x: 5, y: 5 });
    cena.decoracaoEm.mockReturnValue({
      decoracaoId: decoracoes()[0].id,
      assetId: 'casa',
      coord: A,
      posicao: { x: 5, y: 5 },
    });
    const antes = loja.obterEstado();
    controlador.aoIniciarTraco({ x: 5, y: 5 });
    controlador.aoTerminarTraco();
    controlador.aoClicar({ x: 5, y: 5 });
    expect(loja.obterEstado()).toBe(antes);
    expect(aoSelecionarHex).toHaveBeenCalledExactlyOnceWith(A);
  });
});

describe('colocar decorações', () => {
  it('uma decoração fica onde foi clicada', () => {
    const { controlador, usar, colocarTerreno, decoracoes } = montar();
    colocarTerreno();
    usar({ tipo: 'colocar', assetId: 'casa' });
    controlador.aoIniciarTraco({ x: 30, y: -20 });
    controlador.aoTerminarTraco();
    expect(decoracoes()).toMatchObject([{ assetId: 'casa', deslocamento: { x: 30, y: -20 } }]);
  });

  it('um rio encaixa no centro do hex', () => {
    const { controlador, usar, colocarTerreno, decoracoes } = montar();
    colocarTerreno();
    usar({ tipo: 'colocar', assetId: 'rio' });
    controlador.aoIniciarTraco({ x: 30, y: -20 });
    controlador.aoTerminarTraco();
    expect(decoracoes()).toMatchObject([{ assetId: 'rio', deslocamento: { x: 0, y: 0 } }]);
  });

  it('não repete o mesmo rio no mesmo hex, mas aceita rios diferentes', () => {
    const { controlador, colocarTerreno, decoracoes } = montar();
    colocarTerreno();
    controlador.colocarAsset('rio', { x: 0, y: 0 });
    controlador.colocarAsset('rio', { x: 10, y: 10 });
    expect(decoracoes()).toHaveLength(1);
  });

  it('cada decoração recebe um id próprio', () => {
    const { controlador, colocarTerreno, decoracoes } = montar();
    colocarTerreno();
    controlador.colocarAsset('casa', { x: 0, y: 0 });
    controlador.colocarAsset('casa', { x: 10, y: 10 });
    const [primeira, segunda] = decoracoes();
    expect(primeira.id).not.toBe(segunda.id);
  });

  it('arrastar com uma decoração selecionada não espalha cópias', () => {
    const { controlador, usar, colocarTerreno, decoracoes } = montar();
    colocarTerreno();
    usar({ tipo: 'colocar', assetId: 'casa' });
    controlador.aoIniciarTraco({ x: 0, y: 0 });
    controlador.aoContinuarTraco(B);
    controlador.aoMoverDuranteTraco(centroB);
    controlador.aoTerminarTraco();
    expect(decoracoes()).toHaveLength(1);
    expect(decoracoes(B)).toHaveLength(0);
  });

  it('não mostra prévia de decoração em hex vazio', () => {
    const { cena, controlador, usar } = montar();
    usar({ tipo: 'colocar', assetId: 'casa' });
    controlador.aoMoverPonteiro({ x: 0, y: 0 });
    expect(cena.mostrarPreviaDecoracao).not.toHaveBeenCalled();
  });
});

describe('pintar tiles', () => {
  it('uma pincelada pinta vários hexes e é desfeita de uma vez', () => {
    const { loja, controlador, usar } = montar();
    usar({ tipo: 'colocar', assetId: 'tile' });
    controlador.aoIniciarTraco({ x: 0, y: 0 });
    controlador.aoContinuarTraco(B);
    controlador.aoTerminarTraco();
    expect(hexEm(loja.obterEstado(), B)).toBeDefined();
    loja.desfazer();
    expect(loja.podeDesfazer()).toBe(false);
  });
});

describe('borracha', () => {
  const casaEm = (x: number) => ({
    decoracaoId: 'd1',
    assetId: 'casa',
    coord: A,
    posicao: { x, y: 0 },
  });

  function comCasa() {
    const montado = montar();
    montado.colocarTerreno();
    montado.controlador.colocarAsset('casa', { x: 5, y: 5 });
    const id = montado.decoracoes()[0].id;
    montado.cena.decoracaoEm.mockReturnValue({ ...casaEm(5), decoracaoId: id });
    montado.usar({ tipo: 'apagar' });
    return montado;
  }

  it('começar sobre uma decoração apaga só ela', () => {
    const { loja, controlador, decoracoes } = comCasa();
    controlador.aoIniciarTraco({ x: 5, y: 5 });
    controlador.aoTerminarTraco();
    expect(decoracoes()).toEqual([]);
    expect(hexEm(loja.obterEstado(), A)).toBeDefined();
  });

  it('um traço que começou em decoração não apaga hexes', () => {
    const { loja, controlador } = comCasa();
    controlador.aoIniciarTraco({ x: 5, y: 5 });
    controlador.aoContinuarTraco(B);
    controlador.aoTerminarTraco();
    expect(hexEm(loja.obterEstado(), B)).toBeDefined();
  });

  it('começar em lugar sem decoração apaga os hexes do traço', () => {
    const { loja, cena, controlador } = comCasa();
    cena.decoracaoEm.mockReturnValue(null);
    controlador.aoIniciarTraco({ x: 5, y: 5 });
    controlador.aoContinuarTraco(B);
    controlador.aoTerminarTraco();
    expect(hexEm(loja.obterEstado(), A)).toBeUndefined();
    expect(hexEm(loja.obterEstado(), B)).toBeUndefined();
  });
});

describe('mover decorações', () => {
  function comCasa() {
    const montado = montar();
    montado.colocarTerreno();
    montado.controlador.colocarAsset('casa', { x: 5, y: 5 });
    const decoracaoId = montado.decoracoes()[0].id;
    montado.cena.decoracaoEm.mockReturnValue({
      decoracaoId,
      assetId: 'casa',
      coord: A,
      posicao: { x: 5, y: 5 },
    });
    return { ...montado, decoracaoId };
  }

  it('leva a decoração para outro hex, mantendo a distância do agarre', () => {
    const { controlador, decoracoes } = comCasa();
    controlador.aoIniciarTraco({ x: 15, y: 5 });
    controlador.aoMoverDuranteTraco({ x: centroB.x + 10, y: centroB.y });
    controlador.aoTerminarTraco();
    expect(decoracoes(A)).toEqual([]);
    expect(decoracoes(B)).toMatchObject([{ deslocamento: { x: 0, y: 0 } }]);
  });

  it('um clique sem arrastar não muda nada', () => {
    const { loja, controlador } = comCasa();
    const antes = loja.obterEstado();
    controlador.aoIniciarTraco({ x: 5, y: 5 });
    controlador.aoTerminarTraco();
    expect(loja.obterEstado()).toBe(antes);
  });

  it('soltar em hex vazio devolve o desenho para o lugar', () => {
    const { cena, controlador, decoracoes } = comCasa();
    controlador.aoIniciarTraco({ x: 5, y: 5 });
    controlador.aoMoverDuranteTraco({ x: 5000, y: 5000 });
    controlador.aoTerminarTraco();
    expect(decoracoes(A)).toHaveLength(1);
    expect(cena.sincronizarDecoracoes).toHaveBeenCalled();
  });
});

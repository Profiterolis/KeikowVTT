import { describe, expect, it, vi } from 'vitest';
import { transferirItem } from './acoesDaFicha';
import { criarLojaCampanha } from './campanha';
import { aplicarAcaoCompendio, criarCompendioVazio, criarLojaCompendio } from './compendio';
import { criarEntrada, type EntradaDe } from './entradas';
import {
  comClasse,
  comCopiaEditada,
  comExtra,
  comItem,
  comItemAvulso,
  comMoeda,
  comNota,
  comPilha,
  criarFicha,
  criarLojaFichas,
  fichaDeMonstro,
  semPilha,
  type EstadoFichas,
  type Ficha,
} from './fichas';
import { criarLojaGrupo } from './grupo';
import { criarLojaMapa } from './loja';
import {
  conferirFichas,
  fichasVisiveis,
  motivoSemEdicao,
  podeAgirNaFicha,
  podeEditarTudo,
  podeReceberPresente,
  podeVerFicha,
} from './permissoes';
import { paraJogadores, VISIVEL_A_TODOS } from './visibilidade';

const corda: EntradaDe<'item'> = { ...criarEntrada('item', 'corda'), nome: 'Corda' };
const guerreiro: EntradaDe<'classe'> = { ...criarEntrada('classe', 'guerreiro'), nome: 'Guerreiro' };
const benção: EntradaDe<'magia'> = { ...criarEntrada('magia', 'bencao'), nome: 'Bênção' };
const compendio = [corda, guerreiro, benção].reduce(
  (estado, entrada) => aplicarAcaoCompendio(estado, { tipo: 'AdicionarEntrada', entrada }),
  criarCompendioVazio(),
);

/** Ana tem uma ficha com duas cordas; Bia tem outra; o mestre tem um goblin. */
function mesa(edicaoLiberada = false): EstadoFichas {
  const ana: Ficha = { ...comItem(criarFicha('personagem', 'fa', 'ana'), compendio, 'corda', 'p1', 2), nome: 'Aria', edicaoLiberada };
  const bia: Ficha = { ...criarFicha('personagem', 'fb', 'bia'), nome: 'Brisa' };
  const goblin = fichaDeMonstro({ ...criarEntrada('monstro', 'goblin'), nome: 'Goblin' }, 'fg');
  return { fichas: { fa: ana, fb: bia, fg: goblin } };
}

const trocar = (estado: EstadoFichas, ...fichas: Ficha[]): EstadoFichas => ({
  fichas: { ...estado.fichas, ...Object.fromEntries(fichas.map((f) => [f.id, f])) },
});

/** Confere a mudança de uma ficha feita pela Ana. */
function anaMuda(mudar: (f: Ficha) => Ficha, edicaoLiberada = false) {
  const antes = mesa(edicaoLiberada);
  return conferirFichas(antes, trocar(antes, mudar(antes.fichas.fa)), 'ana');
}

describe('o que cada um vê nas fichas', () => {
  it('o jogador vê as próprias, as mostradas a ele, e o mestre vê todas', () => {
    const estado = mesa();
    const mostrada = trocar(estado, { ...estado.fichas.fb, visibilidade: paraJogadores(['ana']) });
    expect(fichasVisiveis(estado, 'ana').map((f) => f.id)).toEqual(['fa']);
    expect(fichasVisiveis(mostrada, 'ana').map((f) => f.id)).toEqual(['fa', 'fb']);
    expect(fichasVisiveis(mostrada, 'bia').map((f) => f.id)).toEqual(['fb']);
    expect(fichasVisiveis(estado, 'mestre')).toHaveLength(3);
    expect(podeVerFicha({ ...estado.fichas.fg, visibilidade: VISIVEL_A_TODOS }, 'bia')).toBe(true);
  });

  it('ver não é agir: só o dono e o mestre rolam e usam a ficha', () => {
    const fb = { ...mesa().fichas.fb, visibilidade: VISIVEL_A_TODOS };
    expect(podeAgirNaFicha(fb, 'ana')).toBe(false);
    expect(podeAgirNaFicha(fb, 'bia')).toBe(true);
    expect(motivoSemEdicao(fb, 'ana')).toContain('só pode olhar');
    expect(motivoSemEdicao(fb, 'bia')).toContain('libere a edição');
    expect(motivoSemEdicao(fb, 'mestre')).toBeNull();
    expect(podeEditarTudo({ ...fb, edicaoLiberada: true }, 'bia')).toBe(true);
  });

  it('presentes vão para fichas visíveis e para personagens dos outros jogadores, mas não para os monstros escondidos', () => {
    const { fb, fg } = mesa().fichas;
    expect(podeReceberPresente(fb, 'ana')).toBe(true);
    expect(podeReceberPresente(fg, 'ana')).toBe(false);
  });
});

describe('o dono sem a edição liberada', () => {
  it.each<[string, (f: Ficha) => Ficha]>([
    ['o nome', (f) => ({ ...f, nome: 'Outra' })],
    ['os PV', (f) => ({ ...f, pvAtuais: 3, pvTemporarios: 5 })],
    ['as notas', (f) => comNota(f, { id: 'n', titulo: 'Diário', texto: 'Hoje…' })],
    ['as moedas', (f) => comMoeda(f, 'po', 30)],
    ['equipar', (f) => comPilha(f, 'p1', { equipado: true })],
    ['gastar unidades', (f) => comPilha(f, 'p1', { quantidade: 1 })],
    ['descartar', (f) => semPilha(f, 'p1')],
    ['usos e espaços', (f) => ({ ...f, usosGastos: { furia: 1 }, espacosGastos: [1, 0, 0, 0, 0, 0, 0, 0, 0] })],
    ['o retrato e o token', (f) => ({ ...f, retrato: `img-${'a'.repeat(64)}`, token: `img-${'b'.repeat(64)}` })],
  ])('pode mudar %s', (_nome, mudar) => {
    expect(anaMuda(mudar)).toEqual({ ok: true });
  });

  it.each<[string, (f: Ficha) => Ficha, string]>([
    ['os atributos', (f) => ({ ...f, atributos: { ...f.atributos, for: 18 } }), 'atributos'],
    ['a classe', (f) => comClasse(f, compendio, 'guerreiro'), 'classes'],
    ['as proficiências', (f) => ({ ...f, proficiencias: { atletismo: 1 } }), 'proficiências'],
    ['as magias', (f) => comExtra(f, compendio, 'bencao'), 'habilidades e magias'],
    ['um item do compêndio', (f) => comItem(f, compendio, 'corda', 'p2'), 'itens novos'],
    ['um item avulso', (f) => comItemAvulso(f, 'x', 'p2', 'Ouro'), 'itens novos'],
    ['mais unidades', (f) => comPilha(f, 'p1', { quantidade: 5 }), 'itens novos'],
    ['a cópia de um item', (f) => comCopiaEditada(f, { ...corda, nome: 'Corda mágica' }), 'cópias'],
    ['o dono', (f) => ({ ...f, donoId: 'bia' }), 'quem controla'],
    ['quem vê', (f) => ({ ...f, visibilidade: VISIVEL_A_TODOS }), 'quem vê'],
  ])('não pode mudar %s', (_nome, mudar, trecho) => {
    expect(anaMuda(mudar)).toMatchObject({ ok: false, motivo: expect.stringContaining(trecho) });
  });
});

describe('imagens da ficha de outro jogador', () => {
  it('quem não é o dono não troca o retrato, mesmo vendo a ficha', () => {
    const antes = mesa();
    const fb = { ...antes.fichas.fb, visibilidade: VISIVEL_A_TODOS };
    const visivel = trocar(antes, fb);
    expect(conferirFichas(visivel, trocar(visivel, { ...fb, retrato: `img-${'c'.repeat(64)}` }), 'ana')).toMatchObject({ ok: false });
  });
});

describe('o dono com a edição liberada', () => {
  it('muda atributos, classes e itens, mas não quem vê nem a liberação', () => {
    expect(anaMuda((f) => ({ ...f, atributos: { ...f.atributos, for: 18 } }), true).ok).toBe(true);
    expect(anaMuda((f) => comItem(comClasse(f, compendio, 'guerreiro'), compendio, 'corda', 'p2'), true).ok).toBe(true);
    expect(anaMuda((f) => ({ ...f, visibilidade: VISIVEL_A_TODOS }), true).ok).toBe(false);
    expect(anaMuda((f) => ({ ...f, edicaoLiberada: false }), true).ok).toBe(false);
  });
});

describe('fichas dos outros', () => {
  it('nem olhando o jogador muda a ficha de outro', () => {
    const antes = mesa();
    const depois = trocar(antes, { ...antes.fichas.fb, nome: 'Pirata' });
    expect(conferirFichas(antes, depois, 'ana')).toMatchObject({ ok: false, motivo: expect.stringContaining('outro participante') });
    expect(conferirFichas(antes, depois, 'mestre').ok).toBe(true);
  });

  it('presentear passa o item da ficha do jogador para a de outro', () => {
    const antes = mesa();
    const [origem, destino] = transferirItem(antes.fichas.fa, antes.fichas.fb, 'p1', 1)!;
    expect(conferirFichas(antes, trocar(antes, origem, destino), 'ana')).toEqual({ ok: true });
    // Dar de novo a mesma corda junta na mesma pilha de quem recebe.
    const meio = trocar(antes, origem, destino);
    const [o2, d2] = transferirItem(meio.fichas.fa, meio.fichas.fb, 'p1', 1)!;
    expect(conferirFichas(meio, trocar(meio, o2, d2), 'ana')).toEqual({ ok: true });
  });

  it('não dá para tirar itens de outro, nem dar o que não saiu de uma ficha sua', () => {
    const comCorda = trocar(mesa(), comItem(mesa().fichas.fb, compendio, 'corda', 'pb', 3));
    const [deBia, paraAna] = transferirItem(comCorda.fichas.fb, comCorda.fichas.fa, 'pb', 3)!;
    expect(conferirFichas(comCorda, trocar(comCorda, deBia, paraAna), 'ana').ok).toBe(false);
    const doNada = trocar(mesa(), comItem(mesa().fichas.fb, compendio, 'corda', 'px'));
    expect(conferirFichas(mesa(), doNada, 'ana')).toMatchObject({ ok: false, motivo: expect.stringContaining('itens novos') });
  });

  it('não dá para receber mais unidades do que saíram', () => {
    const antes = mesa();
    const [origem, destino] = transferirItem(antes.fichas.fa, antes.fichas.fb, 'p1', 1)!;
    const inflado = comPilha(destino, destino.itens[0].id, { quantidade: 2 });
    expect(conferirFichas(antes, trocar(antes, origem, inflado), 'ana').ok).toBe(false);
  });

  it('só o mestre apaga fichas prontas', () => {
    const antes = mesa();
    const sem = { fichas: { fa: antes.fichas.fa, fb: antes.fichas.fb } };
    expect(conferirFichas(antes, sem, 'ana')).toMatchObject({ ok: false, motivo: expect.stringContaining('apaga fichas') });
    expect(conferirFichas(antes, sem, 'mestre').ok).toBe(true);
  });
});

describe('as lojas conferem quem age', () => {
  it('o jogador não muda o mapa, o grupo, o compêndio nem a campanha', () => {
    const aoRecusar = vi.fn();
    const opcoes = { obterAutorId: () => 'ana', aoRecusar };
    const mapa = criarLojaMapa(undefined, opcoes);
    mapa.despachar({ tipo: 'ColocarTile', coord: { q: 0, r: 0 }, terreno: 'hexPlains00' });
    expect(Object.keys(mapa.obterEstado().hexes)).toHaveLength(0);
    const grupo = criarLojaGrupo(undefined, opcoes);
    grupo.despachar({ tipo: 'PosicionarGrupo', coord: { q: 1, r: 1 } });
    expect(grupo.obterEstado().posicao).toBeNull();
    const loja = criarLojaCompendio(undefined, opcoes);
    loja.despachar({ tipo: 'AdicionarEntrada', entrada: corda });
    expect(loja.obterEstado().entradas).toEqual({});
    const campanha = criarLojaCampanha(undefined, opcoes);
    campanha.despachar({ tipo: 'RenomearCampanha', nome: 'Minha' });
    expect(campanha.obterEstado().nome).toBe('Minha campanha');
    expect(aoRecusar).toHaveBeenCalledTimes(4);
    expect(aoRecusar).toHaveBeenCalledWith('Só o mestre muda o mapa.');
  });

  it('o jogador não desfaz o que o mestre fez, mas desfaz o que ele mesmo fez', () => {
    let autor = 'mestre';
    const aoRecusar = vi.fn();
    const loja = criarLojaFichas(mesa(), { obterAutorId: () => autor, aoRecusar });
    loja.despachar({ tipo: 'EditarFicha', ficha: { ...loja.obterEstado().fichas.fa, atributos: { ...criarFicha('npc', 'x').atributos, for: 20 } } });
    autor = 'ana';
    expect(loja.podeDesfazer()).toBe(false);
    loja.desfazer();
    expect(loja.obterEstado().fichas.fa.atributos.for).toBe(20);
    expect(aoRecusar).toHaveBeenCalledOnce();

    loja.despachar({ tipo: 'EditarFicha', ficha: { ...loja.obterEstado().fichas.fa, nome: 'Aria, a Ousada' } });
    expect(loja.obterEstado().fichas.fa.nome).toBe('Aria, a Ousada');
    expect(loja.podeDesfazer()).toBe(true);
    loja.desfazer();
    expect(loja.obterEstado().fichas.fa.nome).toBe('Aria');
    // Voltando a ser o mestre, o desfazer segue de onde parou.
    autor = 'mestre';
    loja.desfazer();
    expect(loja.obterEstado().fichas.fa.atributos.for).toBe(10);
  });
});

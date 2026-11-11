import { describe, expect, it } from 'vitest';
import { aplicarAcaoCompendio, criarCompendioVazio } from './compendio';
import {
  escolhasDaFicha,
  escolhasIniciais,
  fichaDaCriacao,
  novaFichaEmCriacao,
  pendenciasDaCriacao,
  type EscolhasDeCriacao,
} from './criacaoDePersonagem';
import { criarEntrada, type Entrada, type EntradaDe } from './entradas';
import { comPilha, criarFicha, type EstadoFichas, type Ficha } from './fichas';
import {
  conteudoDoKit,
  entregarKit,
  kitsDaClasse,
  kitsExtras,
  problemaNosItensDaCriacao,
  textoDasMoedas,
  type Kit,
} from './kits';
import { conferirFichas } from './permissoes';
import { REGRAS_PADRAO } from './regrasPadrao';

const R = REGRAS_PADRAO;

const item = (id: string, nome: string) => ({ ...criarEntrada('item', id), nome });
const kit = (id: string, nome: string, dados: Partial<Kit['dados']>): Kit => ({
  ...criarEntrada('kit', id),
  nome,
  dados: { ...criarEntrada('kit', 'x').dados, ...dados },
});
const classe = (id: string, nome: string): EntradaDe<'classe'> => ({ ...criarEntrada('classe', id), nome });
const acolito: EntradaDe<'antecedente'> = {
  ...criarEntrada('antecedente', 'acolito'),
  nome: 'Acólito',
  dados: { proficiencias: ['Skill: Insight', 'Skill: Religion'], habilidades: [] },
};

const kitDoGuerreiro = kit('kit-guerreiro', 'Guerreiro: aventureiro', {
  itens: [
    { entradaId: 'espada', quantidade: 1 },
    { entradaId: 'tocha', quantidade: 10 },
  ],
  moedas: { pc: 0, pp: 5, pe: 0, po: 10, pl: 0 },
  classes: ['guerreiro'],
});
const outroDoGuerreiro = kit('kit-guerreiro-b', 'Guerreiro: arqueiro', { itens: [{ entradaId: 'arco', quantidade: 1 }], classes: ['guerreiro'] });
const kitDoMago = kit('kit-mago', 'Mago: estudioso', { itens: [{ entradaId: 'livro', quantidade: 1 }], classes: ['mago'] });
const kitDoTemplo = kit('kit-templo', 'Kit do templo', { itens: [{ entradaId: 'incenso', quantidade: 2 }], extraPorAntecedente: ['acolito'] });
const kitDoCurandeiro = kit('kit-curandeiro', 'Kit do curandeiro', {
  itens: [{ entradaId: 'bandagem', quantidade: 3 }],
  extraPorPericia: ['medicina'],
});

const compendio = (
  [
    item('espada', 'Espada'),
    item('tocha', 'Tocha'),
    item('arco', 'Arco'),
    item('livro', 'Livro'),
    item('incenso', 'Incenso'),
    item('bandagem', 'Bandagem'),
    classe('guerreiro', 'Guerreiro'),
    classe('mago', 'Mago'),
    acolito,
    kitDoGuerreiro,
    outroDoGuerreiro,
    kitDoMago,
    kitDoTemplo,
    kitDoCurandeiro,
  ] as Entrada[]
).reduce((c, entrada) => aplicarAcaoCompendio(c, { tipo: 'AdicionarEntrada', entrada }), criarCompendioVazio());

let n = 0;
const criarId = () => `id${++n}`;
const unidades = (ficha: Ficha) =>
  Object.fromEntries(ficha.itens.map((p) => [p.entradaId, p.quantidade]));

describe('entregar um kit', () => {
  it('cada item vira uma pilha separada e as moedas se somam', () => {
    const ficha = { ...criarFicha('personagem', 'f'), moedas: { pc: 0, pp: 0, pe: 0, po: 3, pl: 0 } };
    const { ficha: depois, faltando } = entregarKit(ficha, kitDoGuerreiro, compendio, criarId);
    expect(unidades(depois)).toEqual({ espada: 1, tocha: 10 });
    expect(depois.entradas.espada.nome).toBe('Espada');
    expect(depois.moedas).toMatchObject({ po: 13, pp: 5 });
    expect(faltando).toEqual([]);
  });

  it('itens iguais se juntam a uma pilha não equipada; a equipada fica como está', () => {
    const uma = entregarKit(criarFicha('personagem', 'f'), kitDoGuerreiro, compendio, criarId).ficha;
    const duas = entregarKit(uma, kitDoGuerreiro, compendio, criarId).ficha;
    expect(duas.itens).toHaveLength(2);
    expect(unidades(duas)).toEqual({ espada: 2, tocha: 20 });
    const espadaEquipada = comPilha(uma, uma.itens[0].id, { equipado: true });
    const tres = entregarKit(espadaEquipada, kitDoGuerreiro, compendio, criarId).ficha;
    expect(tres.itens.filter((p) => p.entradaId === 'espada').map((p) => [p.quantidade, p.equipado])).toEqual([
      [1, true],
      [1, false],
    ]);
  });

  it('uma cópia editada só na ficha não é misturada: o item entra com outro id', () => {
    const uma = entregarKit(criarFicha('personagem', 'f'), kitDoGuerreiro, compendio, criarId).ficha;
    const editada = { ...uma, entradas: { ...uma.entradas, espada: { ...uma.entradas.espada, nome: 'Espada da família' } } };
    const depois = entregarKit(editada, kitDoGuerreiro, compendio, criarId).ficha;
    expect(depois.itens.filter((p) => p.entradaId.startsWith('espada'))).toHaveLength(2);
    expect(depois.entradas.espada.nome).toBe('Espada da família');
  });

  it('itens apagados do compêndio ficam de fora e são avisados', () => {
    const quebrado = kit('k', 'Velho', { itens: [{ entradaId: 'sumiu', quantidade: 1 }, { entradaId: 'tocha', quantidade: 1 }] });
    const { ficha, faltando } = entregarKit(criarFicha('personagem', 'f'), quebrado, compendio, criarId);
    expect(unidades(ficha)).toEqual({ tocha: 1 });
    expect(faltando).toEqual(['sumiu']);
    expect(conteudoDoKit(quebrado, compendio)[0]).toMatchObject({ existe: false, nome: '(item apagado do compêndio)' });
  });

  it('as moedas aparecem da maior para a menor', () => {
    expect(textoDasMoedas(kitDoGuerreiro)).toBe('10 po, 5 pp');
    expect(textoDasMoedas(outroDoGuerreiro)).toBe('');
  });
});

describe('kits na criação', () => {
  const escolhas = (mudancas: Partial<EscolhasDeCriacao> = {}): EscolhasDeCriacao => ({
    ...escolhasIniciais(R.criacao),
    nome: 'Brunhilde',
    classeId: 'guerreiro',
    ...mudancas,
  });
  const montar = (mudancas: Partial<EscolhasDeCriacao> = {}) =>
    fichaDaCriacao(novaFichaEmCriacao('f', 'j-ana', R.criacao), escolhas(mudancas), compendio, criarId, R);

  it('cada classe oferece os próprios kits, por nome; sem classe, nenhum', () => {
    expect(kitsDaClasse(compendio, 'guerreiro').map((k) => k.id)).toEqual(['kit-guerreiro-b', 'kit-guerreiro']);
    expect(kitsDaClasse(compendio, null)).toEqual([]);
  });

  it('o kit escolhido entra na ficha e fica no rascunho para o assistente reabrir', () => {
    const ficha = montar({ kitId: 'kit-guerreiro' });
    expect(unidades(ficha)).toEqual({ espada: 1, tocha: 10 });
    expect(ficha.moedas.po).toBe(10);
    expect(escolhasDaFicha(ficha, R)).toMatchObject({ kitId: 'kit-guerreiro', itens: [] });
    // Remontar não dobra itens nem moedas.
    const de_novo = fichaDaCriacao(ficha, escolhasDaFicha(ficha, R), compendio, criarId, R);
    expect(unidades(de_novo)).toEqual({ espada: 1, tocha: 10 });
    expect(de_novo.moedas.po).toBe(10);
  });

  it('com kits para a classe, escolher um é pendência; sem kits, não trava', () => {
    const KIT = 'Escolha um kit de equipamento.';
    expect(pendenciasDaCriacao(escolhas(), compendio, R)).toContain(KIT);
    expect(pendenciasDaCriacao(escolhas({ kitId: 'kit-guerreiro' }), compendio, R)).not.toContain(KIT);
    const semKits = aplicarAcaoCompendio(compendio, { tipo: 'AdicionarEntrada', entrada: classe('bardo', 'Bardo') });
    expect(pendenciasDaCriacao(escolhas({ classeId: 'bardo' }), semKits, R)).not.toContain(KIT);
  });

  it('o kit de outra classe não vale', () => {
    expect(montar({ classeId: 'mago', kitId: 'kit-guerreiro' }).itens).toEqual([]);
  });

  it('antecedente e perícias dão kits a mais, sem escolha', () => {
    const comAcolito = montar({ antecedenteId: 'acolito', kitId: 'kit-guerreiro' });
    expect(unidades(comAcolito)).toEqual({ espada: 1, tocha: 10, incenso: 2 });
    const medico = montar({ pericias: ['medicina'] });
    expect(unidades(medico)).toEqual({ bandagem: 3 });
    expect(kitsExtras(compendio, 'acolito', ['medicina'], R).map((e) => e.motivo)).toEqual([
      'pela perícia Medicina',
      'pelo antecedente Acólito',
    ]);
  });

  it('o jogador só fica com os itens dos kits oferecidos', () => {
    const ficha = montar({ kitId: 'kit-guerreiro' });
    expect(problemaNosItensDaCriacao(ficha, compendio, R)).toBeNull();
    const comLivre = montar({ kitId: 'kit-guerreiro', itens: [{ entradaId: 'livro', quantidade: 1 }] });
    expect(problemaNosItensDaCriacao(comLivre, compendio, R)).toContain('só pelos kits');
    const maisTochas = comPilha(ficha, ficha.itens[1].id, { quantidade: 50 });
    expect(problemaNosItensDaCriacao(maisTochas, compendio, R)).toContain('só fica com os itens');
    const kitErrado = { ...ficha, rascunho: { ...ficha.rascunho!, kitId: 'kit-mago' } };
    expect(problemaNosItensDaCriacao(kitErrado, compendio, R)).toContain('não é uma opção');
  });

  it('a loja das fichas recusa itens fora dos kits para o jogador; o mestre pode', () => {
    const nova = novaFichaEmCriacao('f', 'j-ana', R.criacao);
    const antes: EstadoFichas = { fichas: { f: nova } };
    const opcoes = { itensDaCriacao: (f: Ficha) => problemaNosItensDaCriacao(f, compendio, R) };
    const comKit = { fichas: { f: fichaDaCriacao(nova, escolhas({ kitId: 'kit-guerreiro' }), compendio, criarId, R) } };
    expect(conferirFichas(antes, comKit, 'j-ana', opcoes)).toEqual({ ok: true });
    const livre = { fichas: { f: fichaDaCriacao(nova, escolhas({ itens: [{ entradaId: 'arco', quantidade: 1 }] }), compendio, criarId, R) } };
    expect(conferirFichas(antes, livre, 'j-ana', opcoes)).toMatchObject({ ok: false });
    expect(conferirFichas(antes, livre, 'mestre', opcoes)).toEqual({ ok: true });
  });
});

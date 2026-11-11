import { describe, expect, it } from 'vitest';
import { calcularFicha } from './calculoDaFicha';
import { aplicarAcaoCompendio, criarCompendioVazio } from './compendio';
import {
  classeDaSubida,
  concluirCriacao,
  aumentoNaCompra,
  custoDosPontos,
  escolhasDaFicha,
  escolhasIniciais,
  fichaComNivel,
  fichaDaCriacao,
  guiaDeMagias,
  habilidadesDoNivel,
  magiasDaClasse,
  novaFichaEmCriacao,
  pendenciasDaCriacao,
  pendenciasDaSubida,
  periciasParaEscolher,
  problemaNosAtributos,
  rolarAtributos,
  type EscolhasDeCriacao,
} from './criacaoDePersonagem';
import { criarEntrada, type Entrada, type EntradaDe } from './entradas';
import { criarFicha, nivelTotal, pvPorNivel, type Ficha } from './fichas';
import { conferirFichas } from './permissoes';
import { REGRAS_PADRAO } from './regrasPadrao';

const R = REGRAS_PADRAO;
const vinte = (valor: string) => Array<string>(20).fill(valor);

const anao: EntradaDe<'especie'> = {
  ...criarEntrada('especie', 'anao'),
  nome: 'Anão',
  dados: { ...criarEntrada('especie', 'x').dados, deslocamento: 7.5, aumentosAtributo: { con: 2 } },
};
const acolito: EntradaDe<'antecedente'> = {
  ...criarEntrada('antecedente', 'acolito'),
  nome: 'Acólito',
  dados: { proficiencias: ['Skill: Insight', 'Skill: Religion'], habilidades: [] },
};
const segundoFolego = { ...criarEntrada('habilidade', 'folego'), nome: 'Segundo Fôlego' };
const surto = { ...criarEntrada('habilidade', 'surto'), nome: 'Surto de Ação' };
const guerreiro: EntradaDe<'classe'> = {
  ...criarEntrada('classe', 'guerreiro'),
  nome: 'Guerreiro',
  dados: {
    ...criarEntrada('classe', 'x').dados,
    dadoVida: 10,
    salvaguardas: ['for', 'con'],
    escolhaPericias: { quantidade: 2, opcoes: ['Skill: Athletics', 'Skill: Acrobatics', 'Skill: Insight', 'Skill: History'] },
    niveisDeAumento: [4, 6, 8, 12, 14, 16, 19],
    habilidades: [
      { nivel: 1, entradaId: 'folego' },
      { nivel: 2, entradaId: 'surto' },
    ],
  },
};
const mago: EntradaDe<'classe'> = {
  ...criarEntrada('classe', 'mago'),
  nome: 'Mago',
  dados: {
    ...criarEntrada('classe', 'x').dados,
    dadoVida: 6,
    atributoConjuracao: 'int',
    tabela: [
      { id: 'truques', nome: 'Truques', valores: vinte('3') },
      { id: 'espacos_1', nome: 'Espaços de 1º', valores: vinte('2') },
      { id: 'espacos_2', nome: 'Espaços de 2º', valores: ['', '', ...vinte('2').slice(2)] },
    ],
  },
};
const magia = (id: string, nivel: number, classes = ['mago']): EntradaDe<'magia'> => ({
  ...criarEntrada('magia', id),
  nome: id,
  dados: { ...criarEntrada('magia', 'x').dados, nivel, classes },
});
const robusto = { ...criarEntrada('talento', 'robusto'), nome: 'Robusto' };
const corda = { ...criarEntrada('item', 'corda'), nome: 'Corda' };

const compendio = ([anao, acolito, segundoFolego, surto, guerreiro, mago, magia('luz', 0), magia('escudo', 1), magia('teia', 2), magia('cura', 1, ['clerigo']), robusto, corda] as Entrada[]).reduce(
  (c, entrada) => aplicarAcaoCompendio(c, { tipo: 'AdicionarEntrada', entrada }),
  criarCompendioVazio(),
);

let n = 0;
const criarId = () => `id${++n}`;

const escolhasDoGuerreiro = (mudancas: Partial<EscolhasDeCriacao> = {}): EscolhasDeCriacao => ({
  ...escolhasIniciais(R.criacao),
  nome: 'Brunhilde',
  especieId: 'anao',
  classeId: 'guerreiro',
  antecedenteId: 'acolito',
  metodo: 'padrao',
  atributos: { for: 15, des: 13, con: 14, int: 8, sab: 12, car: 10 },
  pericias: ['atletismo', 'historia'],
  itens: [{ entradaId: 'corda', quantidade: 2 }],
  ...mudancas,
});

describe('atributos', () => {
  const tudo = (v: number) => ({ for: v, des: v, con: v, int: v, sab: v, car: v });

  it('a compra de pontos usa os custos das regras', () => {
    expect(custoDosPontos(R.criacao, tudo(8))).toEqual({ ok: true, gastos: 0 });
    expect(custoDosPontos(R.criacao, { ...tudo(8), for: 15, des: 15, con: 15 })).toEqual({ ok: true, gastos: 27 });
    expect(custoDosPontos(R.criacao, { ...tudo(8), for: 16 })).toMatchObject({ ok: false, erro: expect.stringContaining('de 8 a 15') });
  });

  it('o "+" da compra só sobe com pontos sobrando para a diferença de custo', () => {
    expect(aumentoNaCompra(R.criacao, tudo(8), 'for')).toEqual({ ok: true, proximo: 9 });
    // 15, 15, 14 e 9 gastam 26: sobra 1, que paga um 9, mas não o 14 → 15 (2 pontos).
    const quase = { ...tudo(8), for: 15, des: 15, con: 14, int: 9 };
    expect(aumentoNaCompra(R.criacao, quase, 'sab')).toEqual({ ok: true, proximo: 9 });
    expect(aumentoNaCompra(R.criacao, quase, 'con')).toEqual({ ok: false, motivo: 'Subir para 15 custa 2 pontos, e sobra 1.' });
    const cheio = { ...tudo(8), for: 15, des: 15, con: 15 };
    expect(aumentoNaCompra(R.criacao, cheio, 'int')).toEqual({ ok: false, motivo: 'Subir para 9 custa 1 ponto, e sobram 0.' });
    expect(aumentoNaCompra(R.criacao, { ...tudo(8), for: 15 }, 'for')).toEqual({ ok: false, motivo: 'Na compra de pontos, o máximo é 15.' });
  });

  it('confere cada método', () => {
    const custo27 = { ...tudo(8), for: 15, des: 15, con: 15 };
    expect(problemaNosAtributos(R.criacao, 'pontos', custo27, null)).toBeNull();
    expect(problemaNosAtributos(R.criacao, 'pontos', { ...custo27, int: 9 }, null)).toContain('28 pontos');
    expect(problemaNosAtributos(R.criacao, 'padrao', { for: 8, des: 15, con: 14, int: 13, sab: 12, car: 10 }, null)).toBeNull();
    expect(problemaNosAtributos(R.criacao, 'padrao', tudo(12), null)).toContain('15, 14, 13, 12, 10, 8');
    expect(problemaNosAtributos(R.criacao, 'rolagem', tudo(12), null)).toContain('Role');
    expect(problemaNosAtributos(R.criacao, 'rolagem', { ...tudo(12), for: 17 }, [12, 12, 17, 12, 12, 12])).toBeNull();
    const soPontos = { ...R.criacao, metodos: ['pontos'] as const };
    expect(problemaNosAtributos(soPontos, 'rolagem', tudo(12), [12, 12, 12, 12, 12, 12])).toContain('não vale');
  });

  it('a rolagem dá seis valores de 3 a 18, prontos para o registro', () => {
    const rolagens = rolarAtributos(R.criacao, () => 0.99);
    expect(rolagens).toHaveLength(6);
    expect(rolagens.map((r) => r.rolagem.total)).toEqual([18, 18, 18, 18, 18, 18]);
    expect(rolagens[0]).toMatchObject({ rotulo: 'Atributo nº 1', formula: '4d6kh3' });
    expect(rolarAtributos(R.criacao, () => 0).map((r) => r.rolagem.total)).toEqual([3, 3, 3, 3, 3, 3]);
  });
});

describe('criação', () => {
  it('as perícias da classe saem das regras, sem as que o antecedente já dá', () => {
    const { quantidade, opcoes } = periciasParaEscolher(guerreiro, acolito, R);
    expect(quantidade).toBe(2);
    expect(opcoes.map((o) => o.id)).toEqual(['atletismo', 'acrobacia', 'historia']);
    expect(periciasParaEscolher(mago, null, R)).toEqual({ quantidade: 0, opcoes: [] });
  });

  it('monta a ficha: espécie, classe, antecedente, atributos, perícias e itens, e a ficha calcula o resto', () => {
    const ficha = fichaDaCriacao(criarFicha('personagem', 'f', 'ana'), escolhasDoGuerreiro(), compendio, criarId, R);
    expect(ficha).toMatchObject({ nome: 'Brunhilde', especieId: 'anao', antecedenteId: 'acolito', classes: [{ entradaId: 'guerreiro', nivel: 1 }] });
    expect(ficha.proficiencias).toEqual({ atletismo: 1, historia: 1 });
    expect(ficha.itens).toMatchObject([{ entradaId: 'corda', quantidade: 2 }]);
    const calculo = calcularFicha(ficha, R);
    // CON 14 + 2 do anão = 16: PV = 10 + 3.
    expect(calculo.valor('pv_maximos')).toMatchObject({ ok: true, valor: 13 });
    expect(calculo.valor('atletismo')).toMatchObject({ ok: true, valor: 4 });
    expect(calculo.valor('intuicao')).toMatchObject({ ok: true, valor: 3 });
  });

  it('trocar de classe não deixa sobras da anterior', () => {
    const base = criarFicha('personagem', 'f', 'ana');
    const comGuerreiro = fichaDaCriacao(base, escolhasDoGuerreiro(), compendio, criarId, R);
    const comMago = fichaDaCriacao(comGuerreiro, escolhasDoGuerreiro({ classeId: 'mago', pericias: [] }), compendio, criarId, R);
    expect(Object.keys(comMago.entradas)).not.toContain('guerreiro');
    expect(Object.keys(comMago.entradas)).not.toContain('folego');
  });

  it('a ficha guarda as escolhas: o assistente reabre de onde parou, com os valores rolados', () => {
    const nova = novaFichaEmCriacao('f', 'ana', R.criacao);
    expect(nova).toMatchObject({ donoId: 'ana', emCriacao: true, rascunho: { metodo: 'pontos', rolados: null } });
    expect(Object.values(nova.atributos)).toEqual([8, 8, 8, 8, 8, 8]);
    const escolhas = escolhasDoGuerreiro({
      classeId: 'mago',
      pericias: [],
      metodo: 'rolagem',
      rolados: [15, 14, 13, 12, 10, 8],
      magias: ['escudo'],
    });
    const ficha = fichaDaCriacao(nova, escolhas, compendio, criarId, R);
    expect(escolhasDaFicha(ficha, R)).toEqual(escolhas);
    expect(concluirCriacao(ficha)).toMatchObject({ emCriacao: false, rascunho: null });
  });

  it('diz o que falta, na ordem dos passos', () => {
    expect(pendenciasDaCriacao(escolhasDoGuerreiro(), compendio, R)).toEqual([]);
    expect(pendenciasDaCriacao(escolhasIniciais(R.criacao), compendio, R)).toEqual([
      'Dê um nome ao personagem.',
      'Escolha uma espécie.',
      'Escolha uma classe.',
    ]);
    expect(pendenciasDaCriacao(escolhasDoGuerreiro({ pericias: ['atletismo'] }), compendio, R)).toEqual(['Escolha 2 perícias da classe.']);
    expect(pendenciasDaCriacao(escolhasDoGuerreiro({ pericias: ['atletismo', 'intuicao'] }), compendio, R)).toEqual([
      'Há perícias escolhidas que esta classe não oferece.',
    ]);
  });
});

describe('magias', () => {
  it('lista as magias da classe até o nível dos espaços, e dá o guia da tabela', () => {
    const ficha = fichaDaCriacao(criarFicha('personagem', 'f'), escolhasDoGuerreiro({ classeId: 'mago', pericias: [] }), compendio, criarId, R);
    const calculo = calcularFicha(ficha, R);
    expect(magiasDaClasse(ficha, 'mago', compendio, calculo).map((m) => m.id)).toEqual(['luz', 'escudo']);
    expect(guiaDeMagias(ficha, 'mago', calculo)).toEqual({ truques: 3, magiasConhecidas: null });
    expect(magiasDaClasse(ficha, 'guerreiro', compendio, calculo)).toEqual([]);
  });
});

describe('subida de nível', () => {
  const pronta = (): Ficha => ({
    ...fichaDaCriacao(criarFicha('personagem', 'f', 'ana'), escolhasDoGuerreiro(), compendio, criarId, R),
    niveisLiberados: 1,
  });

  it('sobe a mesma classe, com as habilidades do nível e os PV pela média ou rolados', () => {
    const ficha = pronta();
    const subida = classeDaSubida(ficha, 'guerreiro', compendio)!;
    expect(subida.novoNivel).toBe(2);
    expect(habilidadesDoNivel(subida.entrada, 2, compendio, ficha).map((h) => h.nome)).toEqual(['Surto de Ação']);
    const media = fichaComNivel(ficha, { classeId: 'guerreiro', pvRolado: null, aumento: null, magias: [] }, compendio);
    expect(media.classes).toEqual([{ entradaId: 'guerreiro', nivel: 2 }]);
    expect(pvPorNivel(media).map((p) => p.valor)).toEqual([10, 6]);
    expect(media.niveisLiberados).toBe(0);
    const rolado = fichaComNivel(ficha, { classeId: 'guerreiro', pvRolado: 9, aumento: null, magias: [] }, compendio);
    expect(pvPorNivel(rolado).map((p) => p.valor)).toEqual([10, 9]);
  });

  it('na multiclasse, o PV rolado fica no lugar certo entre os níveis', () => {
    const doisNiveis = fichaComNivel(pronta(), { classeId: 'guerreiro', pvRolado: 7, aumento: null, magias: [] }, compendio);
    const comMago = fichaComNivel({ ...doisNiveis, niveisLiberados: 1 }, { classeId: 'mago', pvRolado: 2, aumento: null, magias: ['escudo'] }, compendio);
    const deNovo = fichaComNivel({ ...comMago, niveisLiberados: 1 }, { classeId: 'guerreiro', pvRolado: 8, aumento: null, magias: [] }, compendio);
    expect(deNovo.classes).toEqual([{ entradaId: 'guerreiro', nivel: 3 }, { entradaId: 'mago', nivel: 1 }]);
    expect(pvPorNivel(deNovo).map((p) => [p.dado, p.valor])).toEqual([[10, 10], [10, 7], [10, 8], [6, 2]]);
    expect(deNovo.extras).toContain('escudo');
  });

  it('nos níveis de aumento, pede +2 em um, +1 em dois ou um talento, sem passar do máximo', () => {
    const nivel3: Ficha = { ...pronta(), classes: [{ entradaId: 'guerreiro', nivel: 3 }] };
    const base = { classeId: 'guerreiro', pvRolado: null, magias: [] };
    expect(pendenciasDaSubida(nivel3, { ...base, aumento: null }, compendio, R)).toEqual(['Escolha o aumento de atributo ou um talento.']);
    expect(pendenciasDaSubida(nivel3, { ...base, aumento: { tipo: 'atributos', aumentos: { for: 1, des: 1 } } }, compendio, R)).toEqual([]);
    expect(pendenciasDaSubida(nivel3, { ...base, aumento: { tipo: 'atributos', aumentos: { for: 3 } } }, compendio, R)).toEqual([
      'Some +2 a um atributo ou +1 a dois atributos.',
    ]);
    const forte: Ficha = { ...nivel3, atributos: { ...nivel3.atributos, for: 19 } };
    expect(pendenciasDaSubida(forte, { ...base, aumento: { tipo: 'atributos', aumentos: { for: 2 } } }, compendio, R)).toEqual([
      'Força passaria de 20.',
    ]);
    expect(pendenciasDaSubida(nivel3, { ...base, aumento: { tipo: 'talento', entradaId: 'robusto' } }, compendio, R)).toEqual([]);
    const comTalento = fichaComNivel(nivel3, { ...base, aumento: { tipo: 'talento', entradaId: 'robusto' } }, compendio);
    expect(comTalento.extras).toContain('robusto');
    const maisForte = fichaComNivel(nivel3, { ...base, aumento: { tipo: 'atributos', aumentos: { for: 2 } } }, compendio);
    expect(maisForte.atributos.for).toBe(17);
    expect(pendenciasDaSubida(pronta(), { ...base, aumento: { tipo: 'talento', entradaId: 'robusto' } }, compendio, R)).toEqual([
      'Este nível não dá aumento de atributo.',
    ]);
  });

  it('recusa PV rolados fora do dado e subir além do nível 20', () => {
    expect(pendenciasDaSubida(pronta(), { classeId: 'guerreiro', pvRolado: 11, aumento: null, magias: [] }, compendio, R)).toEqual([
      'Os PV rolados vão de 1 a 10.',
    ]);
    const vinteNiveis: Ficha = { ...pronta(), classes: [{ entradaId: 'guerreiro', nivel: 20 }] };
    expect(nivelTotal(vinteNiveis)).toBe(20);
    expect(pendenciasDaSubida(vinteNiveis, { classeId: 'guerreiro', pvRolado: null, aumento: null, magias: [] }, compendio, R)).toEqual([
      'A ficha já está no nível 20.',
    ]);
  });
});

describe('permissões da criação e da subida', () => {
  const vazio = { fichas: {} };
  const nova = (mudancas: Partial<Ficha> = {}): Ficha => ({ ...criarFicha('personagem', 'f', 'ana'), emCriacao: true, ...mudancas });

  it('o jogador cria o próprio personagem em criação, se as regras deixam', () => {
    expect(conferirFichas(vazio, { fichas: { f: nova() } }, 'ana')).toEqual({ ok: true });
    expect(conferirFichas(vazio, { fichas: { f: nova() } }, 'ana', { jogadoresCriam: false })).toMatchObject({ ok: false });
    expect(conferirFichas(vazio, { fichas: { f: nova({ donoId: 'bia' }) } }, 'ana').ok).toBe(false);
    expect(conferirFichas(vazio, { fichas: { f: nova({ emCriacao: false }) } }, 'ana').ok).toBe(false);
    expect(conferirFichas(vazio, { fichas: { f: nova({ edicaoLiberada: true }) } }, 'ana').ok).toBe(false);
    expect(conferirFichas(vazio, { fichas: { f: nova({ niveisLiberados: 3 }) } }, 'ana').ok).toBe(false);
  });

  it('em criação, o dono muda tudo e conclui; depois não volta, e só apaga enquanto cria', () => {
    const antes = { fichas: { f: nova() } };
    const montada = fichaDaCriacao(antes.fichas.f, escolhasDoGuerreiro(), compendio, criarId, R);
    expect(conferirFichas(antes, { fichas: { f: montada } }, 'ana')).toEqual({ ok: true });
    const concluida = { ...montada, emCriacao: false };
    expect(conferirFichas({ fichas: { f: montada } }, { fichas: { f: concluida } }, 'ana')).toEqual({ ok: true });
    expect(conferirFichas({ fichas: { f: concluida } }, { fichas: { f: montada } }, 'ana').ok).toBe(false);
    expect(conferirFichas(antes, vazio, 'ana')).toEqual({ ok: true });
    expect(conferirFichas({ fichas: { f: concluida } }, vazio, 'ana').ok).toBe(false);
  });

  it('o mestre libera níveis; o dono gasta um numa subida válida, e só nela', () => {
    const pronta: Ficha = { ...fichaDaCriacao(nova(), escolhasDoGuerreiro(), compendio, criarId, R), emCriacao: false };
    const liberada = { ...pronta, niveisLiberados: 1 };
    expect(conferirFichas({ fichas: { f: pronta } }, { fichas: { f: liberada } }, 'ana')).toMatchObject({ ok: false, motivo: 'Só o mestre libera níveis.' });
    expect(conferirFichas({ fichas: { f: pronta } }, { fichas: { f: liberada } }, 'mestre').ok).toBe(true);

    const antes = { fichas: { f: liberada } };
    const subiu = fichaComNivel(liberada, { classeId: 'mago', pvRolado: null, aumento: null, magias: ['escudo'] }, compendio);
    expect(conferirFichas(antes, { fichas: { f: subiu } }, 'ana')).toEqual({ ok: true });
    const forte = { ...subiu, atributos: { ...subiu.atributos, for: 18 } };
    expect(conferirFichas(antes, { fichas: { f: forte } }, 'ana')).toMatchObject({ ok: false, motivo: expect.stringContaining('2 pontos') });
    const semGastar = { ...subiu, niveisLiberados: 1 };
    expect(conferirFichas(antes, { fichas: { f: semGastar } }, 'ana').ok).toBe(false);
    const trocouEspecie = { ...subiu, especieId: null };
    expect(conferirFichas(antes, { fichas: { f: trocouEspecie } }, 'ana').ok).toBe(false);
  });
});

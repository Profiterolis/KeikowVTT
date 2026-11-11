import { describe, expect, it } from 'vitest';
import type { Calculado } from './calculadora';
import { acoesDaArma, conjurar, rolarTeste } from './acoesDaFicha';
import { avisosDaFicha, calcularFicha, equipamentoDaFicha } from './calculoDaFicha';
import { aplicarAcaoCompendio, criarCompendioVazio, type EstadoCompendio } from './compendio';
import { criarEntrada, type DadosArmadura, type Efeito, type Entrada, type EntradaDe } from './entradas';
import { comClasse, comExtra, comItem, comNivel, comOrigem, comPilha, criarFicha, type Ficha } from './fichas';
import { REGRAS_PADRAO } from './regrasPadrao';

let n = 0;
const efeito = (alvo: string, operacao: Efeito['operacao'], valor: string, quando: Efeito['quando'] = 'sempre'): Efeito => ({
  id: `e${++n}`,
  alvo,
  operacao,
  valor,
  quando,
});

function protecao(id: string, nome: string, armadura: DadosArmadura): EntradaDe<'item'> {
  const base = criarEntrada('item', id);
  return { ...base, nome, dados: { ...base.dados, categoria: armadura.peso === 'escudo' ? 'escudo' : 'armadura', armadura } };
}

const cotaDeMalha = protecao('cota', 'Chain Mail', { peso: 'pesada', caBase: 16, usaDestreza: false, destrezaMaxima: null, forcaMinima: 13, desvantagemFurtividade: true });
const couroBatido = protecao('couro', 'Studded Leather', { peso: 'leve', caBase: 12, usaDestreza: true, destrezaMaxima: null, forcaMinima: 0, desvantagemFurtividade: false });
const escamas = protecao('escamas', 'Scale Mail', { peso: 'media', caBase: 14, usaDestreza: true, destrezaMaxima: 2, forcaMinima: 0, desvantagemFurtividade: true });
const escudo = protecao('escudo', 'Shield', { peso: 'escudo', caBase: 2, usaDestreza: false, destrezaMaxima: null, forcaMinima: 0, desvantagemFurtividade: false });

const anel: EntradaDe<'item'> = {
  ...criarEntrada('item', 'anel'),
  nome: 'Ring of Protection',
  efeitos: [efeito('ca', 'somar', '1', 'sintonizado'), efeito('salvaguarda_des', 'somar', '1', 'sintonizado')],
  dados: { ...criarEntrada('item', 'x').dados, requerSintonia: true },
};
const botas: EntradaDe<'item'> = { ...criarEntrada('item', 'botas'), nome: 'Boots', efeitos: [efeito('deslocamento', 'somar', '3', 'equipado')] };
const defesaSemArmadura: EntradaDe<'habilidade'> = {
  ...criarEntrada('habilidade', 'defesa'),
  nome: 'Unarmored Defense',
  efeitos: [efeito('ca', 'minimo', 'se(usando_armadura, 0, 10 + mod(DES) + mod(CON) + escudo_bonus)')],
};
const resiliencia: EntradaDe<'habilidade'> = {
  ...criarEntrada('habilidade', 'resiliencia'),
  nome: 'Draconic Resilience',
  efeitos: [efeito('pv_maximos', 'somar', 'nivel_classe')],
};
const barbaro: EntradaDe<'classe'> = {
  ...criarEntrada('classe', 'barbaro'),
  nome: 'Barbarian',
  dados: {
    ...criarEntrada('classe', 'x').dados,
    dadoVida: 12,
    habilidades: [
      { nivel: 1, entradaId: 'defesa' },
      { nivel: 1, entradaId: 'resiliencia' },
    ],
  },
};
const sortudo: EntradaDe<'talento'> = { ...criarEntrada('talento', 'sorte'), nome: 'Tough', efeitos: [efeito('pv_maximos', 'somar', '2 * nivel')] };
const escudoArcano: EntradaDe<'magia'> = { ...criarEntrada('magia', 'shield'), nome: 'Shield', efeitos: [efeito('ca', 'somar', '5')] };

const humanoEntrada: EntradaDe<'especie'> = { ...criarEntrada('especie', 'humano'), nome: 'Human' };

const compendio: EstadoCompendio = [cotaDeMalha, couroBatido, escamas, escudo, anel, botas, defesaSemArmadura, resiliencia, barbaro, sortudo, escudoArcano, humanoEntrada].reduce(
  (estado, entrada: Entrada) => aplicarAcaoCompendio(estado, { tipo: 'AdicionarEntrada', entrada }),
  criarCompendioVazio(),
);

function com(atributos: Partial<Ficha['atributos']>, ...itens: [string, { equipado?: boolean; sintonizado?: boolean }?][]): Ficha {
  let ficha: Ficha = { ...criarFicha('personagem', 'f'), atributos: { ...criarFicha('personagem', 'f').atributos, ...atributos } };
  itens.forEach(([id, marcas], i) => {
    ficha = comItem(ficha, compendio, id, `p${i}`);
    if (marcas) {
      ficha = comPilha(ficha, `p${i}`, marcas);
    }
  });
  return ficha;
}

const valor = (c: Calculado) => (c.ok ? c.valor : NaN);
const ca = (ficha: Ficha) => valor(calcularFicha(ficha, REGRAS_PADRAO).valor('ca'));
const deslocamento = (ficha: Ficha) => valor(calcularFicha(ficha, REGRAS_PADRAO).valor('deslocamento'));
/** Dá à ficha uma espécie com 9 m de deslocamento. */
const humano = (ficha: Ficha): Ficha => comOrigem(ficha, compendio, 'especieId', 'humano');

describe('armadura e escudo pela regra da CA', () => {
  it('sem armadura: 10 + Destreza', () => {
    expect(ca(com({ des: 14 }))).toBe(12);
    // Carregar sem equipar não conta.
    expect(ca(com({ des: 14 }, ['cota']))).toBe(12);
  });

  it('armadura pesada ignora a Destreza; leve soma tudo; média soma até 2', () => {
    expect(ca(com({ des: 18, for: 15 }, ['cota', { equipado: true }]))).toBe(16);
    expect(ca(com({ des: 18 }, ['couro', { equipado: true }]))).toBe(16);
    expect(ca(com({ des: 18 }, ['escamas', { equipado: true }]))).toBe(16);
    expect(ca(com({ des: 12 }, ['escamas', { equipado: true }]))).toBe(15);
  });

  it('o escudo soma por cima, com ou sem armadura', () => {
    expect(ca(com({ des: 14 }, ['escudo', { equipado: true }]))).toBe(14);
    expect(ca(com({ des: 14, for: 15 }, ['cota', { equipado: true }], ['escudo', { equipado: true }]))).toBe(18);
  });

  it('a explicação mostra de onde vem a CA com armadura', () => {
    const resultado = calcularFicha(com({ des: 18 }, ['escamas', { equipado: true }], ['escudo', { equipado: true }]), REGRAS_PADRAO).valor('ca');
    expect(resultado.ok && resultado.partes.map((p) => [p.texto, p.valor])).toEqual([
      ['armadura_base', 14],
      ['min(mod(DES), armadura_des_max)', 2],
      ['escudo_bonus', 2],
    ]);
  });

  it('com duas armaduras, vale a de maior CA', () => {
    const ficha = com({ des: 10, for: 15 }, ['couro', { equipado: true }], ['cota', { equipado: true }]);
    expect(equipamentoDaFicha(ficha).armadura?.nome).toBe('Chain Mail');
    expect(ca(ficha)).toBe(16);
  });

  it('Força abaixo do mínimo tira 3 m do deslocamento', () => {
    expect(deslocamento(humano(com({ for: 10 }, ['cota', { equipado: true }])))).toBe(6);
    expect(deslocamento(humano(com({ for: 13 }, ['cota', { equipado: true }])))).toBe(9);
    expect(deslocamento(humano(com({ for: 10 }, ['cota'])))).toBe(9);
  });
});

describe('efeitos dos itens', () => {
  it('"sintonizado" só vale com a sintonia marcada', () => {
    expect(ca(com({ des: 10 }, ['anel', { equipado: true }]))).toBe(10);
    expect(ca(com({ des: 10 }, ['anel', { sintonizado: true }]))).toBe(11);
  });

  it('"equipado" só vale com o item equipado', () => {
    expect(deslocamento(humano(com({}, ['botas', { equipado: false }])))).toBe(9);
    expect(deslocamento(humano(com({}, ['botas', { equipado: true }])))).toBe(12);
  });

  it('duas pilhas do mesmo item não somam o efeito duas vezes', () => {
    expect(ca(com({ des: 10 }, ['anel', { sintonizado: true }], ['anel', { sintonizado: true }]))).toBe(11);
  });
});

describe('efeitos das habilidades', () => {
  const barbara = (atributos: Partial<Ficha['atributos']>, ...itens: [string, { equipado?: boolean }?][]) => {
    let ficha = com(atributos, ...itens);
    ficha = comClasse(ficha, compendio, 'barbaro');
    return comNivel(ficha, 'barbaro', 3);
  };

  it('Defesa sem Armadura vale sem armadura, com o escudo por cima', () => {
    expect(ca(barbara({ des: 14, con: 16 }))).toBe(15);
    expect(ca(barbara({ des: 14, con: 16 }, ['escudo', { equipado: true }]))).toBe(17);
    expect(ca(barbara({ des: 14, con: 16, for: 15 }, ['cota', { equipado: true }]))).toBe(16);
  });

  it('efeitos de habilidade de classe usam o nível na classe', () => {
    const c = calcularFicha(barbara({ con: 10 }), REGRAS_PADRAO);
    expect(c.valor('pv_maximos')).toMatchObject({ valor: 12 + 7 + 7 + 3, ajustes: [{ fonte: 'Draconic Resilience', valor: 3, aplicado: true }] });
  });

  it('talentos acrescentados à mão valem; magias não valem o tempo todo', () => {
    let ficha = barbara({ con: 10 });
    ficha = comExtra(comExtra(ficha, compendio, 'sorte'), compendio, 'shield');
    const c = calcularFicha(ficha, REGRAS_PADRAO);
    expect(valor(c.valor('pv_maximos'))).toBe(12 + 7 + 7 + 3 + 6);
    expect(valor(c.valor('ca'))).toBe(10);
  });
});

describe('avisos', () => {
  it('aponta armaduras e escudos repetidos, sintonia demais, Furtividade e Força', () => {
    let ficha = com({ for: 10 }, ['cota', { equipado: true }], ['couro', { equipado: true }], ['escudo', { equipado: true }], ['escudo', { equipado: true }]);
    const avisos = avisosDaFicha(ficha, calcularFicha(ficha, REGRAS_PADRAO));
    expect(avisos).toEqual([
      '2 armaduras equipadas: vale só Chain Mail.',
      '2 escudos equipados: vale só Shield.',
      'Chain Mail dá desvantagem em Furtividade.',
      'Sem proficiência com Chain Mail, Shield: desvantagem em testes, salvaguardas e ataques de Força e Destreza, e não conjura magias.',
      'Chain Mail exige Força 13: o deslocamento cai 3 m.',
    ]);
    const muitos = ['a1', 'a2', 'a3', 'a4'].map((id) => ({ ...anel, id }));
    let comAneis = com({});
    for (const [i, item] of muitos.entries()) {
      comAneis = { ...comAneis, entradas: { ...comAneis.entradas, [item.id]: item }, itens: [...comAneis.itens, { id: `x${i}`, entradaId: item.id, quantidade: 1, equipado: true, sintonizado: true }] };
    }
    ficha = comAneis;
    expect(avisosDaFicha(ficha, calcularFicha(ficha, REGRAS_PADRAO))).toContain('4 itens sintonizados: o limite é 3.');
  });
});

describe('armadura sem proficiência', () => {
  const comProficiencias = (ficha: Ficha, textos: string[]): Ficha => ({ ...ficha, proficienciasExtras: textos });
  const vestida = () => com({ for: 14, des: 14 }, ['cota', { equipado: true }]);

  it('dá desvantagem nos testes de Força e Destreza (e anula a vantagem); os outros não mudam', () => {
    const calculo = calcularFicha(vestida(), REGRAS_PADRAO);
    const rotulo = (termo: string, modo: 'normal' | 'vantagem' = 'normal') => {
      const r = rolarTeste(calculo, termo, 'Teste', modo, () => 0.5);
      return r.ok ? `${r.feita.rotulo} | ${r.feita.formula.split(' ')[0]}` : r.erro;
    };
    expect(rotulo('atletismo')).toBe('Teste (desvantagem) (armadura sem proficiência) | 2d20kl1');
    expect(rotulo('salvaguarda_des', 'vantagem')).toBe('Teste (armadura sem proficiência) | 1d20');
    expect(rotulo('mod(FOR)')).toContain('desvantagem');
    expect(rotulo('iniciativa')).toContain('desvantagem');
    expect(rotulo('percepcao')).toBe('Teste | 1d20');
    expect(rotulo('salvaguarda_sab')).toBe('Teste | 1d20');
  });

  it('com a proficiência (da classe ou treinada), nada muda', () => {
    expect(equipamentoDaFicha(comProficiencias(vestida(), ['Heavy Armor'])).variaveis.armadura_sem_proficiencia).toBeUndefined();
    expect(equipamentoDaFicha(comProficiencias(vestida(), ['All armor'])).variaveis.armadura_sem_proficiencia).toBeUndefined();
    const comEscudo = comProficiencias(com({}, ['escudo', { equipado: true }]), ['Light Armor']);
    expect(equipamentoDaFicha(comEscudo).variaveis.armadura_sem_proficiencia?.origem).toBe('Shield');
    // Desequipada, não pesa.
    expect(equipamentoDaFicha(com({}, ['cota'])).variaveis.armadura_sem_proficiencia).toBeUndefined();
  });

  it('o ataque das armas rola com desvantagem e não dá para conjurar', () => {
    const espada: EntradaDe<'item'> = {
      ...criarEntrada('item', 'espada'),
      nome: 'Longsword',
      dados: { ...criarEntrada('item', 'x').dados, arma: { dominio: 'marcial', alcanceTipo: 'corpo-a-corpo', dano: '1d8', tipoDano: '', danoVersatil: null, alcance: null, propriedades: [] } },
    };
    const ataque = acoesDaArma(vestida(), espada)[0].passos[0];
    expect(ataque).toMatchObject({ formula: '2d20kl1 + mod(FOR)', rotulo: 'Longsword: ataque (desvantagem: armadura sem proficiência)' });
    expect(acoesDaArma(comProficiencias(vestida(), ['Heavy Armor']), espada)[0].passos[0]).toMatchObject({ formula: '1d20 + mod(FOR)' });
    const magia: EntradaDe<'magia'> = { ...criarEntrada('magia', 'luz'), nome: 'Light' };
    const ficha = vestida();
    expect(conjurar(ficha, calcularFicha(ficha, REGRAS_PADRAO), magia, 0)).toEqual({
      ok: false,
      erro: 'Usando Chain Mail sem proficiência, não dá para conjurar magias.',
    });
  });
});


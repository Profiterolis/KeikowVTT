import { describe, expect, it } from 'vitest';
import { criarCalculo, type Calculado, type EfeitoAtivo, type EntradaDoCalculo } from './calculadora';
import type { Efeito } from './entradas';
import { conferirRegras, lerRegras, type Regras } from './regras';
import { REGRAS_PADRAO } from './regrasPadrao';

/** Uma guerreira de nível 5, com Força 16 e Destreza 14. */
const guerreira: EntradaDoCalculo = {
  atributos: { for: 16, des: 14, con: 14, int: 10, sab: 12, car: 8 },
  nivel: 5,
  pvDosDados: 34,
  deslocamentoBase: 30,
  proficiencias: { atletismo: 1, percepcao: 1, salvaguarda_for: 1, salvaguarda_con: 1 },
};

function valor(resultado: Calculado): number {
  if (!resultado.ok) {
    throw new Error(`Esperava um valor: ${resultado.erro}`);
  }
  return resultado.valor;
}

function erro(resultado: Calculado): string {
  if (resultado.ok) {
    throw new Error(`Esperava um erro, veio ${resultado.valor}`);
  }
  return resultado.erro;
}

let contador = 0;
function efeito(fonte: string, alvo: string, operacao: Efeito['operacao'], formula: string): EfeitoAtivo {
  contador++;
  return { fonte, efeito: { id: `e${contador}`, alvo, operacao, valor: formula, quando: 'sempre' } };
}

const calcular = (entrada: EntradaDoCalculo = guerreira, regras: Regras = REGRAS_PADRAO) => criarCalculo(regras, entrada);

describe('regras padrão', () => {
  it('não têm problemas', () => {
    expect(conferirRegras(REGRAS_PADRAO)).toEqual([]);
  });

  it('são dados: sobrevivem a JSON e voltam iguais', () => {
    expect(lerRegras(JSON.parse(JSON.stringify(REGRAS_PADRAO)))).toEqual(REGRAS_PADRAO);
  });

  it('calculam a ficha da guerreira', () => {
    const c = calcular();
    expect(valor(c.valor('prof'))).toBe(3);
    expect(valor(c.modificador('for'))).toBe(3);
    expect(valor(c.valor('ca'))).toBe(12);
    expect(valor(c.valor('iniciativa'))).toBe(2);
    expect(valor(c.valor('pv_maximos'))).toBe(34 + 5 * 2);
    expect(valor(c.valor('deslocamento'))).toBe(30);
    expect(valor(c.valor('atletismo'))).toBe(6);
    expect(valor(c.valor('acrobacia'))).toBe(2);
    expect(valor(c.valor('percepcao'))).toBe(4);
    expect(valor(c.valor('percepcao_passiva'))).toBe(14);
    expect(valor(c.valor('salvaguarda_for'))).toBe(6);
    expect(valor(c.valor('salvaguarda_des'))).toBe(2);
    expect(valor(c.valor('capacidade_carga'))).toBe(120);
  });

  it('o bônus de proficiência sobe a cada 4 níveis', () => {
    const prof = (nivel: number) => valor(calcular({ ...guerreira, nivel }).valor('prof'));
    expect([1, 4, 5, 8, 9, 13, 17, 20].map(prof)).toEqual([2, 2, 3, 3, 4, 5, 6, 6]);
  });

  it('especialista dobra a proficiência; metade arredonda para baixo', () => {
    const c = calcular({ ...guerreira, proficiencias: { furtividade: 2, historia: 0.5 } });
    expect(valor(c.valor('furtividade'))).toBe(2 + 6);
    expect(valor(c.valor('historia'))).toBe(0 + 1);
  });

  it('explica de onde vem cada número', () => {
    const c = calcular();
    expect(c.valor('ca')).toEqual({
      ok: true,
      valor: 12,
      base: 12,
      partes: [
        { texto: '10', valor: 10 },
        { texto: 'mod(DES)', valor: 2, nome: 'des', funcao: 'mod' },
        { texto: 'escudo_bonus', valor: 0, nome: 'escudo_bonus' },
      ],
      ajustes: [],
    });
    const atletismo = c.valor('atletismo');
    expect(atletismo.ok && atletismo.partes).toEqual([
      { texto: 'mod(FOR)', valor: 3, nome: 'for', funcao: 'mod' },
      { texto: 'piso(prof * 1)', valor: 3 },
    ]);
  });

  it('quem não conjura não tem CD de magia, e o resto da ficha continua', () => {
    const c = calcular();
    expect(erro(c.valor('cd_magia'))).toContain('não tem atributo de conjuração');
    expect(valor(c.valor('ca'))).toBe(12);
  });

  it('quem conjura usa o atributo escolhido', () => {
    const c = calcular({ ...guerreira, atributos: { ...guerreira.atributos, int: 16 }, conjuracao: 'int' });
    expect(valor(c.valor('cd_magia'))).toBe(8 + 3 + 3);
    expect(valor(c.valor('ataque_magico'))).toBe(6);
  });

  it('aceita nomes com maiúsculas e acentos', () => {
    expect(valor(calcular().valor('Percepção'))).toBe(4);
  });

  it('avisa o que falta na ficha', () => {
    const { pvDosDados: _pv, ...semPv } = guerreira;
    expect(erro(calcular(semPv).valor('pv_maximos'))).toContain('PV dos dados de vida');
  });
});

describe('efeitos', () => {
  it('somar: Anel de Proteção +1 na CA', () => {
    const resultado = calcular({ ...guerreira, efeitos: [efeito('Anel de Proteção', 'ca', 'somar', '1')] }).valor('ca');
    expect(resultado).toMatchObject({
      ok: true,
      valor: 13,
      base: 12,
      ajustes: [{ fonte: 'Anel de Proteção', operacao: 'somar', valor: 1, aplicado: true }],
    });
  });

  it('no mínimo: Armadura Arcana, e o escudo soma depois', () => {
    const c = calcular({
      ...guerreira,
      efeitos: [efeito('Armadura Arcana', 'CA', 'minimo', '13 + mod(DES)'), efeito('Escudo', 'ca', 'somar', '2')],
    });
    expect(valor(c.valor('ca'))).toBe(17);
  });

  it('no mínimo menor que o valor não conta', () => {
    const resultado = calcular({ ...guerreira, efeitos: [efeito('Manoplas', 'for', 'minimo', '15')] }).valor('for');
    expect(resultado).toMatchObject({ valor: 16, ajustes: [{ aplicado: false }] });
  });

  it('um atributo alterado muda tudo o que depende dele', () => {
    const c = calcular({ ...guerreira, efeitos: [efeito('Manoplas de Força', 'for', 'minimo', '19')] });
    expect(valor(c.valor('for'))).toBe(19);
    expect(valor(c.valor('atletismo'))).toBe(4 + 3);
    expect(valor(c.valor('capacidade_carga'))).toBe(142.5);
  });

  it('só o maior "no mínimo" conta', () => {
    const resultado = calcular({
      ...guerreira,
      efeitos: [efeito('A', 'ca', 'minimo', '14'), efeito('B', 'ca', 'minimo', '16')],
    }).valor('ca');
    expect(resultado).toMatchObject({ valor: 16, ajustes: [{ aplicado: false }, { aplicado: true }] });
  });

  it('definir vence tudo, e entre vários vale o menor', () => {
    const resultado = calcular({
      ...guerreira,
      efeitos: [
        efeito('Botas', 'deslocamento', 'somar', '10'),
        efeito('Agarrado', 'deslocamento', 'definir', '0'),
        efeito('Lento', 'deslocamento', 'definir', '15'),
      ],
    }).valor('deslocamento');
    expect(resultado).toMatchObject({
      valor: 0,
      ajustes: [{ aplicado: false }, { aplicado: true }, { aplicado: false }],
    });
  });

  it('um efeito com problema é ignorado e explicado, sem quebrar o valor', () => {
    const resultado = calcular({
      ...guerreira,
      efeitos: [efeito('Quebrado', 'ca', 'somar', '1 +'), efeito('Inexistente', 'ca', 'somar', 'sorte')],
    }).valor('ca');
    expect(resultado).toMatchObject({
      ok: true,
      valor: 12,
      ajustes: [
        { valor: null, aplicado: false, erro: expect.stringContaining('terminou antes') },
        { valor: null, aplicado: false, erro: 'Nome desconhecido: "sorte".' },
      ],
    });
  });

  it('um efeito que cita o próprio alvo não entra em círculo', () => {
    const resultado = calcular({ ...guerreira, efeitos: [efeito('Eco', 'ca', 'somar', 'ca')] }).valor('ca');
    expect(resultado).toMatchObject({
      valor: 12,
      ajustes: [{ aplicado: false, erro: expect.stringContaining('Depende de si mesmo') }],
    });
  });

  it('efeitos podem citar outros valores', () => {
    const c = calcular({ ...guerreira, efeitos: [efeito('Vigor', 'pv_maximos', 'somar', 'nivel')] });
    expect(valor(c.valor('pv_maximos'))).toBe(44 + 5);
  });
});

describe('valores de viagem', () => {
  it('começam no padrão e mudam por efeitos, como uma montaria ou um guia', () => {
    const sem = calcular();
    expect(sem.valor('fator_viagem')).toMatchObject({ ok: true, valor: 1 });
    expect(sem.valor('visao_hexes')).toMatchObject({ ok: true, valor: 1 });
    expect(sem.valor('guia_floresta')).toMatchObject({ ok: true, valor: 0 });
    const com = calcular({
      ...guerreira,
      efeitos: [
        efeito('Cavalo', 'fator_viagem', 'minimo', '1.5'),
        efeito('Luneta', 'visao_hexes', 'somar', '1'),
        efeito('Exploração Natural', 'guia_floresta', 'minimo', '1'),
      ],
    });
    expect(com.valor('fator_viagem')).toMatchObject({ ok: true, valor: 1.5 });
    expect(com.valor('visao_hexes')).toMatchObject({ ok: true, valor: 2 });
    expect(com.valor('guia_floresta')).toMatchObject({ ok: true, valor: 1 });
    expect(com.rotulo('guia_floresta')).toBe('Guia em floresta (1 sim, 0 não)');
  });

  it('não há guia para terreno intransponível, e os nomes não podem ser tomados por valores novos', () => {
    expect(calcular().valor('guia_agua').ok).toBe(false);
    const regras = {
      ...REGRAS_PADRAO,
      valores: [...REGRAS_PADRAO.valores, { id: 'fator_viagem', nome: 'Outro', formula: '1', descricao: '' }],
    };
    expect(conferirRegras(regras).map((p) => p.erro).join(' ')).toContain('já é usado');
  });
});

describe('valores fixos', () => {
  it('substituem a regra, e os efeitos continuam valendo', () => {
    const c = calcular({
      ...guerreira,
      fixos: { ca: { valor: 15, origem: 'ficha do monstro' }, furtividade: { valor: 6, origem: 'ficha do monstro' } },
      efeitos: [efeito('Escudo da Fé', 'ca', 'somar', '2')],
    });
    expect(c.valor('ca')).toMatchObject({ valor: 17, base: 15, partes: [{ texto: 'ficha do monstro', valor: 15 }] });
    expect(valor(c.valor('furtividade'))).toBe(6);
    expect(valor(c.valor('acrobacia'))).toBe(2);
  });
});

describe('regras diferentes', () => {
  it('trocar uma fórmula muda a ficha, sem mexer no código', () => {
    const regras: Regras = {
      ...REGRAS_PADRAO,
      modificador: 'piso((valor - 10) / 3)',
      valores: REGRAS_PADRAO.valores.map((v) => (v.id === 'ca' ? { ...v, formula: '8 + mod(DES) + prof' } : v)),
    };
    const c = calcular(guerreira, regras);
    expect(valor(c.modificador('for'))).toBe(2);
    expect(valor(c.valor('ca'))).toBe(8 + 1 + 3);
  });

  it('valores que dependem um do outro são apontados nas regras e no cálculo', () => {
    const regras: Regras = {
      ...REGRAS_PADRAO,
      valores: [
        ...REGRAS_PADRAO.valores,
        { id: 'sorte', nome: 'Sorte', formula: 'azar + 1', descricao: '' },
        { id: 'azar', nome: 'Azar', formula: 'sorte - 1', descricao: '' },
      ],
    };
    expect(conferirRegras(regras)).toEqual([{ onde: 'Sorte', erro: 'Depende de si mesmo: sorte → azar → sorte.' }]);
    expect(erro(calcular(guerreira, regras).valor('sorte'))).toContain('Depende de si mesmo: Sorte → Azar → Sorte');
    expect(valor(calcular(guerreira, regras).valor('ca'))).toBe(12);
  });

  it('a conferência aponta cada tipo de problema', () => {
    const regras: Regras = {
      ...REGRAS_PADRAO,
      modificador: 'mod(valor)',
      valores: [
        { id: 'a', nome: 'Desconhecido', formula: 'foo + 1', descricao: '' },
        { id: 'b', nome: 'Função', formula: 'dobro(2)', descricao: '' },
        { id: 'c', nome: 'Dados', formula: '1d6', descricao: '' },
        { id: 'd', nome: 'Tabela', formula: 'tabela(furias)', descricao: '' },
        { id: 'e2', nome: 'Quebrada', formula: '(', descricao: '' },
        { id: 'prof', nome: 'Repetido', formula: '1', descricao: '' },
        { id: 'prof', nome: 'Repetido de novo', formula: '1', descricao: '' },
        { id: 'Maiúscula', nome: 'Id inválido', formula: '1', descricao: '' },
        { id: 'nivel', nome: 'Toma um nome da ficha', formula: '1', descricao: '' },
      ],
    };
    const problemas = conferirRegras(regras).map((p) => `${p.onde}: ${p.erro}`);
    expect(problemas).toEqual(
      expect.arrayContaining([
        'Repetido de novo: O nome "prof" já é usado por outra coisa.',
        'Id inválido: O nome "Maiúscula" só pode ter letras minúsculas sem acento, números e "_".',
        'Toma um nome da ficha: O nome "nivel" já é usado por outra coisa.',
        'Modificador: Função desconhecida: "mod".',
        'Desconhecido: Nome desconhecido: "foo".',
        'Função: Função desconhecida: "dobro".',
        'Dados: As regras da ficha não podem rolar dados.',
        'Tabela: "tabela(...)" só funciona em habilidades de uma classe, não nas regras gerais.',
        'Quebrada: A fórmula terminou antes do esperado.',
      ]),
    );
  });

  it('regras sem o bloco de criação, gravadas antes do assistente, ganham o padrão', () => {
    const { criacao: _c, ...antigas } = REGRAS_PADRAO;
    expect(lerRegras(JSON.parse(JSON.stringify(antigas)), REGRAS_PADRAO)).toEqual(REGRAS_PADRAO);
    expect(() => lerRegras(JSON.parse(JSON.stringify(antigas)))).toThrow('criação de personagem');
  });

  it('regras sem o bloco de viagem, gravadas antes da Fase 5, ganham o padrão', () => {
    const { viagem: _v, ...antigas } = REGRAS_PADRAO;
    expect(lerRegras(JSON.parse(JSON.stringify(antigas)), REGRAS_PADRAO)).toEqual(REGRAS_PADRAO);
    expect(() => lerRegras(JSON.parse(JSON.stringify(antigas)))).toThrow('sem a viagem');
  });

  it.each<[string, Partial<Regras['criacao']>, string]>([
    ['nenhum método', { metodos: [] }, 'ao menos um método'],
    ['pontos negativos', { pontos: -1 }, 'pontos'],
    ['custo repetido', { custos: [{ valor: 8, custo: 0 }, { valor: 8, custo: 1 }] }, 'repetidos'],
    ['conjunto com 5 valores', { conjuntoPadrao: [15, 14, 13, 12, 10] }, 'conjunto padrão'],
    ['rolagem sem dados', { rolagem: '10' }, 'só dados'],
    ['rolagem que cita a ficha', { rolagem: '1d20 + FOR' }, 'só dados'],
  ])('confere a criação de personagem: %s', (_nome, mudanca, trecho) => {
    const regras = { ...REGRAS_PADRAO, criacao: { ...REGRAS_PADRAO.criacao, ...mudanca } };
    expect(conferirRegras(regras).map((p) => p.erro).join(' ')).toContain(trecho);
  });

  it('lerRegras recusa regras com problema', () => {
    const quebradas = { ...REGRAS_PADRAO, formulaPericia: 'mod(atributo) +' };
    expect(() => lerRegras(JSON.parse(JSON.stringify(quebradas)))).toThrow('Fórmula das perícias');
    expect(() => lerRegras({ ...REGRAS_PADRAO, pericias: [{ id: 'x', nome: 'X', atributo: 'sorte' }] })).toThrow(
      'atributo é desconhecido',
    );
  });
});

describe('fórmulas de habilidades', () => {
  const tabela: Record<string, string> = { furias: '3', ataque_furtivo: '3d6', vazia: '', quebrada: '1 +' };
  const extras = { nivelClasse: 5, coluna: (coluna: string) => tabela[coluna] };

  it('usam a tabela e o nível da classe', () => {
    const c = calcular();
    const usos = c.formula('tabela(furias)', extras);
    expect(usos.ok && usos.valor).toBe(3);
    const nivel = c.formula('nivel_classe + mod(CON)', extras);
    expect(nivel.ok && nivel.valor).toBe(7);
  });

  it('célula vazia vale zero; célula com erro explica onde está', () => {
    const c = calcular();
    const vazia = c.formula('tabela(vazia)', extras);
    expect(vazia.ok && vazia.valor).toBe(0);
    const quebrada = c.formula('tabela(quebrada)', extras);
    expect(!quebrada.ok && quebrada.erro).toContain('A coluna "quebrada" da tabela tem um erro');
  });

  it('fora de uma classe, nivel_classe e tabela não existem', () => {
    const c = calcular();
    const semClasse = c.formula('nivel_classe');
    expect(!semClasse.ok && semClasse.erro).toBe('Nome desconhecido: "nivel_classe".');
  });

  it('rolam e mostram o texto com os números', () => {
    const c = calcular();
    const rolagem = c.rolar('tabela(ataque_furtivo) + mod(DES)', extras, () => 0.99);
    expect(rolagem.ok && rolagem.total).toBe(18 + 2);
    const texto = c.texto('tabela(ataque_furtivo) + mod(DES)', extras);
    expect(texto.ok && texto.texto).toBe('3d6 + 2');
  });
});

import { describe, expect, it } from 'vitest';
import { lerPacote, pacoteParaObjeto } from '../../src/core/pacotes';
import {
  agruparCaracteristicas,
  ARQUIVOS_FONTE,
  converterCaracteristica,
  converterClasse,
  converterEquipamento,
  converterItemMagico,
  converterMagia,
  converterMonstro,
  converterSrd,
  converterSubespecie,
  converterTabela,
  formulasQuebradas,
  CREDITO_SRD,
  formatarNivelDesafio,
  formatarUso,
  juntarTexto,
  niveisDeAumento,
  referenciasQuebradas,
  type Fontes,
  type Registro,
  converterKit,
  ehPacoteDeEquipamento,
} from './converterSrd';

// Registros reais da base do 5e-bits, encurtados.
const ref = (index: string, name: string) => ({ index, name, url: `/x/${index}` });
const fontesVazias = () => Object.fromEntries(ARQUIVOS_FONTE.map((nome) => [nome, []])) as unknown as Fontes;

const longsword: Registro = {
  index: 'longsword',
  name: 'Longsword',
  equipment_category: ref('weapon', 'Weapon'),
  equipment_categories: [ref('weapon', 'Weapon'), ref('martial-weapons', 'Martial Weapons')],
  weapon_category: 'Martial',
  weapon_range: 'Melee',
  cost: { quantity: 15, unit: 'gp' },
  damage: { damage_dice: '1d8', damage_type: ref('slashing', 'Slashing') },
  range: { normal: 5 },
  weight: 3,
  properties: [ref('versatile', 'Versatile')],
  two_handed_damage: { damage_dice: '1d10', damage_type: ref('slashing', 'Slashing') },
};

const longbow: Registro = {
  ...longsword,
  index: 'longbow',
  name: 'Longbow',
  weapon_range: 'Ranged',
  range: { normal: 150, long: 600 },
  two_handed_damage: undefined,
};

const chainMail: Registro = {
  index: 'chain-mail',
  name: 'Chain Mail',
  equipment_category: ref('armor', 'Armor'),
  equipment_categories: [ref('armor', 'Armor')],
  armor_category: 'Heavy',
  armor_class: { base: 16, dex_bonus: false },
  str_minimum: 13,
  stealth_disadvantage: true,
  weight: 55,
  cost: { quantity: 75, unit: 'gp' },
};

const goblin: Registro = {
  index: 'goblin',
  name: 'Goblin',
  size: 'Small',
  type: 'humanoid',
  subtype: 'goblinoid',
  alignment: 'neutral evil',
  armor_class: [{ type: 'armor', value: 15, armor: [ref('leather-armor', 'Leather Armor'), ref('shield', 'Shield')] }],
  hit_points: 7,
  hit_dice: '2d6',
  hit_points_roll: '2d6',
  speed: { walk: '30 ft.' },
  strength: 8,
  dexterity: 14,
  constitution: 10,
  intelligence: 10,
  wisdom: 8,
  charisma: 8,
  proficiencies: [
    { value: 6, proficiency: ref('skill-stealth', 'Skill: Stealth') },
    { value: 4, proficiency: ref('saving-throw-dex', 'Saving Throw: DEX') },
  ],
  damage_vulnerabilities: [],
  damage_resistances: ['poison'],
  damage_immunities: [],
  condition_immunities: [ref('charmed', 'Charmed')],
  senses: { darkvision: '60 ft.', passive_perception: 9 },
  languages: 'Common, Goblin',
  challenge_rating: 0.25,
  xp: 50,
  special_abilities: [{ name: 'Nimble Escape', desc: 'The goblin can take the Disengage or Hide action.' }],
  actions: [{ name: 'Scimitar', desc: 'Melee Weapon Attack: +4 to hit.' }],
};

const fireball: Registro = {
  index: 'fireball',
  name: 'Fireball',
  desc: ['A bright streak flashes from your pointing finger.', 'The fire spreads around corners.'],
  higher_level: ['The damage increases by 1d6 for each slot level above 3rd.'],
  range: '150 feet',
  components: ['V', 'S', 'M'],
  material: 'A tiny ball of bat guano and sulfur.',
  ritual: false,
  duration: 'Instantaneous',
  concentration: false,
  casting_time: '1 action',
  level: 3,
  school: ref('evocation', 'Evocation'),
  classes: [ref('sorcerer', 'Sorcerer'), ref('wizard', 'Wizard')],
};

const asi = (classe: string, level: number, desc = ['Increase one ability score by 2.']): Registro => ({
  index: `${classe}-ability-score-improvement-${level}`,
  name: 'Ability Score Improvement',
  class: ref(classe, classe[0].toUpperCase() + classe.slice(1)),
  level,
  prerequisites: [],
  desc,
});

describe('itens', () => {
  it('converte uma arma, com dano versátil e moeda traduzida', () => {
    const entrada = converterEquipamento(longsword);
    expect(entrada).toMatchObject({
      id: 'srd-5.1/equipamento/longsword',
      nome: 'Longsword',
      origem: { tipo: 'pacote', pacote: 'srd-5.1' },
      visibilidade: { tipo: 'todos' },
      etiquetas: ['Weapon', 'Martial Weapons'],
      dados: {
        categoria: 'arma',
        peso: 1.5,
        custo: { quantidade: 15, moeda: 'po' },
        arma: { dominio: 'marcial', alcanceTipo: 'corpo-a-corpo', dano: '1d8', danoVersatil: '1d10', alcance: null },
        armadura: null,
      },
    });
  });

  it('guarda o alcance das armas à distância', () => {
    expect(converterEquipamento(longbow).dados.arma).toMatchObject({
      alcanceTipo: 'distancia',
      alcance: { normal: 150, longo: 600 },
    });
  });

  it('platina do SRD ("pp") vira "pl", e prata ("sp") vira "pp"', () => {
    expect(converterEquipamento({ ...longsword, cost: { quantity: 1, unit: 'pp' } }).dados.custo?.moeda).toBe('pl');
    expect(converterEquipamento({ ...longsword, cost: { quantity: 1, unit: 'sp' } }).dados.custo?.moeda).toBe('pp');
  });

  it('converte uma armadura pesada', () => {
    expect(converterEquipamento(chainMail).dados).toMatchObject({
      categoria: 'armadura',
      armadura: { peso: 'pesada', caBase: 16, usaDestreza: false, forcaMinima: 13, desvantagemFurtividade: true },
    });
  });

  it('converte um item mágico, lendo a sintonia na primeira linha', () => {
    const entrada = converterItemMagico({
      index: 'flame-tongue',
      name: 'Flame Tongue',
      equipment_category: ref('weapon', 'Weapon'),
      rarity: { name: 'Rare' },
      variants: [],
      variant: false,
      desc: ['Weapon (any sword), rare (requires attunement)', 'Flames erupt from the blade.'],
    });
    expect(entrada.dados).toMatchObject({ categoria: 'arma', raridade: 'raro', requerSintonia: true });
    expect(entrada.descricao).toBe('Weapon (any sword), rare (requires attunement)\n\nFlames erupt from the blade.');
  });

  it('recusa valores desconhecidos em vez de inventar', () => {
    expect(() => converterEquipamento({ ...longsword, cost: { quantity: 1, unit: 'xx' } })).toThrow('desconhecido');
  });
});

describe('pacotes de equipamento viram kits', () => {
  const pacote = {
    index: 'explorers-pack',
    name: "Explorer's Pack",
    contents: [
      { item: { index: 'backpack', name: 'Backpack' }, quantity: 1 },
      { item: { index: 'torch', name: 'Torch' }, quantity: 10 },
    ],
  };

  it('o kit tem os mesmos itens, sem classe e só para o mestre', () => {
    const kit = converterKit(pacote);
    expect(kit).toMatchObject({ id: 'srd-5.1/kit/explorers-pack', tipo: 'kit', nome: "Explorer's Pack", visibilidade: { tipo: 'mestre' } });
    expect(kit.dados.itens).toEqual([
      { entradaId: 'srd-5.1/equipamento/backpack', quantidade: 1 },
      { entradaId: 'srd-5.1/equipamento/torch', quantidade: 10 },
    ]);
    expect(kit.dados.classes).toEqual([]);
  });

  it('só equipamentos com conteúdo são pacotes', () => {
    expect(ehPacoteDeEquipamento(pacote)).toBe(true);
    expect(ehPacoteDeEquipamento({ index: 'backpack', contents: [] })).toBe(false);
  });
});

describe('magias', () => {
  it('converte componentes, classes e o texto de nível superior', () => {
    const entrada = converterMagia(fireball);
    expect(entrada.dados).toEqual({
      nivel: 3,
      escola: 'evocacao',
      tempoConjuracao: '1 action',
      alcance: '150 feet',
      componentes: { verbal: true, somatico: true, material: 'A tiny ball of bat guano and sulfur.' },
      duracao: 'Instantaneous',
      concentracao: false,
      ritual: false,
      classes: ['srd-5.1/classe/sorcerer', 'srd-5.1/classe/wizard'],
    });
    expect(entrada.descricao).toBe(
      'A bright streak flashes from your pointing finger.\n\nThe fire spreads around corners.\n\nAt Higher Levels. The damage increases by 1d6 for each slot level above 3rd.',
    );
    expect(entrada.etiquetas).toEqual(['Sorcerer', 'Wizard']);
  });
});

describe('características de classe', () => {
  const caracteristicas = [asi('barbarian', 4), asi('barbarian', 8), asi('bard', 4), asi('fighter', 6, ['Outro texto.'])];

  it('junta as idênticas e lista quem as tem', () => {
    const { grupos, idFinal } = agruparCaracteristicas(caracteristicas);
    expect(grupos).toHaveLength(2);
    expect(idFinal.get('bard-ability-score-improvement-4')).toBe('srd-5.1/caracteristica/barbarian-ability-score-improvement-4');
    expect(converterCaracteristica(grupos[0]).dados.requisito).toBe('Barbarian 4, 8; Bard 4');
  });

  it('a classe aponta para a característica juntada', () => {
    const { idFinal } = agruparCaracteristicas(caracteristicas);
    const classe = converterClasse(
      {
        index: 'bard',
        name: 'Bard',
        hit_die: 8,
        saving_throws: [ref('dex', 'DEX'), ref('cha', 'CHA')],
        proficiencies: [ref('light-armor', 'Light Armor'), ref('saving-throw-dex', 'Saving Throw: DEX')],
        proficiency_choices: [
          {
            desc: 'Choose any three',
            choose: 3,
            from: { options: [{ option_type: 'reference', item: ref('skill-acrobatics', 'Skill: Acrobatics') }, { option_type: 'reference', item: ref('skill-arcana', 'Skill: Arcana') }] },
          },
          { desc: 'Three musical instruments', choose: 3, from: { options: [{ option_type: 'reference', item: ref('lute', 'Lute') }] } },
        ],
        spellcasting: { spellcasting_ability: ref('cha', 'CHA'), info: [{ name: 'Cantrips', desc: ['You know two.'] }] },
      },
      caracteristicas,
      idFinal,
    );
    expect(classe.dados).toEqual({
      dadoVida: 8,
      salvaguardas: ['des', 'car'],
      proficiencias: ['Light Armor', 'Three musical instruments'],
      habilidades: [{ nivel: 4, entradaId: 'srd-5.1/caracteristica/barbarian-ability-score-improvement-4' }],
      atributoConjuracao: 'car',
      tabela: [],
      // A escolha de perícias vira dado; a de instrumentos continua como texto.
      escolhaPericias: { quantidade: 3, opcoes: ['Skill: Acrobatics', 'Skill: Arcana'] },
      niveisDeAumento: [],
    });
    expect(classe.descricao).toBe('Cantrips. You know two.');
  });
});

describe('tabelas de nível', () => {
  const nivel = (level: number, class_specific: Registro, spellcasting?: Registro): Registro => ({
    level,
    class: ref('rogue', 'Rogue'),
    class_specific,
    ...(spellcasting ? { spellcasting } : {}),
  });
  const vinte = (fazer: (n: number) => Registro) => Array.from({ length: 20 }, (_, i) => fazer(i + 1));

  it('converte colunas com nome em português, dados e "ilimitado"', () => {
    const niveis = vinte((n) =>
      nivel(n, {
        sneak_attack: { dice_count: Math.ceil(n / 2), dice_value: 6 },
        rage_count: n === 20 ? 9999 : 2,
        wild_shape_fly: n >= 8,
      }),
    );
    const tabela = converterTabela('rogue', niveis);
    expect(tabela.map((c) => [c.id, c.nome])).toEqual([
      ['ataque_furtivo', 'Ataque furtivo'],
      ['furias', 'Fúrias'],
      ['forma_selvagem_voar', 'Forma selvagem: voar'],
    ]);
    expect(tabela[0].valores.slice(0, 5)).toEqual(['1d6', '1d6', '2d6', '2d6', '3d6']);
    expect(tabela[1].valores[19]).toBe('ilimitado');
    expect(tabela[2].valores[7]).toBe('1');
  });

  it('deixa de fora colunas sempre zeradas, e linhas de subclasse', () => {
    const niveis = [
      ...vinte((n) => nivel(n, {}, { spell_slots_level_1: n >= 2 ? 2 : 0, spell_slots_level_6: 0 })),
      { ...nivel(3, { rage_count: 5 }), subclass: ref('thief', 'Thief') },
    ];
    expect(converterTabela('rogue', niveis).map((c) => c.id)).toEqual(['espacos_1']);
  });

  it('recusa colunas desconhecidas e níveis faltando', () => {
    expect(() => converterTabela('rogue', vinte((n) => nivel(n, { coisa_nova: 1 })))).toThrow('desconhecida');
    expect(() => converterTabela('rogue', [nivel(1, {})])).toThrow('níveis de 1 a 20');
  });

  it('classe sem tabela fica com a tabela vazia', () => {
    expect(converterTabela('rogue', [])).toEqual([]);
  });

  it('os usos da Fúria leem a tabela, e a conferência aponta colunas que faltam', () => {
    const rage = converterCaracteristica([{ ...asi('barbarian', 1), index: 'rage', name: 'Rage' }]);
    expect(rage.dados.usos).toEqual({ maximo: 'tabela(furias)', recarga: 'descanso-longo' });
    const barbaro = converterClasse(
      { index: 'barbarian', name: 'Barbarian', hit_die: 12, saving_throws: [] },
      [{ ...asi('barbarian', 1), index: 'rage', name: 'Rage' }],
      new Map([['rage', rage.id]]),
      [],
    );
    const pacote = { ...converterSrd(fontesVazias()), entradas: [rage, barbaro] };
    expect(formulasQuebradas(pacote)).toEqual([
      'srd-5.1/caracteristica/rage, usos: A tabela da classe não tem a coluna "furias".',
    ]);
  });
});

describe('níveis de aumento de atributo', () => {
  it('conta cada vez que a contagem acumulada passa do maior valor, apesar do erro do ladino na base', () => {
    const contagens = [0, 0, 0, 1, 1, 1, 1, 2, 2, 3, 2, 4, 3, 3, 3, 5, 4, 4, 6, 5];
    const niveis = contagens.map((n, i) => ({ level: i + 1, class: ref('rogue', 'Rogue'), ability_score_bonuses: n }));
    expect(niveisDeAumento('rogue', niveis)).toEqual([4, 8, 10, 12, 16, 19]);
    expect(niveisDeAumento('wizard', niveis)).toEqual([]);
  });
});

describe('espécies', () => {
  it('a sub-espécie soma os aumentos e os traços da principal', () => {
    const anao = {
      index: 'dwarf',
      name: 'Dwarf',
      speed: 25,
      size: 'Medium',
      ability_bonuses: [{ ability_score: ref('con', 'CON'), bonus: 2 }],
      languages: [ref('common', 'Common')],
      traits: [ref('darkvision', 'Darkvision')],
    };
    const entrada = converterSubespecie(
      {
        index: 'hill-dwarf',
        name: 'Hill Dwarf',
        race: ref('dwarf', 'Dwarf'),
        desc: 'Keen senses.',
        ability_bonuses: [{ ability_score: ref('wis', 'WIS'), bonus: 1 }],
        racial_traits: [ref('dwarven-toughness', 'Dwarven Toughness')],
      },
      [anao],
    );
    expect(entrada.dados).toEqual({
      tamanho: 'medio',
      deslocamento: 25,
      aumentosAtributo: { con: 2, sab: 1 },
      idiomas: ['Common'],
      tracos: ['srd-5.1/traco/darkvision', 'srd-5.1/traco/dwarven-toughness'],
    });
  });
});

describe('monstros', () => {
  it('converte a ficha inteira e fica só com o mestre', () => {
    const entrada = converterMonstro(goblin);
    expect(entrada.visibilidade).toEqual({ tipo: 'mestre' });
    expect(entrada.etiquetas).toEqual(['humanoid', 'CR 1/4']);
    expect(entrada.dados).toEqual({
      tamanho: 'pequeno',
      tipoCriatura: 'humanoid (goblinoid)',
      alinhamento: 'neutral evil',
      classeArmadura: 15,
      notaArmadura: 'Leather Armor, Shield',
      pontosVida: 7,
      dadosVida: '2d6',
      deslocamento: '30 ft.',
      atributos: { for: 8, des: 14, con: 10, int: 10, sab: 8, car: 8 },
      salvaguardas: { des: 4 },
      pericias: { Stealth: 6 },
      vulnerabilidades: [],
      resistencias: ['poison'],
      imunidades: [],
      imunidadesCondicao: ['Charmed'],
      sentidos: 'darkvision 60 ft., passive Perception 9',
      idiomas: 'Common, Goblin',
      nivelDesafio: 0.25,
      experiencia: 50,
      tracos: [{ nome: 'Nimble Escape', descricao: 'The goblin can take the Disengage or Hide action.' }],
      acoesDeCombate: [{ nome: 'Scimitar', descricao: 'Melee Weapon Attack: +4 to hit.' }],
      reacoes: [],
      acoesLendarias: [],
    });
  });

  it('mostra recargas e usos por dia no nome da ação', () => {
    expect(formatarUso({ type: 'recharge on roll', dice: '1d6', min_value: 5 })).toBe('Recharge 5–6');
    expect(formatarUso({ type: 'per day', times: 3 })).toBe('3/Day');
    expect(formatarUso({ type: 'recharge after rest', rest_types: ['short', 'long'] })).toBe(
      'Recharges after a short or long rest',
    );
    const comSopro = converterMonstro({
      ...goblin,
      actions: [{ name: 'Fire Breath', desc: '...', usage: { type: 'recharge on roll', dice: '1d6', min_value: 5 } }],
    });
    expect(comSopro.dados.acoesDeCombate[0].nome).toBe('Fire Breath (Recharge 5–6)');
  });

  it('escreve o nível de desafio como nos livros', () => {
    expect([0.125, 0.25, 0.5, 1, 17].map(formatarNivelDesafio)).toEqual(['1/8', '1/4', '1/2', '1', '17']);
  });
});

describe('juntarTexto', () => {
  it('separa parágrafos e mantém listas e tabelas coladas', () => {
    expect(juntarTexto(['Intro.', '- um', '- dois', 'Fim.'])).toBe('Intro.\n\n- um\n- dois\n\nFim.');
    expect(juntarTexto(['| a | b |', '| 1 | 2 |'])).toBe('| a | b |\n| 1 | 2 |');
    expect(juntarTexto('Só um texto.')).toBe('Só um texto.');
    expect(juntarTexto(undefined)).toBe('');
  });
});

describe('converterSrd', () => {
  const fontes: Fontes = {
    ...fontesVazias(),
    Equipment: [longsword, chainMail],
    Spells: [fireball],
    Monsters: [goblin],
  };

  it('gera um pacote que passa no verificador do programa e traz os créditos', () => {
    const pacote = converterSrd(fontes);
    expect(pacote.creditos).toContain(CREDITO_SRD);
    expect(lerPacote(JSON.stringify(pacoteParaObjeto(pacote)))).toMatchObject({ ok: true });
  });

  it('aponta referências para entradas que não estão no pacote', () => {
    // A Fireball cita as classes, que não vieram nestas fontes.
    expect(referenciasQuebradas(converterSrd(fontes))).toEqual([
      'srd-5.1/magia/fireball → srd-5.1/classe/sorcerer',
      'srd-5.1/magia/fireball → srd-5.1/classe/wizard',
    ]);
  });

  it('diz qual registro falhou', () => {
    expect(() => converterSrd({ ...fontes, Monsters: [{ ...goblin, size: 'Colossal' }] })).toThrow('Monsters, "goblin"');
  });
});

/**
 * Converte os dados do SRD 5.1, organizados pelo projeto 5e-bits, para entradas do compêndio.
 * Funções puras: quem baixa e grava os arquivos é o `gerar-srd.mjs`.
 */
import {
  NIVEIS_DA_TABELA,
  type Atributo,
  type BlocoDeTexto,
  type ColunaTabela,
  type DadosArma,
  type DadosArmadura,
  type DadosHabilidade,
  type AcaoDeEntrada,
  type DadosItem,
  type Efeito,
  type Entrada,
  type EntradaDe,
  type MOEDAS,
  type TipoEntrada,
} from '../../src/core/entradas';
import type { Credito, Pacote } from '../../src/core/pacotes';
import { NOME_NIVEL_DA_CLASSE, NOME_NIVEL_DO_ESPACO, nomesDasRegras, problemaNaFormula } from '../../src/core/regras';
import { REGRAS_PADRAO } from '../../src/core/regrasPadrao';
import { entradaParaMetrico } from '../../src/core/persistenciaCompendio';
import { librasParaQuilos } from '../../src/core/unidades';
import { SO_MESTRE, VISIVEL_A_TODOS } from '../../src/core/visibilidade';

export const ID_PACOTE = 'srd-5.1';

/** Versão fixa da base do 5e-bits: a conversão sempre dá o mesmo resultado. */
export const COMMIT_5E_BITS = '175d30345dfbcff69aa37db217fdcf3d4a4078e6';

export const ARQUIVOS_FONTE = [
  'Equipment',
  'Magic-Items',
  'Spells',
  'Features',
  'Traits',
  'Classes',
  'Levels',
  'Races',
  'Subraces',
  'Backgrounds',
  'Feats',
  'Conditions',
  'Monsters',
] as const;
export type ArquivoFonte = (typeof ARQUIVOS_FONTE)[number];

/** O conteúdo de cada arquivo da base, como veio do 5e-bits. */
export type Fontes = Readonly<Record<ArquivoFonte, readonly Registro[]>>;

/**
 * Um registro da base. O formato vem de fora e varia por arquivo; o pacote gerado
 * passa depois pelo mesmo verificador rigoroso do compêndio.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Registro = Record<string, any>;

/** A frase exigida pela licença CC-BY 4.0, copiada do PDF oficial do SRD 5.1. */
export const CREDITO_SRD: Credito = {
  titulo: 'System Reference Document 5.1',
  texto:
    'This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.',
};

export const CREDITO_ADAPTACAO: Credito = {
  titulo: 'Adaptação',
  texto:
    'O conteúdo do SRD 5.1 foi reorganizado no formato do KeikowVTT: os campos foram separados e traduzidos para a interface, e as descrições mantêm o texto original em inglês. As medidas foram convertidas para o sistema métrico, como na edição brasileira (1 pé = 0,3 m, 1 libra = 0,5 kg, 1 milha = 1,5 km).',
};

export const CREDITO_5E_BITS: Credito = {
  titulo: 'Dados organizados pelo projeto 5e-bits (5e-database)',
  texto: `https://github.com/5e-bits/5e-srd-api, versão ${COMMIT_5E_BITS.slice(0, 7)}, sob a licença MIT:

MIT License

Copyright (c) [2018-2020] [Adrian Padua, Christopher Ward]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
};

export const CREDITOS = [CREDITO_SRD, CREDITO_ADAPTACAO, CREDITO_5E_BITS] as const;

// ---------- Tabelas de tradução dos valores da base ----------

const ATRIBUTO: Readonly<Record<string, Atributo>> = {
  str: 'for',
  dex: 'des',
  con: 'con',
  int: 'int',
  wis: 'sab',
  cha: 'car',
};

const NOME_DO_ATRIBUTO: Readonly<Record<string, string>> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

/** Cuidado: no SRD, "pp" é platina; aqui, "pp" é prata. */
const MOEDA: Readonly<Record<string, (typeof MOEDAS)[number]>> = {
  cp: 'pc',
  sp: 'pp',
  ep: 'pe',
  gp: 'po',
  pp: 'pl',
};

const TAMANHO = {
  Tiny: 'miudo',
  Small: 'pequeno',
  Medium: 'medio',
  Large: 'grande',
  Huge: 'enorme',
  Gargantuan: 'imenso',
} as const;

const ESCOLA = {
  abjuration: 'abjuracao',
  divination: 'adivinhacao',
  conjuration: 'conjuracao',
  enchantment: 'encantamento',
  evocation: 'evocacao',
  illusion: 'ilusao',
  necromancy: 'necromancia',
  transmutation: 'transmutacao',
} as const;

const RARIDADE = {
  Common: 'comum',
  Uncommon: 'incomum',
  Rare: 'raro',
  'Very Rare': 'muito-raro',
  Legendary: 'lendario',
  Artifact: 'artefato',
  Varies: 'variada',
} as const;

const PESO_ARMADURA = { Light: 'leve', Medium: 'media', Heavy: 'pesada', Shield: 'escudo' } as const;

// ---------- Ajudantes ----------

class ErroDeConversao extends Error {}

function exigirValor<T>(valor: T | undefined | null, onde: string): T {
  if (valor === undefined || valor === null) {
    throw new ErroDeConversao(`Valor faltando em ${onde}.`);
  }
  return valor;
}

function traduzir<T extends string>(tabela: Readonly<Record<string, T>>, chave: unknown, onde: string): T {
  const valor = typeof chave === 'string' ? tabela[chave] : undefined;
  if (valor === undefined) {
    throw new ErroDeConversao(`Valor desconhecido em ${onde}: ${String(chave)}`);
  }
  return valor;
}

function id(tipo: string, indice: string): string {
  return `${ID_PACOTE}/${tipo}/${indice}`;
}

/** Junta os parágrafos da base. Linhas seguidas de lista ou tabela ficam coladas. */
export function juntarTexto(partes: unknown): string {
  const linhas = (Array.isArray(partes) ? partes : partes ? [partes] : []).filter(
    (linha): linha is string => typeof linha === 'string' && linha.trim() !== '',
  );
  const ehContinuacao = (linha: string) => /^\s*(\||- |\* |•)/.test(linha);
  return linhas
    .map((linha, i) => (i === 0 ? linha : (ehContinuacao(linha) && ehContinuacao(linhas[i - 1]) ? '\n' : '\n\n') + linha))
    .join('');
}

function nomes(referencias: unknown): string[] {
  return Array.isArray(referencias) ? referencias.map((r: Registro) => String(r.name)) : [];
}

function semRepetir(lista: readonly string[]): string[] {
  return [...new Set(lista.filter((item) => item !== ''))];
}

/** 0,25 vira "1/4", como nos livros. */
export function formatarNivelDesafio(nd: number): string {
  const fracoes: Record<number, string> = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };
  return fracoes[nd] ?? String(nd);
}

type Base<T extends TipoEntrada> = Omit<EntradaDe<T>, 'dados'>;

function base<T extends TipoEntrada>(
  tipo: T,
  entradaId: string,
  nome: string,
  descricao: string,
  etiquetas: readonly string[],
  soMestre = false,
): Base<T> {
  return {
    id: entradaId,
    tipo,
    nome,
    descricao,
    etiquetas: semRepetir(etiquetas),
    origem: { tipo: 'pacote', pacote: ID_PACOTE },
    // Regras e itens do SRD são de todos; fichas de monstro ficam com o mestre.
    visibilidade: soMestre ? SO_MESTRE : VISIVEL_A_TODOS,
    efeitos: [],
    acoes: [],
  };
}

function custo(registro: Registro): DadosItem['custo'] {
  const c = registro.cost;
  if (!c || typeof c.quantity !== 'number') {
    return null;
  }
  return { quantidade: c.quantity, moeda: traduzir(MOEDA, c.unit, `custo de ${registro.index}`) };
}

// ---------- Itens ----------

function arma(registro: Registro): DadosArma {
  const aDistancia = registro.weapon_range === 'Ranged';
  const faixa = aDistancia ? registro.range : registro.throw_range;
  return {
    dominio: registro.weapon_category === 'Simple' ? 'simples' : 'marcial',
    alcanceTipo: aDistancia ? 'distancia' : 'corpo-a-corpo',
    dano: registro.damage?.damage_dice ?? '',
    tipoDano: registro.damage?.damage_type?.name ?? '',
    danoVersatil: registro.two_handed_damage?.damage_dice ?? null,
    alcance: faixa && typeof faixa.normal === 'number' ? { normal: faixa.normal, longo: faixa.long ?? null } : null,
    propriedades: nomes(registro.properties),
  };
}

function armadura(registro: Registro): DadosArmadura {
  const ca = exigirValor(registro.armor_class, `CA de ${registro.index}`);
  return {
    peso: traduzir(PESO_ARMADURA, registro.armor_category, `armadura ${registro.index}`),
    caBase: ca.base,
    usaDestreza: Boolean(ca.dex_bonus),
    destrezaMaxima: ca.dex_bonus && typeof ca.max_bonus === 'number' ? ca.max_bonus : null,
    forcaMinima: registro.str_minimum ?? 0,
    desvantagemFurtividade: Boolean(registro.stealth_disadvantage),
  };
}

function categoriaDoEquipamento(registro: Registro): DadosItem['categoria'] {
  switch (registro.equipment_category?.index) {
    case 'weapon':
      return 'arma';
    case 'armor':
      return registro.armor_category === 'Shield' ? 'escudo' : 'armadura';
    case 'tools':
      return 'ferramenta';
    case 'mounts-and-vehicles':
      return 'montaria';
    case 'adventuring-gear':
      return registro.gear_category?.index === 'ammunition' ? 'municao' : 'equipamento';
    default:
      throw new ErroDeConversao(`Categoria desconhecida em ${registro.index}.`);
  }
}

function descricaoDoEquipamento(registro: Registro): string {
  const partes = [juntarTexto(registro.desc), juntarTexto(registro.special)];
  if (Array.isArray(registro.contents) && registro.contents.length > 0) {
    partes.push(
      `Contents: ${registro.contents.map((c: Registro) => `${c.quantity} × ${c.item?.name}`).join(', ')}.`,
    );
  }
  if (registro.speed) {
    partes.push(`Speed: ${registro.speed.quantity} ${registro.speed.unit}.`);
  }
  if (registro.capacity) {
    partes.push(`Carrying capacity: ${registro.capacity}.`);
  }
  if (typeof registro.quantity === 'number' && registro.quantity > 1) {
    partes.push(`Sold in a bundle of ${registro.quantity}.`);
  }
  return partes.filter((p) => p !== '').join('\n\n');
}

export function converterEquipamento(registro: Registro): EntradaDe<'item'> {
  const categoria = categoriaDoEquipamento(registro);
  return {
    ...base('item', id('equipamento', registro.index), registro.name, descricaoDoEquipamento(registro), nomes(registro.equipment_categories)),
    efeitos: efeitosProntos(registro.index),
    dados: {
      categoria,
      peso: librasParaQuilos(registro.weight ?? 0),
      custo: custo(registro),
      raridade: null,
      requerSintonia: false,
      empilhavel: categoria === 'municao' || typeof registro.quantity === 'number',
      arma: categoria === 'arma' ? arma(registro) : null,
      armadura: categoria === 'armadura' || categoria === 'escudo' ? armadura(registro) : null,
    },
  };
}

function categoriaDoItemMagico(registro: Registro): DadosItem['categoria'] {
  switch (registro.equipment_category?.index) {
    case 'armor':
      return /shield/i.test(registro.name) ? 'escudo' : 'armadura';
    case 'weapon':
      return 'arma';
    case 'ammunition':
      return 'municao';
    case 'potion':
    case 'scroll':
      return 'consumivel';
    case 'ring':
    case 'rod':
    case 'staff':
    case 'wand':
    case 'wondrous-items':
      return 'equipamento';
    default:
      throw new ErroDeConversao(`Categoria desconhecida em ${registro.index}.`);
  }
}

/**
 * Um item mágico. Os "grupos" com variantes (como "Ammunition, +1, +2, or +3")
 * ficam de fora: cada variante concreta vira uma entrada.
 */
export function converterItemMagico(registro: Registro): EntradaDe<'item'> {
  const categoria = categoriaDoItemMagico(registro);
  const linhas: string[] = Array.isArray(registro.desc) ? registro.desc : [];
  return {
    ...base('item', id('item-magico', registro.index), registro.name, juntarTexto(linhas), [
      registro.equipment_category?.name ?? '',
      'Magic Item',
    ]),
    efeitos: efeitosProntos(registro.index),
    acoes: CURA_DAS_POCOES[registro.index]
      ? [
          acao(`item-magico/${registro.index}`, 1, 'Beber', [
            { tipo: 'curar', formula: CURA_DAS_POCOES[registro.index] },
            { tipo: 'consumir', quantidade: 1 },
          ]),
        ]
      : [],
    dados: {
      categoria,
      peso: 0,
      custo: null,
      raridade: traduzir(RARIDADE, registro.rarity?.name, `raridade de ${registro.index}`),
      requerSintonia: /requires attunement/i.test(linhas[0] ?? ''),
      empilhavel: categoria === 'consumivel' || categoria === 'municao',
      arma: null,
      armadura: null,
    },
  };
}

// ---------- Magias ----------

export function converterMagia(registro: Registro): EntradaDe<'magia'> {
  const componentes: string[] = registro.components ?? [];
  const nivelAlto = juntarTexto(registro.higher_level);
  const descricao = [juntarTexto(registro.desc), nivelAlto && `At Higher Levels. ${nivelAlto}`]
    .filter(Boolean)
    .join('\n\n');
  return {
    ...base('magia', id('magia', registro.index), registro.name, descricao, nomes(registro.classes)),
    acoes: acoesDaMagia(registro),
    dados: {
      nivel: registro.level,
      escola: traduzir(ESCOLA, registro.school?.index, `escola de ${registro.index}`),
      tempoConjuracao: registro.casting_time ?? '',
      alcance: registro.range ?? '',
      componentes: {
        verbal: componentes.includes('V'),
        somatico: componentes.includes('S'),
        material: componentes.includes('M') ? (registro.material ?? '') : null,
      },
      duracao: registro.duration ?? '',
      concentracao: Boolean(registro.concentration),
      ritual: Boolean(registro.ritual),
      classes: (registro.classes ?? []).map((c: Registro) => id('classe', c.index)),
    },
  };
}

// ---------- Habilidades ----------

function nomePelaUrl(url: unknown): string {
  const ultimo = typeof url === 'string' ? (url.split('/').pop() ?? '') : '';
  return ultimo.replace(/-/g, ' ');
}

function textoDosPrerequisitos(prerequisitos: unknown): string {
  if (!Array.isArray(prerequisitos)) {
    return '';
  }
  return prerequisitos
    .map((p: Registro) => {
      switch (p.type) {
        case 'level':
          return `level ${p.level}`;
        case 'spell':
          return `spell ${nomePelaUrl(p.spell)}`;
        case 'feature':
          return `feature ${nomePelaUrl(p.feature)}`;
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Junta as características de classe idênticas (mesmo nome e texto), como "Ability Score Improvement",
 * que se repete em cada classe e nível. Devolve os grupos e o id final de cada característica.
 */
export function agruparCaracteristicas(caracteristicas: readonly Registro[]): {
  readonly grupos: Registro[][];
  readonly idFinal: ReadonlyMap<string, string>;
} {
  const porConteudo = new Map<string, Registro[]>();
  for (const registro of caracteristicas) {
    const chave = `${registro.name}\u0000${JSON.stringify(registro.desc)}`;
    const grupo = porConteudo.get(chave);
    if (grupo) {
      grupo.push(registro);
    } else {
      porConteudo.set(chave, [registro]);
    }
  }
  const grupos = [...porConteudo.values()];
  const idFinal = new Map<string, string>();
  for (const grupo of grupos) {
    for (const registro of grupo) {
      idFinal.set(registro.index, id('caracteristica', grupo[0].index));
    }
  }
  return { grupos, idFinal };
}

/** Uma característica de classe, ou um grupo de características idênticas. */
export function converterCaracteristica(grupo: readonly Registro[]): EntradaDe<'habilidade'> {
  const [primeira] = grupo;
  const niveisPorDono = new Map<string, number[]>();
  for (const registro of grupo) {
    const dono = `${registro.class?.name ?? ''}${registro.subclass ? ` (${registro.subclass.name})` : ''}`;
    niveisPorDono.set(dono, [...(niveisPorDono.get(dono) ?? []), registro.level]);
  }
  const prerequisitos = textoDosPrerequisitos(primeira.prerequisites);
  const requisito =
    [...niveisPorDono].map(([dono, niveis]) => `${dono} ${niveis.sort((a, b) => a - b).join(', ')}`).join('; ') +
    (prerequisitos ? `; prerequisite: ${prerequisitos}` : '');
  return {
    ...base('habilidade', id('caracteristica', primeira.index), primeira.name, juntarTexto(primeira.desc), [
      ...grupo.flatMap((r) => [r.class?.name ?? '', r.subclass?.name ?? '']),
      'Class Feature',
    ]),
    efeitos: grupo.flatMap((r) => efeitosProntos(r.index)),
    dados: { requisito, usos: USOS[primeira.index] ?? null },
  };
}

export function converterTraco(registro: Registro): EntradaDe<'habilidade'> {
  const donos = [...nomes(registro.races), ...nomes(registro.subraces)];
  return {
    ...base('habilidade', id('traco', registro.index), registro.name, juntarTexto(registro.desc), [
      ...donos,
      'Racial Trait',
    ]),
    efeitos: efeitosProntos(registro.index),
    dados: { requisito: donos.join(', '), usos: null },
  };
}

// ---------- Tabelas de nível ----------

type Formatador = (valor: unknown) => string;
const numero: Formatador = (valor) => (valor === 9999 ? 'ilimitado' : typeof valor === 'number' ? String(valor) : '');
const dado: Formatador = (valor) => (typeof valor === 'number' ? `1d${valor}` : '');
const grupoDeDados: Formatador = (valor) => {
  const v = valor as Registro | undefined;
  return v && typeof v.dice_count === 'number' ? `${v.dice_count}d${v.dice_value}` : '';
};
const simNao: Formatador = (valor) => (valor === true ? '1' : valor === false ? '0' : '');

/** Cada coluna da base: id usado nas fórmulas, nome em português e como escrever o valor. */
const COLUNAS: Readonly<Record<string, { readonly id: string; readonly nome: string; readonly formatar: Formatador } | null>> = {
  rage_count: { id: 'furias', nome: 'Fúrias', formatar: numero },
  rage_damage_bonus: { id: 'dano_furia', nome: 'Dano da fúria', formatar: numero },
  brutal_critical_dice: { id: 'critico_brutal', nome: 'Crítico brutal (dados)', formatar: numero },
  bardic_inspiration_die: { id: 'inspiracao_bardica', nome: 'Inspiração de bardo', formatar: dado },
  song_of_rest_die: { id: 'cancao_descanso', nome: 'Canção de descanso', formatar: dado },
  magical_secrets_max_5: { id: 'segredos_magicos_5', nome: 'Segredos mágicos (até 5º)', formatar: numero },
  magical_secrets_max_7: { id: 'segredos_magicos_7', nome: 'Segredos mágicos (até 7º)', formatar: numero },
  magical_secrets_max_9: { id: 'segredos_magicos_9', nome: 'Segredos mágicos (até 9º)', formatar: numero },
  channel_divinity_charges: { id: 'canalizar_divindade', nome: 'Canalizar divindade', formatar: numero },
  destroy_undead_cr: { id: 'destruir_mortos_vivos', nome: 'Destruir mortos-vivos (ND)', formatar: numero },
  wild_shape_max_cr: { id: 'forma_selvagem_nd', nome: 'Forma selvagem (ND máximo)', formatar: numero },
  wild_shape_swim: { id: 'forma_selvagem_nadar', nome: 'Forma selvagem: nadar', formatar: simNao },
  wild_shape_fly: { id: 'forma_selvagem_voar', nome: 'Forma selvagem: voar', formatar: simNao },
  action_surges: { id: 'surto_de_acao', nome: 'Surto de ação', formatar: numero },
  indomitable_uses: { id: 'indomavel', nome: 'Indomável', formatar: numero },
  extra_attacks: { id: 'ataques_extras', nome: 'Ataques extras', formatar: numero },
  martial_arts: { id: 'artes_marciais', nome: 'Artes marciais', formatar: grupoDeDados },
  ki_points: { id: 'pontos_ki', nome: 'Pontos de ki', formatar: numero },
  unarmored_movement: { id: 'movimento_sem_armadura', nome: 'Movimento sem armadura (pés)', formatar: numero },
  aura_range: { id: 'alcance_aura', nome: 'Alcance da aura (pés)', formatar: numero },
  favored_enemies: { id: 'inimigos_favoritos', nome: 'Inimigos favoritos', formatar: numero },
  favored_terrain: { id: 'terrenos_favoritos', nome: 'Terrenos favoritos', formatar: numero },
  sneak_attack: { id: 'ataque_furtivo', nome: 'Ataque furtivo', formatar: grupoDeDados },
  sorcery_points: { id: 'pontos_feiticaria', nome: 'Pontos de feitiçaria', formatar: numero },
  metamagic_known: { id: 'metamagias', nome: 'Metamagias conhecidas', formatar: numero },
  // Uma tabela fixa de custos, igual em todos os níveis: fica no texto da habilidade.
  creating_spell_slots: null,
  invocations_known: { id: 'invocacoes', nome: 'Invocações conhecidas', formatar: numero },
  mystic_arcanum_level_6: { id: 'arcano_mistico_6', nome: 'Arcano místico (6º)', formatar: numero },
  mystic_arcanum_level_7: { id: 'arcano_mistico_7', nome: 'Arcano místico (7º)', formatar: numero },
  mystic_arcanum_level_8: { id: 'arcano_mistico_8', nome: 'Arcano místico (8º)', formatar: numero },
  mystic_arcanum_level_9: { id: 'arcano_mistico_9', nome: 'Arcano místico (9º)', formatar: numero },
  arcane_recovery_levels: { id: 'recuperacao_arcana', nome: 'Recuperação arcana (níveis)', formatar: numero },
  cantrips_known: { id: 'truques', nome: 'Truques conhecidos', formatar: numero },
  spells_known: { id: 'magias_conhecidas', nome: 'Magias conhecidas', formatar: numero },
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [
      `spell_slots_level_${n}`,
      { id: `espacos_${n}`, nome: `Espaços de ${n}º nível`, formatar: numero },
    ]),
  ),
};

/**
 * A tabela de nível de uma classe, a partir das linhas da base (uma por nível).
 * Colunas sempre vazias ou zeradas ficam de fora, como os espaços de 6º nível do paladino.
 */
/**
 * Os níveis em que a classe ganha aumento de atributo. A base traz a contagem acumulada por nível
 * (com um erro no ladino, que volta a contar menos no 11º): conta-se cada vez que ela passa do maior valor visto.
 */
export function niveisDeAumento(classe: string, niveis: readonly Registro[]): number[] {
  const linhas = niveis.filter((n) => n.class?.index === classe && !n.subclass).sort((a, b) => a.level - b.level);
  const resultado: number[] = [];
  let maior = 0;
  for (const linha of linhas) {
    const contagem = Number(linha.ability_score_bonuses ?? 0);
    if (contagem > maior) {
      resultado.push(linha.level);
      maior = contagem;
    }
  }
  return resultado;
}

export function converterTabela(classe: string, niveis: readonly Registro[]): ColunaTabela[] {
  const linhas = niveis
    .filter((n) => n.class?.index === classe && !n.subclass)
    .sort((a, b) => a.level - b.level);
  if (linhas.length === 0) {
    return [];
  }
  if (linhas.length !== NIVEIS_DA_TABELA || linhas.some((l, i) => l.level !== i + 1)) {
    throw new ErroDeConversao(`A tabela de ${classe} não tem os níveis de 1 a ${NIVEIS_DA_TABELA}.`);
  }
  const chaves: string[] = [];
  for (const linha of linhas) {
    for (const chave of [...Object.keys(linha.class_specific ?? {}), ...Object.keys(linha.spellcasting ?? {})]) {
      if (!chaves.includes(chave)) {
        chaves.push(chave);
      }
    }
  }
  const colunas: ColunaTabela[] = [];
  for (const chave of chaves) {
    if (!(chave in COLUNAS)) {
      throw new ErroDeConversao(`Coluna desconhecida na tabela de ${classe}: ${chave}`);
    }
    const coluna = COLUNAS[chave];
    if (!coluna) {
      continue;
    }
    const valores = linhas.map((l) => coluna.formatar((l.class_specific ?? {})[chave] ?? (l.spellcasting ?? {})[chave]));
    if (valores.some((v) => v !== '' && v !== '0')) {
      colunas.push({ id: coluna.id, nome: coluna.nome, valores });
    }
  }
  return colunas;
}

/** Usos de habilidades que o SRD descreve só no texto. Os que dependem do nível leem a tabela da classe. */
const USOS: Readonly<Record<string, DadosHabilidade['usos']>> = {
  rage: { maximo: 'tabela(furias)', recarga: 'descanso-longo' },
  'bardic-inspiration-d6': { maximo: 'max(1, mod(CAR))', recarga: 'descanso-longo' },
  // A partir do 5º nível, Fonte de Inspiração faz a Inspiração voltar no descanso curto.
  'bardic-inspiration-d8': { maximo: 'max(1, mod(CAR))', recarga: 'descanso-curto' },
  'bardic-inspiration-d10': { maximo: 'max(1, mod(CAR))', recarga: 'descanso-curto' },
  'bardic-inspiration-d12': { maximo: 'max(1, mod(CAR))', recarga: 'descanso-curto' },
  'channel-divinity-1-rest': { maximo: 'tabela(canalizar_divindade)', recarga: 'descanso-curto' },
  'channel-divinity-2-rest': { maximo: 'tabela(canalizar_divindade)', recarga: 'descanso-curto' },
  'channel-divinity-3-rest': { maximo: 'tabela(canalizar_divindade)', recarga: 'descanso-curto' },
  'channel-divinity': { maximo: '1', recarga: 'descanso-curto' },
  'action-surge-1-use': { maximo: 'tabela(surto_de_acao)', recarga: 'descanso-curto' },
  'action-surge-2-uses': { maximo: 'tabela(surto_de_acao)', recarga: 'descanso-curto' },
  'indomitable-1-use': { maximo: 'tabela(indomavel)', recarga: 'descanso-longo' },
  'indomitable-2-uses': { maximo: 'tabela(indomavel)', recarga: 'descanso-longo' },
  'indomitable-3-uses': { maximo: 'tabela(indomavel)', recarga: 'descanso-longo' },
  'second-wind': { maximo: '1', recarga: 'descanso-curto' },
  'wild-shape-cr-1-4-or-below-no-flying-or-swim-speed': { maximo: '2', recarga: 'descanso-curto' },
  'wild-shape-cr-1-2-or-below-no-flying-speed': { maximo: '2', recarga: 'descanso-curto' },
  'wild-shape-cr-1-or-below': { maximo: '2', recarga: 'descanso-curto' },
  ki: { maximo: 'tabela(pontos_ki)', recarga: 'descanso-curto' },
  'font-of-magic': { maximo: 'tabela(pontos_feiticaria)', recarga: 'descanso-longo' },
  'arcane-recovery': { maximo: '1', recarga: 'descanso-longo' },
  'divine-sense': { maximo: '1 + mod(CAR)', recarga: 'descanso-longo' },
  'lay-on-hands': { maximo: 'nivel_classe * 5', recarga: 'descanso-longo' },
};

// ---------- Ações prontas ----------

const CURA_DAS_POCOES: Readonly<Record<string, string>> = {
  'potion-of-healing-common': '2d4 + 2',
  'potion-of-healing-greater': '4d4 + 4',
  'potion-of-healing-superior': '8d4 + 8',
  'potion-of-healing-supreme': '10d4 + 20',
};

function acao(idBase: string, n: number, rotulo: string, passos: AcaoDeEntrada['passos']): AcaoDeEntrada {
  return { id: `${ID_PACOTE}/${idBase}/acao-${n}`, rotulo, passos };
}

/** O dado da base, como "1d8 + MOD", na linguagem das fórmulas: MOD é o modificador de conjuração. */
function dadoDaBase(texto: string): string {
  // "4d6 OR 5d6" (Flame Strike): o dano extra vai para um dos tipos, à escolha; fica a opção maior.
  const escolhido = texto.split(/\s+OR\s+/i).at(-1) ?? texto;
  return escolhido.replace(/\bMOD\b/g, 'mod(conjuracao)').trim();
}

/**
 * Uma fórmula que muda com um nível: `se(nivel >= 17, 4d10, se(nivel >= 11, 3d10, ...))`.
 * `porNivel` é como na base: { "1": "1d10", "5": "2d10", ... }.
 */
function escadaDeNiveis(nome: string, porNivel: Readonly<Record<string, string>>): string {
  const degraus = Object.entries(porNivel)
    .map(([nivel, dado]) => ({ nivel: Number(nivel), dado: dadoDaBase(dado) }))
    .sort((a, b) => a.nivel - b.nivel);
  return degraus
    .slice(1)
    .reduce((formula, { nivel, dado }) => `se(${nome} >= ${nivel}, ${dado}, ${formula})`, degraus[0]?.dado ?? '0');
}

const NOME_ATRIBUTO_DA_CD: Readonly<Record<string, string>> = { str: 'FOR', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR' };

/** As ações de uma magia: ataque mágico, dano (que sobe com o nível) e cura, quando a base as tem. */
export function acoesDaMagia(registro: Registro): AcaoDeEntrada[] {
  const acoes: AcaoDeEntrada[] = [];
  const idBase = `magia/${registro.index}`;
  if (registro.attack_type) {
    acoes.push(acao(idBase, acoes.length + 1, 'Ataque mágico', [{ tipo: 'rolar', formula: '1d20 + ataque_magico', rotulo: `${registro.name}: ataque` }]));
  }
  const salvaguarda = registro.dc?.dc_type?.index
    ? ` (salvaguarda de ${NOME_ATRIBUTO_DA_CD[registro.dc.dc_type.index] ?? registro.dc.dc_type.name}${registro.dc.dc_success === 'half' ? ', metade se passar' : ''})`
    : '';
  const danos: Registro[] = Array.isArray(registro.damage) ? registro.damage : registro.damage ? [registro.damage] : [];
  for (const dano of danos) {
    const formula = dano.damage_at_character_level
      ? escadaDeNiveis('nivel', dano.damage_at_character_level)
      : dano.damage_at_slot_level
        ? escadaDeNiveis(NOME_NIVEL_DO_ESPACO, dano.damage_at_slot_level)
        : null;
    if (formula) {
      const tipo = dano.damage_type?.name ? ` (${String(dano.damage_type.name).toLowerCase()})` : '';
      acoes.push(acao(idBase, acoes.length + 1, 'Dano', [{ tipo: 'rolar', formula, rotulo: `${registro.name}: dano${tipo}${salvaguarda}` }]));
    }
  }
  if (registro.heal_at_slot_level) {
    acoes.push(
      acao(idBase, acoes.length + 1, 'Cura', [
        { tipo: 'rolar', formula: escadaDeNiveis(NOME_NIVEL_DO_ESPACO, registro.heal_at_slot_level), rotulo: `${registro.name}: cura` },
      ]),
    );
  }
  return acoes;
}

/** Os ataques de um monstro: "Scimitar: ataque" (d20 + bônus) e "Scimitar: dano", com cada tipo de dano. */
export function acoesDoMonstro(registro: Registro): AcaoDeEntrada[] {
  const acoes: AcaoDeEntrada[] = [];
  const idBase = `monstro/${registro.index}`;
  for (const a of (registro.actions ?? []) as Registro[]) {
    if (typeof a.attack_bonus === 'number') {
      acoes.push(acao(idBase, acoes.length + 1, `${a.name}: ataque`, [{ tipo: 'rolar', formula: `1d20 + ${a.attack_bonus}`, rotulo: `${a.name}: ataque` }]));
    }
    const dados = ((a.damage ?? []) as Registro[]).filter((d) => typeof d.damage_dice === 'string' && /d/.test(d.damage_dice));
    if (dados.length > 0) {
      const tipos = dados.map((d) => String(d.damage_type?.name ?? '').toLowerCase()).filter(Boolean);
      acoes.push(
        acao(idBase, acoes.length + 1, `${a.name}: dano`, [
          {
            tipo: 'rolar',
            formula: dados.map((d) => String(d.damage_dice).replace(/\s+/g, '')).join(' + '),
            rotulo: `${a.name}: dano${tipos.length ? ` (${tipos.join(' + ')})` : ''}`,
          },
        ]),
      );
    }
  }
  return acoes;
}

// ---------- Efeitos prontos ----------

type EfeitoPronto = Omit<Efeito, 'id'>;

const SALVAGUARDAS_TODAS = (['for', 'des', 'con', 'int', 'sab', 'car'] as const).map((a) => `salvaguarda_${a}`);
const somar = (alvo: string, valor: string, quando: Efeito['quando'] = 'sempre'): EfeitoPronto => ({ alvo, operacao: 'somar', valor, quando });
const noMinimo = (alvo: string, valor: string, quando: Efeito['quando'] = 'sempre'): EfeitoPronto => ({ alvo, operacao: 'minimo', valor, quando });
const protecaoMagica = (quando: Efeito['quando']): EfeitoPronto[] => [
  somar('ca', '1', quando),
  ...SALVAGUARDAS_TODAS.map((s) => somar(s, '1', quando)),
];
const cintoDeGigante = (forca: number): EfeitoPronto[] => [noMinimo('for', String(forca), 'sintonizado')];
/** Uma montaria: quem a tem viaja mais rápido (o grupo só acelera se todos tiverem uma). */
const montaria = (fator: string): EfeitoPronto[] => [noMinimo('fator_viagem', fator)];
/** Um veículo leva quantos couberem; o "no mínimo" fica com o melhor, se houver vários. */
const veiculo = (tipo: 'terra' | 'agua', lugares: number, fator: string): EfeitoPronto[] => [
  noMinimo(`veiculo_${tipo}_lugares`, String(lugares)),
  noMinimo(`veiculo_${tipo}_fator`, fator),
];

/**
 * Efeitos que o SRD descreve só no texto, escritos aqui como dados, pelo índice da base.
 * O mestre pode editar ou completar outros no compêndio.
 */
const EFEITOS_PRONTOS: Readonly<Record<string, readonly EfeitoPronto[]>> = {
  // Itens mágicos.
  'armor-1': [somar('ca', '1', 'equipado')],
  'armor-2': [somar('ca', '2', 'equipado')],
  'armor-3': [somar('ca', '3', 'equipado')],
  'ring-of-protection': protecaoMagica('sintonizado'),
  'cloak-of-protection': protecaoMagica('sintonizado'),
  'bracers-of-defense': [somar('ca', 'se(usando_armadura ou usando_escudo, 0, 2)', 'sintonizado')],
  'gauntlets-of-ogre-power': [noMinimo('for', '19', 'sintonizado')],
  'belt-of-giant-strength-hill': cintoDeGigante(21),
  'belt-of-giant-strength-stone': cintoDeGigante(23),
  'belt-of-giant-strength-frost': cintoDeGigante(23),
  'belt-of-giant-strength-fire': cintoDeGigante(25),
  'belt-of-giant-strength-cloud': cintoDeGigante(27),
  'belt-of-giant-strength-storm': cintoDeGigante(29),
  'headband-of-intellect': [noMinimo('int', '19', 'sintonizado')],
  'amulet-of-health': [noMinimo('con', '19', 'sintonizado')],
  'stone-of-good-luck-luckstone': [
    ...SALVAGUARDAS_TODAS.map((s) => somar(s, '1', 'sintonizado')),
    ...REGRAS_PADRAO.pericias.map((p) => somar(p.id, '1', 'sintonizado')),
  ],
  // Montarias, veículos e barcos (Fase 5). Barcos: velocidade do 5e em mph ÷ 3 (4,5 km/h = ×1);
  // lugares: tripulação mais passageiros. Os veículos terrestres não dizem lugares no SRD: são estimativas.
  'horse-riding': montaria('1.5'),
  warhorse: montaria('1.5'),
  'horse-draft': montaria('1.5'),
  camel: montaria('1.5'),
  pony: montaria('1.25'),
  mule: montaria('1.25'),
  elephant: montaria('1.25'),
  mastiff: montaria('1.25'),
  carriage: veiculo('terra', 4, '1.25'),
  wagon: veiculo('terra', 6, '1.25'),
  cart: veiculo('terra', 2, '1.25'),
  chariot: veiculo('terra', 2, '1.25'),
  sled: veiculo('terra', 4, '1.25'),
  rowboat: veiculo('agua', 4, '1.5 / 3'),
  keelboat: veiculo('agua', 7, '1 / 3'),
  'sailing-ship': veiculo('agua', 40, '2 / 3'),
  warship: veiculo('agua', 120, '2.5 / 3'),
  longship: veiculo('agua', 190, '3 / 3'),
  galley: veiculo('agua', 80, '4 / 3'),
  // Uma luneta à mão deixa ver um hex mais longe.
  spyglass: [somar('visao_hexes', '1', 'equipado')],
  // Habilidades de classe.
  'barbarian-unarmored-defense': [noMinimo('ca', 'se(usando_armadura, 0, 10 + mod(DES) + mod(CON) + escudo_bonus)')],
  'monk-unarmored-defense': [noMinimo('ca', 'se(usando_armadura ou usando_escudo, 0, 10 + mod(DES) + mod(SAB))')],
  'fast-movement': [somar('deslocamento', 'se(armadura_pesada, 0, 3)')],
  'unarmored-movement-1': [somar('deslocamento', 'se(usando_armadura ou usando_escudo, 0, tabela(movimento_sem_armadura))')],
  // Habilidade de subclasse: ainda sem ligação com a classe, usa o nível total (igual sem multiclasse).
  'draconic-resilience': [
    somar('pv_maximos', 'nivel'),
    noMinimo('ca', 'se(usando_armadura, 0, 13 + mod(DES) + escudo_bonus)'),
  ],
  'aura-of-protection': SALVAGUARDAS_TODAS.map((s) => somar(s, 'max(1, mod(CAR))')),
  // Traços de espécie.
  'dwarven-toughness': [somar('pv_maximos', 'nivel')],
};

/** Os efeitos prontos de um registro da base, com ids estáveis. */
function efeitosProntos(indice: string): Efeito[] {
  return (EFEITOS_PRONTOS[indice] ?? []).map((e, i) => ({ ...e, id: `${ID_PACOTE}/${indice}/efeito-${i + 1}` }));
}

// ---------- Classes ----------

export function converterClasse(
  registro: Registro,
  caracteristicas: readonly Registro[],
  idFinal: ReadonlyMap<string, string>,
  niveis: readonly Registro[] = [],
): EntradaDe<'classe'> {
  const proprias = caracteristicas
    .filter((c) => c.class?.index === registro.index && !c.subclass && !c.parent)
    .sort((a, b) => a.level - b.level);
  // A escolha de perícias vira dado, para o assistente de criação oferecer; as outras (instrumentos, ferramentas) ficam como texto.
  const ehDePericias = (escolha: Registro) =>
    Array.isArray(escolha.from?.options) &&
    escolha.from.options.length > 0 &&
    escolha.from.options.every((o: Registro) => o.option_type === 'reference' && String(o.item?.name ?? '').startsWith('Skill: '));
  const dePericias = (registro.proficiency_choices ?? []).find(ehDePericias);
  const escolhas = (registro.proficiency_choices ?? [])
    .filter((escolha: Registro) => escolha !== dePericias)
    .map((escolha: Registro) => escolha.desc)
    .filter((d: unknown): d is string => typeof d === 'string' && d !== '');
  const partes: string[] = [];
  for (const bloco of registro.spellcasting?.info ?? []) {
    partes.push(`${bloco.name}. ${juntarTexto(bloco.desc)}`);
  }
  const subclasses = nomes(registro.subclasses);
  if (subclasses.length > 0) {
    partes.push(`Subclasses in the SRD: ${subclasses.join(', ')}.`);
  }
  const iniciais = (registro.starting_equipment ?? []).map(
    (e: Registro) => `${e.quantity} × ${e.equipment?.name}`,
  );
  const opcoes = (registro.starting_equipment_options ?? [])
    .map((o: Registro) => o.desc)
    .filter((d: unknown): d is string => typeof d === 'string');
  if (iniciais.length + opcoes.length > 0) {
    partes.push(`Starting equipment: ${[...iniciais, ...opcoes].join('; ')}.`);
  }
  const multiclasse = (registro.multi_classing?.prerequisites ?? []).map(
    (p: Registro) => `${p.ability_score?.name} ${p.minimum_score}`,
  );
  if (multiclasse.length > 0) {
    partes.push(`Multiclassing prerequisite: ${multiclasse.join(', ')}.`);
  }
  const conjuracao = registro.spellcasting?.spellcasting_ability?.index;
  return {
    ...base('classe', id('classe', registro.index), registro.name, partes.join('\n\n'), []),
    dados: {
      dadoVida: registro.hit_die,
      salvaguardas: (registro.saving_throws ?? []).map((s: Registro) =>
        traduzir(ATRIBUTO, s.index, `salvaguarda de ${registro.index}`),
      ),
      proficiencias: [
        ...nomes(registro.proficiencies).filter((n) => !n.startsWith('Saving Throw:')),
        ...escolhas,
      ],
      habilidades: proprias.map((c) => ({
        nivel: c.level,
        entradaId: exigirValor(idFinal.get(c.index), `característica ${c.index}`),
      })),
      atributoConjuracao: conjuracao ? traduzir(ATRIBUTO, conjuracao, `conjuração de ${registro.index}`) : null,
      tabela: converterTabela(registro.index, niveis),
      escolhaPericias: dePericias
        ? { quantidade: dePericias.choose, opcoes: dePericias.from.options.map((o: Registro) => o.item.name as string) }
        : null,
      niveisDeAumento: niveisDeAumento(registro.index, niveis),
    },
  };
}

// ---------- Espécies ----------

function aumentos(bonus: unknown): Partial<Record<Atributo, number>> {
  const resultado: Partial<Record<Atributo, number>> = {};
  for (const b of Array.isArray(bonus) ? bonus : []) {
    const atributo = traduzir(ATRIBUTO, b.ability_score?.index, 'aumento de atributo');
    resultado[atributo] = (resultado[atributo] ?? 0) + b.bonus;
  }
  return resultado;
}

function somarAumentos(
  a: Partial<Record<Atributo, number>>,
  b: Partial<Record<Atributo, number>>,
): Partial<Record<Atributo, number>> {
  const soma = { ...a };
  for (const [atributo, valor] of Object.entries(b) as [Atributo, number][]) {
    soma[atributo] = (soma[atributo] ?? 0) + valor;
  }
  return soma;
}

function descricaoDaEspecie(registro: Registro): string {
  const partes = [registro.age, registro.alignment, registro.size_description, registro.language_desc];
  if (registro.ability_bonus_options) {
    partes.push(`Ability score increase: choose ${registro.ability_bonus_options.choose} from the options.`);
  }
  return juntarTexto(partes);
}

export function converterEspecie(registro: Registro): EntradaDe<'especie'> {
  return {
    ...base('especie', id('especie', registro.index), registro.name, descricaoDaEspecie(registro), []),
    dados: {
      tamanho: traduzir(TAMANHO, registro.size, `tamanho de ${registro.index}`),
      deslocamento: registro.speed,
      aumentosAtributo: aumentos(registro.ability_bonuses),
      idiomas: nomes(registro.languages),
      tracos: (registro.traits ?? []).map((t: Registro) => id('traco', t.index)),
    },
  };
}

/** A sub-espécie vira uma espécie completa, já somando o que vem da espécie principal. */
export function converterSubespecie(registro: Registro, especies: readonly Registro[]): EntradaDe<'especie'> {
  const principal = exigirValor(
    especies.find((e) => e.index === registro.race?.index),
    `espécie principal de ${registro.index}`,
  );
  const daPrincipal = converterEspecie(principal);
  const descricao = [juntarTexto(registro.desc), `Subrace of ${principal.name}.`, daPrincipal.descricao]
    .filter(Boolean)
    .join('\n\n');
  return {
    ...base('especie', id('especie', registro.index), registro.name, descricao, [principal.name]),
    dados: {
      ...daPrincipal.dados,
      aumentosAtributo: somarAumentos(daPrincipal.dados.aumentosAtributo, aumentos(registro.ability_bonuses)),
      tracos: semRepetir([
        ...daPrincipal.dados.tracos,
        ...(registro.racial_traits ?? []).map((t: Registro) => id('traco', t.index)),
      ]),
    },
  };
}

// ---------- Antecedentes, talentos e condições ----------

function opcoesDeTexto(grupo: Registro | undefined, titulo: string): string {
  const opcoes: Registro[] = grupo?.from?.options ?? [];
  const textos = opcoes.map((o) => o.string ?? o.desc).filter((t): t is string => typeof t === 'string');
  return textos.length > 0 ? `${titulo} (choose ${grupo?.choose ?? 1}):\n${textos.map((t) => `- ${t}`).join('\n')}` : '';
}

/** O antecedente e a característica que ele dá, que vira uma habilidade própria. */
export function converterAntecedente(registro: Registro): [EntradaDe<'antecedente'>, EntradaDe<'habilidade'>] {
  const caracteristica: EntradaDe<'habilidade'> = {
    ...base(
      'habilidade',
      id('caracteristica-antecedente', registro.index),
      exigirValor(registro.feature?.name, `característica de ${registro.index}`),
      juntarTexto(registro.feature?.desc),
      [registro.name, 'Background Feature'],
    ),
    dados: { requisito: registro.name, usos: null },
  };
  const partes = [
    registro.language_options ? `Languages: choose ${registro.language_options.choose}.` : '',
    `Equipment: ${(registro.starting_equipment ?? [])
      .map((e: Registro) => `${e.quantity} × ${e.equipment?.name}`)
      .join(', ')}${registro.starting_gold ? `, ${registro.starting_gold.quantity} ${registro.starting_gold.unit}` : ''}.`,
    opcoesDeTexto(registro.personality_traits, 'Personality traits'),
    opcoesDeTexto(registro.ideals, 'Ideals'),
    opcoesDeTexto(registro.bonds, 'Bonds'),
    opcoesDeTexto(registro.flaws, 'Flaws'),
  ];
  const antecedente: EntradaDe<'antecedente'> = {
    ...base('antecedente', id('antecedente', registro.index), registro.name, partes.filter(Boolean).join('\n\n'), []),
    dados: {
      proficiencias: nomes(registro.starting_proficiencies),
      habilidades: [caracteristica.id],
    },
  };
  return [antecedente, caracteristica];
}

export function converterTalento(registro: Registro): EntradaDe<'talento'> {
  const prerequisito = (registro.prerequisites ?? [])
    .map((p: Registro) => `${traduzir(NOME_DO_ATRIBUTO, p.ability_score?.index, 'pré-requisito')} ${p.minimum_score}`)
    .join(', ');
  return {
    ...base('talento', id('talento', registro.index), registro.name, juntarTexto(registro.desc), []),
    dados: { prerequisito },
  };
}

export function converterCondicao(registro: Registro): EntradaDe<'condicao'> {
  return {
    ...base('condicao', id('condicao', registro.index), registro.name, juntarTexto(registro.desc), []),
    dados: {},
  };
}

// ---------- Monstros ----------

function notaDaArmadura(ca: Registro): string {
  switch (ca.type) {
    case 'armor':
      return nomes(ca.armor).join(', ') || 'armor';
    case 'natural':
      return 'natural armor';
    case 'dex':
      return '';
    case 'spell':
      return ca.spell?.name ?? 'spell';
    case 'condition':
      return ca.condition?.name ?? 'condition';
    default:
      return String(ca.type ?? '');
  }
}

export function formatarUso(uso: Registro | undefined): string {
  if (!uso) {
    return '';
  }
  switch (uso.type) {
    case 'per day':
      return `${uso.times}/Day`;
    case 'recharge on roll':
      return uso.min_value >= 6 ? 'Recharge 6' : `Recharge ${uso.min_value}–6`;
    case 'recharge after rest':
      return `Recharges after a ${(uso.rest_types ?? []).join(' or ')} rest`;
    default:
      return '';
  }
}

function blocos(lista: unknown): BlocoDeTexto[] {
  return (Array.isArray(lista) ? lista : []).map((b: Registro) => {
    const uso = formatarUso(b.usage);
    return { nome: uso ? `${b.name} (${uso})` : b.name, descricao: juntarTexto(b.desc) };
  });
}

function deslocamento(velocidade: Registro | undefined): string {
  return Object.entries(velocidade ?? {})
    .map(([modo, valor]) => (modo === 'walk' ? String(valor) : modo === 'hover' ? 'hover' : `${modo} ${valor}`))
    .join(', ');
}

function sentidos(registro: Registro | undefined): string {
  return Object.entries(registro ?? {})
    .map(([sentido, valor]) =>
      sentido === 'passive_perception' ? `passive Perception ${valor}` : `${sentido.replace(/_/g, ' ')} ${valor}`,
    )
    .join(', ');
}

export function converterMonstro(registro: Registro): EntradaDe<'monstro'> {
  const [ca, ...outrasCa] = exigirValor(registro.armor_class as Registro[] | undefined, `CA de ${registro.index}`);
  const nota = [
    notaDaArmadura(ca),
    ...outrasCa.map((outra) => `${outra.value} with ${notaDaArmadura(outra)}`),
  ]
    .filter(Boolean)
    .join('; ');
  const salvaguardas: Partial<Record<Atributo, number>> = {};
  const pericias: Record<string, number> = {};
  for (const p of registro.proficiencies ?? []) {
    const indice: string = p.proficiency?.index ?? '';
    if (indice.startsWith('saving-throw-')) {
      salvaguardas[traduzir(ATRIBUTO, indice.slice('saving-throw-'.length), `salvaguarda de ${registro.index}`)] = p.value;
    } else if (indice.startsWith('skill-')) {
      pericias[String(p.proficiency.name).replace(/^Skill: /, '')] = p.value;
    }
  }
  const nd = registro.challenge_rating;
  return {
    ...base(
      'monstro',
      id('monstro', registro.index),
      registro.name,
      juntarTexto(registro.desc),
      [registro.type, `CR ${formatarNivelDesafio(nd)}`],
      true,
    ),
    acoes: acoesDoMonstro(registro),
    dados: {
      tamanho: traduzir(TAMANHO, registro.size, `tamanho de ${registro.index}`),
      tipoCriatura: registro.subtype ? `${registro.type} (${registro.subtype})` : registro.type,
      alinhamento: registro.alignment ?? '',
      classeArmadura: ca.value,
      notaArmadura: nota,
      pontosVida: registro.hit_points,
      dadosVida: registro.hit_points_roll ?? registro.hit_dice ?? '',
      deslocamento: deslocamento(registro.speed),
      atributos: {
        for: registro.strength,
        des: registro.dexterity,
        con: registro.constitution,
        int: registro.intelligence,
        sab: registro.wisdom,
        car: registro.charisma,
      },
      salvaguardas,
      pericias,
      vulnerabilidades: registro.damage_vulnerabilities ?? [],
      resistencias: registro.damage_resistances ?? [],
      imunidades: registro.damage_immunities ?? [],
      imunidadesCondicao: nomes(registro.condition_immunities),
      sentidos: sentidos(registro.senses),
      idiomas: registro.languages ?? '',
      nivelDesafio: nd,
      experiencia: registro.xp,
      tracos: blocos(registro.special_abilities),
      acoesDeCombate: blocos(registro.actions),
      reacoes: blocos(registro.reactions),
      acoesLendarias: blocos(registro.legendary_actions),
    },
  };
}

// ---------- O pacote inteiro ----------

/** Converte toda a base, na ordem dos tipos, e devolve o pacote pronto para gravar. */
export function converterSrd(fontes: Fontes): Pacote {
  const entradas: Entrada[] = [];
  const converter = <T>(arquivo: ArquivoFonte, fazer: (registro: Registro) => T, filtro?: (r: Registro) => boolean) => {
    for (const registro of fontes[arquivo]) {
      if (filtro && !filtro(registro)) {
        continue;
      }
      try {
        const resultado = fazer(registro);
        entradas.push(...((Array.isArray(resultado) ? resultado : [resultado]) as Entrada[]));
      } catch (erro) {
        throw new ErroDeConversao(`${arquivo}, "${registro.index}": ${(erro as Error).message}`);
      }
    }
  };

  converter('Equipment', converterEquipamento);
  converter('Magic-Items', converterItemMagico, (r) => !(Array.isArray(r.variants) && r.variants.length > 0));
  converter('Spells', converterMagia);
  const { grupos, idFinal } = agruparCaracteristicas(fontes.Features);
  for (const grupo of grupos) {
    entradas.push(converterCaracteristica(grupo));
  }
  converter('Traits', converterTraco);
  converter('Classes', (r) => converterClasse(r, fontes.Features, idFinal, fontes.Levels));
  converter('Races', converterEspecie);
  converter('Subraces', (r) => converterSubespecie(r, fontes.Races));
  converter('Backgrounds', converterAntecedente);
  converter('Feats', converterTalento);
  converter('Conditions', converterCondicao);
  converter('Monsters', converterMonstro);

  return {
    id: ID_PACOTE,
    nome: 'SRD 5.1',
    descricao:
      'O conteúdo de regras aberto da quinta edição: equipamentos, itens mágicos, magias, classes, espécies, condições e monstros. Textos em inglês, com medidas em metros e quilos.',
    creditos: CREDITOS,
    // As funções acima escrevem como o SRD (pés); aqui tudo passa para o sistema métrico.
    entradas: entradas.map((e) => entradaParaMetrico(e) as Entrada),
  };
}

/**
 * Confere as fórmulas do pacote com as regras padrão: as células das tabelas e os usos
 * das habilidades, que só podem citar colunas da tabela da própria classe.
 */
export function formulasQuebradas(pacote: Pacote): string[] {
  const problemas: string[] = [];
  const classesDaHabilidade = new Map<string, EntradaDe<'classe'>[]>();
  for (const entrada of pacote.entradas) {
    if (entrada.tipo !== 'classe') {
      continue;
    }
    const colunas = new Set(entrada.dados.tabela.map((c) => c.id));
    for (const coluna of entrada.dados.tabela) {
      coluna.valores.forEach((valor, i) => {
        const problema =
          valor === ''
            ? null
            : problemaNaFormula(REGRAS_PADRAO, valor, { extras: [NOME_NIVEL_DA_CLASSE], colunas, dados: 'permitidos' });
        if (problema) {
          problemas.push(`${entrada.id}, ${coluna.id}, nível ${i + 1}: ${problema}`);
        }
      });
    }
    for (const { entradaId } of entrada.dados.habilidades) {
      classesDaHabilidade.set(entradaId, [...(classesDaHabilidade.get(entradaId) ?? []), entrada]);
    }
  }
  const alvos = nomesDasRegras(REGRAS_PADRAO);
  for (const entrada of pacote.entradas) {
    const classes = classesDaHabilidade.get(entrada.id) ?? [];
    const opcoes = (colunas: ReadonlySet<string> | null) =>
      ({ extras: classes.length > 0 ? [NOME_NIVEL_DA_CLASSE] : [], colunas, dados: 'proibidos' }) as const;
    const conferencias = classes.length > 0 ? classes.map((c) => new Set(c.dados.tabela.map((col) => col.id))) : [null];
    const conferir = (onde: string, formula: string) => {
      for (const colunas of conferencias) {
        const problema = problemaNaFormula(REGRAS_PADRAO, formula, opcoes(colunas));
        if (problema) {
          problemas.push(`${entrada.id}, ${onde}: ${problema}`);
        }
      }
    };
    if (entrada.tipo === 'habilidade' && entrada.dados.usos) {
      conferir('usos', entrada.dados.usos.maximo);
    }
    for (const efeito of entrada.efeitos) {
      if (!alvos.has(efeito.alvo)) {
        problemas.push(`${entrada.id}, efeito ${efeito.id}: o alvo "${efeito.alvo}" não existe nas regras.`);
      }
      conferir(`efeito ${efeito.id}`, efeito.valor);
    }
    // As ações podem rolar dados; nas magias, também usam o nível do espaço.
    const extrasDasAcoes = [
      ...(classes.length > 0 ? [NOME_NIVEL_DA_CLASSE] : []),
      ...(entrada.tipo === 'magia' ? [NOME_NIVEL_DO_ESPACO] : []),
    ];
    for (const a of entrada.acoes) {
      for (const passo of a.passos) {
        if (passo.tipo === 'rolar' || passo.tipo === 'curar') {
          const problema = problemaNaFormula(REGRAS_PADRAO, passo.formula, { extras: extrasDasAcoes, colunas: null, dados: 'permitidos' });
          if (problema) {
            problemas.push(`${entrada.id}, ação ${a.id}: ${problema}`);
          }
        }
      }
    }
  }
  return problemas;
}

/** Confere que toda referência entre entradas aponta para uma entrada do pacote. */
export function referenciasQuebradas(pacote: Pacote): string[] {
  const ids = new Set(pacote.entradas.map((e) => e.id));
  const quebradas: string[] = [];
  const conferir = (de: string, para: readonly string[]) => {
    for (const alvo of para) {
      if (!ids.has(alvo)) {
        quebradas.push(`${de} → ${alvo}`);
      }
    }
  };
  for (const e of pacote.entradas) {
    switch (e.tipo) {
      case 'magia':
        conferir(e.id, e.dados.classes);
        break;
      case 'classe':
        conferir(e.id, e.dados.habilidades.map((h) => h.entradaId));
        break;
      case 'especie':
        conferir(e.id, e.dados.tracos);
        break;
      case 'antecedente':
        conferir(e.id, e.dados.habilidades);
        break;
    }
  }
  return quebradas;
}

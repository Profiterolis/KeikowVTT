import type { Regras } from './regras';
import { REGRAS_DE_VIAGEM_PADRAO } from './viagem';

/**
 * Regras parecidas com 5e, que acompanham o programa. São dados, não código:
 * cada número da ficha sai de uma destas fórmulas.
 */
export const REGRAS_PADRAO: Regras = {
  nome: 'Regras parecidas com 5e',
  atributos: {
    for: 'Força',
    des: 'Destreza',
    con: 'Constituição',
    int: 'Inteligência',
    sab: 'Sabedoria',
    car: 'Carisma',
  },
  modificador: 'piso((valor - 10) / 2)',
  formulaPericia: 'mod(atributo) + piso(prof * proficiencia)',
  formulaSalvaguarda: 'mod(atributo) + piso(prof * proficiencia)',
  // 50 moedas pesam 0,5 kg, como no 5e.
  pesoPorMoeda: 0.01,
  pericias: [
    // Os apelidos em inglês permitem ler monstros e antecedentes do SRD.
    { id: 'acrobacia', nome: 'Acrobacia', atributo: 'des', apelidos: ['Acrobatics'] },
    { id: 'adestrar_animais', nome: 'Adestrar Animais', atributo: 'sab', apelidos: ['Animal Handling'] },
    { id: 'arcanismo', nome: 'Arcanismo', atributo: 'int', apelidos: ['Arcana'] },
    { id: 'atletismo', nome: 'Atletismo', atributo: 'for', apelidos: ['Athletics'] },
    { id: 'atuacao', nome: 'Atuação', atributo: 'car', apelidos: ['Performance'] },
    { id: 'enganacao', nome: 'Enganação', atributo: 'car', apelidos: ['Deception'] },
    { id: 'furtividade', nome: 'Furtividade', atributo: 'des', apelidos: ['Stealth'] },
    { id: 'historia', nome: 'História', atributo: 'int', apelidos: ['History'] },
    { id: 'intimidacao', nome: 'Intimidação', atributo: 'car', apelidos: ['Intimidation'] },
    { id: 'intuicao', nome: 'Intuição', atributo: 'sab', apelidos: ['Insight'] },
    { id: 'investigacao', nome: 'Investigação', atributo: 'int', apelidos: ['Investigation'] },
    { id: 'medicina', nome: 'Medicina', atributo: 'sab', apelidos: ['Medicine'] },
    { id: 'natureza', nome: 'Natureza', atributo: 'int', apelidos: ['Nature'] },
    { id: 'percepcao', nome: 'Percepção', atributo: 'sab', apelidos: ['Perception'] },
    { id: 'persuasao', nome: 'Persuasão', atributo: 'car', apelidos: ['Persuasion'] },
    { id: 'prestidigitacao', nome: 'Prestidigitação', atributo: 'des', apelidos: ['Sleight of Hand'] },
    { id: 'religiao', nome: 'Religião', atributo: 'int', apelidos: ['Religion'] },
    { id: 'sobrevivencia', nome: 'Sobrevivência', atributo: 'sab', apelidos: ['Survival'] },
  ],
  valores: [
    {
      id: 'prof',
      nome: 'Bônus de proficiência',
      formula: '2 + piso((nivel - 1) / 4)',
      descricao: '+2 nos níveis 1 a 4, e +1 a cada 4 níveis depois disso.',
    },
    {
      id: 'ca',
      nome: 'Classe de Armadura',
      formula: 'se(usando_armadura, armadura_base + min(mod(DES), armadura_des_max), 10 + mod(DES)) + escudo_bonus',
      descricao:
        'Sem armadura, 10 + Destreza. Com armadura, a CA dela mais a Destreza até o limite da armadura. O escudo soma por cima.',
    },
    { id: 'iniciativa', nome: 'Iniciativa', formula: 'mod(DES)', descricao: '' },
    {
      id: 'deslocamento',
      nome: 'Deslocamento',
      formula: 'deslocamento_base - se(FOR < armadura_forca_minima, 3, 0)',
      descricao: 'Em metros. Armadura que exige mais Força do que a ficha tem tira 3 m.',
    },
    {
      id: 'pv_maximos',
      nome: 'Pontos de vida máximos',
      formula: 'pv_dos_dados + nivel * mod(CON)',
      descricao: 'Os dados de vida de cada nível, mais o modificador de Constituição por nível.',
    },
    { id: 'percepcao_passiva', nome: 'Percepção passiva', formula: '10 + percepcao', descricao: '' },
    {
      id: 'cd_magia',
      nome: 'CD de magia',
      formula: '8 + prof + mod(conjuracao)',
      descricao: 'Só para quem conjura magias.',
    },
    {
      id: 'ataque_magico',
      nome: 'Ataque mágico',
      formula: 'prof + mod(conjuracao)',
      descricao: 'Só para quem conjura magias.',
    },
    { id: 'capacidade_carga', nome: 'Capacidade de carga', formula: 'FOR * 7.5', descricao: 'Em quilos.' },
  ],
  criacao: {
    jogadoresCriam: true,
    metodos: ['pontos', 'padrao', 'rolagem'],
    // A compra de pontos do 5e: 27 pontos, valores de 8 a 15.
    pontos: 27,
    custos: [
      { valor: 8, custo: 0 },
      { valor: 9, custo: 1 },
      { valor: 10, custo: 2 },
      { valor: 11, custo: 3 },
      { valor: 12, custo: 4 },
      { valor: 13, custo: 5 },
      { valor: 14, custo: 7 },
      { valor: 15, custo: 9 },
    ],
    conjuntoPadrao: [15, 14, 13, 12, 10, 8],
    rolagem: '4d6kh3',
    maximoAtributo: 20,
  },
  viagem: REGRAS_DE_VIAGEM_PADRAO,
};

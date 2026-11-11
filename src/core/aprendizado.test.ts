import { describe, expect, it } from 'vitest';
import { proficienteComArma } from './acoesDaFicha';
import { chanceDoAprendizado, jaSabe, temasDisponiveis, termoDoTeste } from './aprendizado';
import { criarEntrada, type EntradaDe } from './entradas';
import { comClasse, criarFicha, type Ficha } from './fichas';
import { aplicarAcaoCompendio, criarCompendioVazio } from './compendio';
import { conferirRegras, lerRegras } from './regras';
import { REGRAS_PADRAO } from './regrasPadrao';

const R = REGRAS_PADRAO;
const tema = (id: string) => R.aprendizado.temas.find((t) => t.id === id)!;

const elfo: EntradaDe<'especie'> = { ...criarEntrada('especie', 'elfo'), nome: 'Elfo', dados: { ...criarEntrada('especie', 'x').dados, idiomas: ['Common', 'Elvish'] } };
const guerreiro: EntradaDe<'classe'> = {
  ...criarEntrada('classe', 'guerreiro'),
  nome: 'Guerreiro',
  dados: { ...criarEntrada('classe', 'x').dados, proficiencias: ['All armor', 'Shields', 'Simple Weapons', 'Martial Weapons'] },
};
const compendio = [elfo, guerreiro].reduce((c, entrada) => aplicarAcaoCompendio(c, { tipo: 'AdicionarEntrada', entrada }), criarCompendioVazio());
const com = (mudancas: Partial<Ficha>): Ficha => ({ ...criarFicha('personagem', 'f'), ...mudancas });
const elfa = com({ especieId: 'elfo', entradas: { elfo } });

describe('o que o personagem já sabe', () => {
  it('idiomas da espécie (pelo nome em inglês) e os aprendidos', () => {
    expect(jaSabe(elfa, tema('elfico'), R)).toBe(true);
    expect(jaSabe(elfa, tema('anao'), R)).toBe(false);
    expect(jaSabe({ ...elfa, idiomas: ['Anão'] }, tema('anao'), R)).toBe(true);
  });

  it('proficiências da classe ("All armor" vale para as armaduras) e as aprendidas', () => {
    const lutador = comClasse(criarFicha('personagem', 'g'), compendio, 'guerreiro');
    expect(['armadura_leve', 'armadura_media', 'armadura_pesada', 'escudos', 'armas_marciais'].every((id) => jaSabe(lutador, tema(id), R))).toBe(true);
    const novato = criarFicha('personagem', 'n');
    expect(jaSabe(novato, tema('armas_marciais'), R)).toBe(false);
    expect(jaSabe({ ...novato, proficienciasExtras: ['Martial Weapons'] }, tema('armas_marciais'), R)).toBe(true);
  });

  it('perícias já proficientes não aparecem para treinar', () => {
    const atleta = com({ proficiencias: { atletismo: 1 } });
    expect(temasDisponiveis(atleta, R, 'treino').map((t) => t.id)).not.toContain('atletismo');
    expect(temasDisponiveis(atleta, R, 'treino').map((t) => t.id)).toContain('acrobacia');
    expect(temasDisponiveis(atleta, R, 'estudo').every((t) => t.modo === 'estudo')).toBe(true);
  });

  it('uma arma aprendida treinando dá proficiência no ataque', () => {
    const espada: EntradaDe<'item'> = {
      ...criarEntrada('item', 'espada'),
      nome: 'Longsword',
      dados: { ...criarEntrada('item', 'x').dados, arma: { dominio: 'marcial', alcanceTipo: 'corpo-a-corpo', dano: '1d8', tipoDano: '', danoVersatil: null, alcance: null, propriedades: [] } },
    };
    expect(proficienteComArma(criarFicha('personagem', 'n'), espada)).toBe(false);
    expect(proficienteComArma(com({ proficienciasExtras: ['Martial Weapons'] }), espada)).toBe(true);
  });
});

describe('o teste de cada turno', () => {
  it('soma a perícia ligada (ou o atributo) e a aptidão do tipo', () => {
    expect(termoDoTeste({ tipo: 'tema', tema: tema('elfico') }, R)).toBe('historia + aptidao_idiomas');
    expect(termoDoTeste({ tipo: 'tema', tema: tema('armas_marciais') }, R)).toBe('mod(FOR) + aptidao_fisica');
    expect(termoDoTeste({ tipo: 'tema', tema: tema('atletismo') }, R)).toBe('atletismo + aptidao_fisica');
  });

  it('Inteligência, proficiência e aptidão (por efeito) aumentam a chance', () => {
    const elfico = { tipo: 'tema' as const, tema: tema('elfico') };
    // CD 12 com +0: precisa de 12 ou mais no d20, 9 faces de 20.
    expect(chanceDoAprendizado(com({}), elfico, R)).toEqual({ bonus: 0, chance: 0.45 });
    // INT 16 (+3) e proficiente em História (+2).
    expect(chanceDoAprendizado(com({ atributos: { ...criarFicha('personagem', 'x').atributos, int: 16 }, proficiencias: { historia: 1 } }), elfico, R)?.bonus).toBe(5);
    // Uma aptidão para idiomas de +2 vinda de um talento.
    const talento = {
      ...criarEntrada('talento', 'linguista'),
      nome: 'Linguista',
      efeitos: [{ id: 'e', alvo: 'aptidao_idiomas', operacao: 'somar' as const, valor: '2', quando: 'sempre' as const }],
    };
    const linguista = com({ entradas: { linguista: talento }, extras: ['linguista'] });
    expect(chanceDoAprendizado(linguista, elfico, R)?.bonus).toBe(2);
  });

  it('um 20 natural sempre tem chance: nada fica impossível', () => {
    const dificil = { tipo: 'tema' as const, tema: { ...tema('armadura_pesada'), cd: 40 } };
    expect(chanceDoAprendizado(com({}), dificil, R)?.chance).toBe(0.05);
  });
});

describe('regras do aprendizado', () => {
  it('regras antigas ganham o aprendizado padrão; perícia ligada desconhecida é um problema', () => {
    const { aprendizado: _a, ...antigas } = R;
    expect(lerRegras(JSON.parse(JSON.stringify(antigas)), R).aprendizado).toEqual(R.aprendizado);
    const quebradas = { ...R, aprendizado: { ...R.aprendizado, temas: [{ ...tema('elfico'), periciaLigada: 'culinaria' }] } };
    expect(conferirRegras(quebradas).map((p) => p.erro)).toContain('A perícia ligada não existe nas regras.');
  });
});

/**
 * O que se aprende estudando e treinando à noite, como dados editáveis pelo mestre: cada tema
 * tem uma dificuldade (a CD de cada teste e quantos sucessos são precisos) e o que o teste soma.
 * Estudar (idiomas, magias) costuma usar Inteligência; treinar (perícias e proficiências físicas),
 * Força ou Destreza. A predisposição vem das aptidões, valores da ficha que mudam por efeitos.
 */
import { ATRIBUTOS, type Atributo } from './entradas';
import { ehObjeto, ErroDeFormato, exigir } from './leitura';

export type ModoDeAprendizado = 'estudo' | 'treino';

/** O que o personagem ganha ao completar o tema. */
export const TIPOS_TEMA = ['idioma', 'pericia', 'proficiencia'] as const;
export type TipoTema = (typeof TIPOS_TEMA)[number];

export interface TemaDeAprendizado {
  /** Nome interno, como `elfico` ou `armas_marciais`. */
  readonly id: string;
  /** Nome mostrado, como "Élfico". */
  readonly nome: string;
  readonly modo: ModoDeAprendizado;
  readonly tipo: TipoTema;
  /**
   * O que entra na ficha: num idioma, o nome dele; numa perícia, o id dela (fica proficiente);
   * numa proficiência, o texto como as classes escrevem ("Martial Weapons").
   */
  readonly alvo: string;
  /** Outros nomes que contam como já saber o tema ("Elvish", "All armor"). */
  readonly apelidos: readonly string[];
  /** O atributo do teste, quando não há perícia ligada. */
  readonly atributo: Atributo;
  /** A perícia que o teste usa (ela já soma a proficiência de quem é proficiente), ou `null`. */
  readonly periciaLigada: string | null;
  readonly cd: number;
  readonly sucessos: number;
}

/** A dificuldade de uma magia vem do nível dela: um truque é rápido, uma de 9º leva muito tempo. */
export interface AprendizadoDeMagia {
  readonly periciaLigada: string;
  readonly cdBase: number;
  readonly cdPorNivel: number;
  readonly sucessosBase: number;
  readonly sucessosPorNivel: number;
}

export interface RegrasDoAprendizado {
  readonly temas: readonly TemaDeAprendizado[];
  readonly magia: AprendizadoDeMagia;
}

/** A aptidão (predisposição) que soma ao teste, por tipo do que se aprende. */
export const APTIDAO_DE: Readonly<Record<'idioma' | 'magia' | 'treino', string>> = {
  idioma: 'aptidao_idiomas',
  magia: 'aptidao_magia',
  treino: 'aptidao_fisica',
};

const idioma = (id: string, nome: string, apelido: string, exotico: boolean): TemaDeAprendizado => ({
  id,
  nome,
  modo: 'estudo',
  tipo: 'idioma',
  alvo: nome,
  apelidos: [apelido],
  atributo: 'int',
  periciaLigada: 'historia',
  cd: exotico ? 15 : 12,
  sucessos: exotico ? 10 : 6,
});

const treino = (
  id: string,
  nome: string,
  tipo: 'pericia' | 'proficiencia',
  alvo: string,
  atributo: Atributo,
  cd: number,
  sucessos: number,
  apelidos: string[] = [],
): TemaDeAprendizado => ({
  id,
  nome,
  modo: 'treino',
  tipo,
  alvo,
  apelidos,
  atributo,
  // Treinar uma perícia usa a própria perícia (sem proficiência, é o atributo dela).
  periciaLigada: tipo === 'pericia' ? alvo : null,
  cd,
  sucessos,
});

export const REGRAS_DO_APRENDIZADO_PADRAO: RegrasDoAprendizado = {
  temas: [
    idioma('anao', 'Anão', 'Dwarvish', false),
    idioma('elfico', 'Élfico', 'Elvish', false),
    idioma('gigante', 'Gigante', 'Giant', false),
    idioma('gnomico', 'Gnômico', 'Gnomish', false),
    idioma('goblin', 'Goblin', 'Goblin', false),
    idioma('halfling', 'Halfling', 'Halfling', false),
    idioma('orc', 'Orc', 'Orc', false),
    idioma('abissal', 'Abissal', 'Abyssal', true),
    idioma('celestial', 'Celestial', 'Celestial', true),
    idioma('draconico', 'Dracônico', 'Draconic', true),
    idioma('fala_profunda', 'Fala Profunda', 'Deep Speech', true),
    idioma('infernal', 'Infernal', 'Infernal', true),
    idioma('primordial', 'Primordial', 'Primordial', true),
    idioma('silvestre', 'Silvestre', 'Sylvan', true),
    idioma('subcomum', 'Subcomum', 'Undercommon', true),
    treino('atletismo', 'Atletismo', 'pericia', 'atletismo', 'for', 13, 8),
    treino('acrobacia', 'Acrobacia', 'pericia', 'acrobacia', 'des', 13, 8),
    treino('furtividade', 'Furtividade', 'pericia', 'furtividade', 'des', 13, 8),
    treino('prestidigitacao', 'Prestidigitação', 'pericia', 'prestidigitacao', 'des', 13, 8),
    treino('armas_simples', 'Armas simples', 'proficiencia', 'Simple Weapons', 'for', 12, 6, ['Armas simples']),
    treino('armas_marciais', 'Armas marciais', 'proficiencia', 'Martial Weapons', 'for', 15, 10, ['Armas marciais']),
    treino('armadura_leve', 'Armadura leve', 'proficiencia', 'Light Armor', 'des', 12, 6, ['All armor']),
    treino('armadura_media', 'Armadura média', 'proficiencia', 'Medium Armor', 'for', 14, 8, ['All armor']),
    treino('armadura_pesada', 'Armadura pesada', 'proficiencia', 'Heavy Armor', 'for', 16, 12, ['All armor']),
    treino('escudos', 'Escudos', 'proficiencia', 'Shields', 'for', 13, 6),
  ],
  magia: { periciaLigada: 'arcanismo', cdBase: 10, cdPorNivel: 1, sucessosBase: 1, sucessosPorNivel: 1 },
};

/** A CD e os sucessos de uma magia, pelo nível dela. */
export function dificuldadeDaMagia(regras: RegrasDoAprendizado, nivel: number): { readonly cd: number; readonly sucessos: number } {
  const { magia } = regras;
  return { cd: magia.cdBase + magia.cdPorNivel * nivel, sucessos: magia.sucessosBase + magia.sucessosPorNivel * nivel };
}

export function problemasNoAprendizado(
  aprendizado: RegrasDoAprendizado,
  pericias: readonly string[],
): { readonly onde: string; readonly erro: string }[] {
  const problemas: { onde: string; erro: string }[] = [];
  const ids = new Set<string>();
  for (const tema of aprendizado.temas) {
    const onde = `Tema "${tema.nome || tema.id}"`;
    if (tema.id === '' || ids.has(tema.id)) {
      problemas.push({ onde, erro: 'O nome interno está vazio ou repetido.' });
    }
    ids.add(tema.id);
    if (tema.nome.trim() === '' || tema.alvo.trim() === '') {
      problemas.push({ onde, erro: 'O tema precisa de um nome e do que ensina.' });
    }
    if (!Number.isInteger(tema.cd) || tema.cd < 1 || !Number.isInteger(tema.sucessos) || tema.sucessos < 1) {
      problemas.push({ onde, erro: 'A CD e os sucessos são números inteiros, 1 ou mais.' });
    }
    if (tema.periciaLigada !== null && !pericias.includes(tema.periciaLigada)) {
      problemas.push({ onde, erro: 'A perícia ligada não existe nas regras.' });
    }
    if (tema.tipo === 'pericia' && !pericias.includes(tema.alvo)) {
      problemas.push({ onde, erro: 'A perícia ensinada não existe nas regras.' });
    }
  }
  const { magia } = aprendizado;
  if (!pericias.includes(magia.periciaLigada)) {
    problemas.push({ onde: 'Estudo de magias', erro: 'A perícia ligada não existe nas regras.' });
  }
  if ([magia.cdBase, magia.cdPorNivel, magia.sucessosBase, magia.sucessosPorNivel].some((n) => !Number.isInteger(n) || n < 0) || magia.sucessosBase < 1) {
    problemas.push({ onde: 'Estudo de magias', erro: 'Use números inteiros; ao menos 1 sucesso.' });
  }
  return problemas;
}

/** Lê o aprendizado guardado; regras de antes não o têm e ganham o padrão. */
export function lerAprendizado(valor: unknown, padrao: RegrasDoAprendizado): RegrasDoAprendizado {
  if (valor === undefined) {
    return padrao;
  }
  const onde = 'O aprendizado';
  exigir(ehObjeto(valor) && Array.isArray(valor.temas) && ehObjeto(valor.magia), `${onde} não é válido.`);
  const texto = (d: Record<string, unknown>, campo: string, local: string) => {
    exigir(typeof d[campo] === 'string', `${local}: "${campo}" precisa ser um texto.`);
    return d[campo] as string;
  };
  const numero = (d: Record<string, unknown>, campo: string, local: string) => {
    exigir(typeof d[campo] === 'number' && Number.isFinite(d[campo]), `${local}: "${campo}" precisa ser um número.`);
    return d[campo] as number;
  };
  const temas = valor.temas.map((t, i): TemaDeAprendizado => {
    const local = `O tema de aprendizado nº ${i + 1}`;
    exigir(ehObjeto(t), `${local} não é válido.`);
    exigir(t.modo === 'estudo' || t.modo === 'treino', `${local}: o modo é desconhecido.`);
    exigir((TIPOS_TEMA as readonly unknown[]).includes(t.tipo), `${local}: o tipo é desconhecido.`);
    exigir((ATRIBUTOS as readonly unknown[]).includes(t.atributo), `${local}: o atributo é desconhecido.`);
    exigir(t.periciaLigada === null || typeof t.periciaLigada === 'string', `${local}: a perícia ligada é inválida.`);
    exigir(Array.isArray(t.apelidos) && t.apelidos.every((a) => typeof a === 'string'), `${local}: os apelidos são inválidos.`);
    return {
      id: texto(t, 'id', local),
      nome: texto(t, 'nome', local),
      modo: t.modo,
      tipo: t.tipo as TipoTema,
      alvo: texto(t, 'alvo', local),
      apelidos: t.apelidos as string[],
      atributo: t.atributo as Atributo,
      periciaLigada: t.periciaLigada as string | null,
      cd: numero(t, 'cd', local),
      sucessos: numero(t, 'sucessos', local),
    };
  });
  const m = valor.magia;
  const magia: AprendizadoDeMagia = {
    periciaLigada: texto(m, 'periciaLigada', 'O estudo de magias'),
    cdBase: numero(m, 'cdBase', 'O estudo de magias'),
    cdPorNivel: numero(m, 'cdPorNivel', 'O estudo de magias'),
    sucessosBase: numero(m, 'sucessosBase', 'O estudo de magias'),
    sucessosPorNivel: numero(m, 'sucessosPorNivel', 'O estudo de magias'),
  };
  const lido = { temas, magia };
  // As perícias ainda não estão conferidas aqui: `conferirRegras` confere as ligações depois.
  const basicos = problemasNoAprendizado(lido, [
    ...new Set([...temas.flatMap((t) => [t.periciaLigada ?? '', t.tipo === 'pericia' ? t.alvo : '']), magia.periciaLigada]),
  ]);
  if (basicos.length > 0) {
    throw new ErroDeFormato(`${onde}, "${basicos[0].onde}": ${basicos[0].erro}`);
  }
  return lido;
}

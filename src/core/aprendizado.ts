/**
 * Estudar e treinar: cada turno da noite é um teste (d20 + perícia ligada ou atributo, mais a
 * aptidão) contra a CD do tema. Um sucesso soma 1 ao progresso (um 20 natural soma 2); ao juntar
 * os sucessos do tema, o personagem aprende sozinho: o idioma, a magia, a perícia ou a proficiência.
 */
import { rolarTeste, type RolagemFeita } from './acoesDaFicha';
import { calcularFicha, proficienciasDaFicha } from './calculoDaFicha';
import type { EstadoCompendio } from './compendio';
import type { EntradaDe } from './entradas';
import { comExtra, entradaDaFicha, textosDeProficiencia, type EstudoNaFicha, type Ficha } from './fichas';
import { normalizarNome } from './formulas';
import type { Regras } from './regras';
import { APTIDAO_DE, dificuldadeDaMagia, type ModoDeAprendizado, type TemaDeAprendizado } from './regrasDoAprendizado';

/** O que se está aprendendo: um tema das regras, ou uma magia do compêndio. */
export type AlvoDoAprendizado =
  | { readonly tipo: 'tema'; readonly tema: TemaDeAprendizado }
  | { readonly tipo: 'magia'; readonly magia: EntradaDe<'magia'> };

const contem = (lista: readonly string[], nomes: readonly string[]) => {
  const procurados = new Set(nomes.map(normalizarNome));
  return lista.some((t) => procurados.has(normalizarNome(t)));
};

/** Os idiomas que a ficha já fala: os da espécie e os aprendidos. */
export function idiomasDaFicha(ficha: Ficha): string[] {
  return [...(entradaDaFicha(ficha, ficha.especieId, 'especie')?.dados.idiomas ?? []), ...ficha.idiomas];
}


/** Se a ficha já sabe o tema: não faz sentido estudá-lo. */
export function jaSabe(ficha: Ficha, tema: TemaDeAprendizado, regras: Regras): boolean {
  const nomes = [tema.nome, tema.alvo, ...tema.apelidos];
  switch (tema.tipo) {
    case 'idioma':
      return contem(idiomasDaFicha(ficha), nomes);
    case 'pericia':
      return (proficienciasDaFicha(ficha, regras)[tema.alvo]?.valor ?? 0) >= 1;
    case 'proficiencia':
      return contem(textosDeProficiencia(ficha), nomes);
  }
}

/** Os temas de um modo (estudo ou treino) que a ficha ainda não sabe. */
export function temasDisponiveis(ficha: Ficha, regras: Regras, modo: ModoDeAprendizado): TemaDeAprendizado[] {
  return regras.aprendizado.temas.filter((t) => t.modo === modo && !jaSabe(ficha, t, regras));
}

/** A dificuldade: a CD de cada teste e os sucessos que faltam juntar. */
export function dificuldade(alvo: AlvoDoAprendizado, regras: Regras): { readonly cd: number; readonly sucessos: number } {
  return alvo.tipo === 'tema' ? { cd: alvo.tema.cd, sucessos: alvo.tema.sucessos } : dificuldadeDaMagia(regras.aprendizado, alvo.magia.dados.nivel);
}

/**
 * O que soma ao d20: a perícia ligada (que já traz a proficiência de quem é proficiente) ou o
 * modificador do atributo, mais a aptidão do tipo (predisposição, que vem de efeitos).
 */
export function termoDoTeste(alvo: AlvoDoAprendizado, regras: Regras): string {
  if (alvo.tipo === 'magia') {
    return `${regras.aprendizado.magia.periciaLigada} + ${APTIDAO_DE.magia}`;
  }
  const { tema } = alvo;
  const base = tema.periciaLigada ?? `mod(${tema.atributo.toUpperCase()})`;
  const aptidao = tema.modo === 'treino' ? APTIDAO_DE.treino : tema.tipo === 'idioma' ? APTIDAO_DE.idioma : APTIDAO_DE.magia;
  return `${base} + ${aptidao}`;
}

/** O bônus do teste e a chance de um sucesso, para mostrar antes de escolher. */
export function chanceDoAprendizado(ficha: Ficha, alvo: AlvoDoAprendizado, regras: Regras): { readonly bonus: number; readonly chance: number } | null {
  const calculado = calcularFicha(ficha, regras).formula(termoDoTeste(alvo, regras));
  if (!calculado.ok) {
    return null;
  }
  const bonus = calculado.valor;
  const { cd } = dificuldade(alvo, regras);
  // Precisa de d20 + bônus ≥ CD; um 20 natural sempre conta.
  const faces = Math.min(20, Math.max(1, 21 - (cd - bonus)));
  return { bonus, chance: faces / 20 };
}

/** O estudo em andamento deste alvo na ficha, se houver. */
export function estudoDe(ficha: Ficha, alvo: AlvoDoAprendizado): EstudoNaFicha | undefined {
  return ficha.estudos.find((e) =>
    alvo.tipo === 'magia'
      ? e.magiaId === alvo.magia.id
      : e.temaId === alvo.tema.id ||
        // Estudos antigos (de antes dos temas) se ligam ao tema pelo nome.
        (e.temaId === null && e.tipo === alvo.tema.tipo && normalizarNome(e.assunto) === normalizarNome(alvo.tema.nome)),
  );
}

/** O mestre (ou o fim do progresso) conclui: a magia vira extra; o idioma, a perícia ou a proficiência entram na ficha. */
export function concluirEstudo(ficha: Ficha, estudoId: string, compendio: EstadoCompendio): Ficha {
  const estudo = ficha.estudos.find((e) => e.id === estudoId);
  if (!estudo) {
    return ficha;
  }
  const sem = { ...ficha, estudos: ficha.estudos.filter((e) => e !== estudo) };
  const alvo = estudo.alvo ?? estudo.assunto;
  switch (estudo.tipo) {
    case 'magia':
      return estudo.magiaId ? comExtra(sem, compendio, estudo.magiaId) : sem;
    case 'idioma':
      return contem(sem.idiomas, [alvo]) ? sem : { ...sem, idiomas: [...sem.idiomas, alvo] };
    case 'pericia':
      return (sem.proficiencias[alvo] ?? 0) >= 1 ? sem : { ...sem, proficiencias: { ...sem.proficiencias, [alvo]: 1 } };
    case 'proficiencia':
      return contem(sem.proficienciasExtras, [alvo]) ? sem : { ...sem, proficienciasExtras: [...sem.proficienciasExtras, alvo] };
  }
}

export interface TurnoDeAprendizado {
  readonly ficha: Ficha;
  readonly rolagem: RolagemFeita;
  readonly cd: number;
  readonly sucesso: boolean;
  readonly progresso: number;
  readonly necessarios: number;
  /** Juntou os sucessos: o estudo sumiu e o que se aprendeu já está na ficha. */
  readonly aprendeu: boolean;
}

/** Um turno de estudo ou treino: rola, soma o progresso e, se completou, aprende. */
export function aprenderUmTurno(
  ficha: Ficha,
  alvo: AlvoDoAprendizado,
  regras: Regras,
  compendio: EstadoCompendio,
  aleatorio: () => number,
  criarId: () => string,
): { ok: true; turno: TurnoDeAprendizado } | { ok: false; erro: string } {
  const { cd, sucessos } = dificuldade(alvo, regras);
  const nome = alvo.tipo === 'tema' ? alvo.tema.nome : alvo.magia.nome;
  const verbo = alvo.tipo === 'tema' && alvo.tema.modo === 'treino' ? 'Treino' : 'Estudo';
  const feita = rolarTeste(calcularFicha(ficha, regras), termoDoTeste(alvo, regras), `${verbo}: ${nome} (CD ${cd})`, 'normal', aleatorio);
  if (!feita.ok) {
    return { ok: false, erro: feita.erro };
  }
  const d20 = feita.feita.rolagem.dados.find((d) => d.faces === 20)?.valores[0];
  const total = feita.feita.rolagem.total;
  const sucesso = d20 === 20 || total >= cd;
  const ganho = !sucesso ? 0 : d20 === 20 ? 2 : 1;

  const existente = estudoDe(ficha, alvo);
  const estudo: EstudoNaFicha = existente
    ? { ...existente, progresso: existente.progresso + ganho, temaId: alvo.tipo === 'tema' ? alvo.tema.id : existente.temaId }
    : alvo.tipo === 'tema'
      ? { id: criarId(), tipo: alvo.tema.tipo, temaId: alvo.tema.id, magiaId: null, alvo: alvo.tema.alvo, assunto: alvo.tema.nome, progresso: ganho }
      : { id: criarId(), tipo: 'magia', temaId: null, magiaId: alvo.magia.id, alvo: null, assunto: alvo.magia.nome, progresso: ganho };
  const comProgresso: Ficha = {
    ...ficha,
    estudos: existente ? ficha.estudos.map((e) => (e === existente ? estudo : e)) : [...ficha.estudos, estudo],
  };
  const aprendeu = estudo.progresso >= sucessos;
  return {
    ok: true,
    turno: {
      ficha: aprendeu ? concluirEstudo(comProgresso, estudo.id, compendio) : comProgresso,
      rolagem: feita.feita,
      cd,
      sucesso,
      progresso: Math.min(estudo.progresso, sucessos),
      necessarios: sucessos,
      aprendeu,
    },
  };
}

/** Para mostrar o progresso de um estudo guardado: quantos sucessos o tema pede, se ainda se sabe. */
export function necessariosDoEstudo(estudo: EstudoNaFicha, regras: Regras, compendio: EstadoCompendio): number | null {
  if (estudo.tipo === 'magia') {
    const magia = estudo.magiaId ? compendio.entradas[estudo.magiaId] : undefined;
    return magia?.tipo === 'magia' ? dificuldadeDaMagia(regras.aprendizado, magia.dados.nivel).sucessos : null;
  }
  const tema = regras.aprendizado.temas.find(
    (t) => t.id === estudo.temaId || (estudo.temaId === null && normalizarNome(t.nome) === normalizarNome(estudo.assunto)),
  );
  return tema?.sucessos ?? null;
}


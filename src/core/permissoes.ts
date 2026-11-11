/**
 * Quem pode fazer o quê. As regras comparam o estado antes e depois de cada mudança, como um
 * servidor fará na fase online: não importa qual botão foi apertado, só o que mudou.
 *
 * O mestre pode tudo. Os jogadores não mudam o mapa, a posição do grupo, o compêndio nem a
 * campanha. Nas fichas, o dono muda o que é do dia a dia do jogo; o resto, só com a edição
 * liberada pelo mestre.
 */
import type { Entrada } from './entradas';
import { nivelTotal, type EstadoFichas, type Ficha, type PilhaDeItem } from './fichas';
import { ehMestre, podeVer } from './visibilidade';

export { ehMestre };

export type Permissao = { readonly ok: true } | { readonly ok: false; readonly motivo: string };

export const PERMITIDO: Permissao = { ok: true };
const recusar = (motivo: string): Permissao => ({ ok: false, motivo });

/** Para o mapa, o grupo, o compêndio e a campanha: só o mestre muda. */
export function soOMestre(oQue: string) {
  return (antes: unknown, depois: unknown, autorId: string): Permissao =>
    ehMestre(autorId) || antes === depois ? PERMITIDO : recusar(`Só o mestre muda ${oQue}.`);
}

// ---------- Fichas: o que cada um vê e pode fazer ----------

export function podeVerFicha(ficha: Ficha, participanteId: string): boolean {
  return ehMestre(participanteId) || ficha.donoId === participanteId || podeVer(ficha.visibilidade, participanteId);
}

/** Rolar, usar, conjurar, descansar, equipar, arrumar as cartas: o dono e o mestre. */
export function podeAgirNaFicha(ficha: Ficha, participanteId: string): boolean {
  return ehMestre(participanteId) || ficha.donoId === participanteId;
}

/** Com a edição liberada ou durante a criação pelo assistente, o dono muda tudo na ficha. */
function liberadaParaODono(ficha: Ficha): boolean {
  return ficha.edicaoLiberada || ficha.emCriacao;
}

/** Atributos, classes, espécie, proficiências, itens novos, cópias: o mestre, ou o dono com a edição liberada. */
export function podeEditarTudo(ficha: Ficha, participanteId: string): boolean {
  return ehMestre(participanteId) || (ficha.donoId === participanteId && liberadaParaODono(ficha));
}

/** O motivo de um controle estar desativado, para a dica da tela. */
export function motivoSemEdicao(ficha: Ficha, participanteId: string): string | null {
  if (podeEditarTudo(ficha, participanteId)) {
    return null;
  }
  return podeAgirNaFicha(ficha, participanteId)
    ? 'Só o mestre muda isto, a menos que ele libere a edição da ficha.'
    : 'Esta ficha é de outro participante: você só pode olhar.';
}

export function fichasVisiveis(estado: EstadoFichas, participanteId: string): Ficha[] {
  return Object.values(estado.fichas).filter((f) => podeVerFicha(f, participanteId));
}

/**
 * Para quem um participante pode dar presentes: as fichas que ele vê e os personagens dos
 * outros jogadores (o grupo sabe quem são, mesmo sem ver as fichas).
 */
export function podeReceberPresente(ficha: Ficha, participanteId: string): boolean {
  return podeVerFicha(ficha, participanteId) || (ficha.tipo === 'personagem' && !ehMestre(ficha.donoId));
}

// ---------- Fichas: conferir uma mudança ----------

/** Campos que só o mestre muda, mesmo com a edição liberada. */
const SO_DO_MESTRE: readonly [keyof Ficha, string][] = [
  ['tipo', 'o tipo da ficha'],
  ['donoId', 'quem controla a ficha'],
  ['visibilidade', 'quem vê a ficha'],
  ['edicaoLiberada', 'a liberação da edição'],
];

/** Opções da conferência que dependem das regras da campanha. */
export interface OpcoesDaConferencia {
  /** Os jogadores podem criar os próprios personagens pelo assistente. */
  readonly jogadoresCriam?: boolean;
  /**
   * Confere os itens de um personagem em criação de um jogador (só os dos kits oferecidos).
   * Precisa do compêndio e das regras, por isso vem de fora. Sem ela, nada é conferido.
   */
  readonly itensDaCriacao?: (ficha: Ficha) => string | null;
}

/**
 * Uma ficha nova criada por um jogador: só o personagem dele, começando "em criação",
 * sem nada que só o mestre decide (edição liberada, quem vê, níveis liberados).
 */
function problemaNaFichaNova(ficha: Ficha, autorId: string, jogadoresCriam: boolean): string | null {
  if (!jogadoresCriam) {
    return 'Nesta campanha, só o mestre cria fichas.';
  }
  const valida =
    ficha.donoId === autorId &&
    ficha.tipo === 'personagem' &&
    ficha.emCriacao &&
    !ficha.edicaoLiberada &&
    ficha.visibilidade.tipo === 'mestre' &&
    ficha.niveisLiberados === 0;
  return valida ? null : 'Um jogador só cria o próprio personagem, pelo assistente de criação.';
}

/** Campos que o dono só muda com a edição liberada. */
const COM_EDICAO_LIBERADA: readonly [keyof Ficha, string][] = [
  ['atributos', 'os atributos'],
  ['classes', 'as classes e os níveis'],
  ['especieId', 'a espécie'],
  ['antecedenteId', 'o antecedente'],
  ['monstroId', 'o monstro'],
  ['proficiencias', 'as proficiências'],
  ['pvPorNivel', 'os dados de vida'],
  ['extras', 'as habilidades e magias acrescentadas'],
  ['rascunho', 'os atributos rolados na criação'],
  ['estudos', 'os estudos'],
  ['idiomas', 'os idiomas aprendidos'],
];

/** Campos do dia a dia, que o dono muda sempre. Quem recebe um presente não muda nenhum deles. */
const DO_DIA_A_DIA: readonly (keyof Ficha)[] = [
  'nome',
  'notas',
  'moedas',
  'secoes',
  'pvAtuais',
  'pvTemporarios',
  'usosGastos',
  'espacosGastos',
];

const igual = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** A mesma cópia, ainda que com outro id (quem recebe uma cópia diferente com o mesmo id ganha um id novo). */
const conteudoDaCopia = (entrada: Entrada) => JSON.stringify({ ...entrada, id: '' });

/** Quantas unidades de cada cópia (pelo conteúdo) a ficha perdeu ou ganhou de uma vez para outra. */
function diferencaDeItens(antes: Ficha, depois: Ficha) {
  const perdidas = new Map<string, number>();
  const ganhas = new Map<string, number>();
  const somar = (mapa: Map<string, number>, entradaId: string, ficha: Ficha, quantidade: number) => {
    const copia = ficha.entradas[entradaId];
    const chave = copia ? conteudoDaCopia(copia) : `?${entradaId}`;
    mapa.set(chave, (mapa.get(chave) ?? 0) + quantidade);
  };
  const depoisPorId = new Map(depois.itens.map((p) => [p.id, p]));
  for (const p of antes.itens) {
    const agora = depoisPorId.get(p.id);
    const restante = agora && agora.entradaId === p.entradaId ? agora.quantidade : 0;
    if (restante < p.quantidade) {
      somar(perdidas, p.entradaId, antes, p.quantidade - restante);
    }
  }
  const antesPorId = new Map(antes.itens.map((p) => [p.id, p]));
  for (const p of depois.itens) {
    const antiga = antesPorId.get(p.id);
    const tinha = antiga && antiga.entradaId === p.entradaId ? antiga.quantidade : 0;
    if (p.quantidade > tinha) {
      somar(ganhas, p.entradaId, depois, p.quantidade - tinha);
    }
  }
  return { perdidas, ganhas };
}

/** As pilhas sem a quantidade, para conferir que nada além dela (e das marcas) mudou. */
const semQuantidade = (itens: readonly PilhaDeItem[], comMarcas: boolean) =>
  itens.map((p) => (comMarcas ? { id: p.id, entradaId: p.entradaId, equipado: p.equipado, sintonizado: p.sintonizado } : { id: p.id, entradaId: p.entradaId }));

/**
 * As cópias só podem sumir junto com as pilhas que as usavam, ou aparecer com um item recebido.
 * Nenhuma cópia existente pode ser editada.
 */
function copiasMudaram(antes: Ficha, depois: Ficha): boolean {
  const usadasPorItens = new Set(depois.itens.map((p) => p.entradaId));
  for (const [id, copia] of Object.entries(antes.entradas)) {
    const agora = depois.entradas[id];
    if (agora ? !igual(agora, copia) : copia.tipo !== 'item' || usadasPorItens.has(id)) {
      return true;
    }
  }
  const novasDeItem = Object.keys(depois.entradas).filter((id) => !(id in antes.entradas));
  return novasDeItem.some((id) => depois.entradas[id].tipo !== 'item' || !usadasPorItens.has(id));
}

/**
 * Confere uma mudança nas fichas feita por `autorId`. Presentear muda duas fichas de uma vez:
 * o que uma ficha ganha precisa ter saído de uma ficha do mesmo autor, na mesma mudança.
 */
export function conferirFichas(
  antes: EstadoFichas,
  depois: EstadoFichas,
  autorId: string,
  { jogadoresCriam = true, itensDaCriacao }: OpcoesDaConferencia = {},
): Permissao {
  if (antes === depois || ehMestre(autorId)) {
    return PERMITIDO;
  }
  const ids = new Set([...Object.keys(antes.fichas), ...Object.keys(depois.fichas)]);
  const mudadas: [Ficha, Ficha][] = [];
  for (const id of ids) {
    const a = antes.fichas[id];
    const d = depois.fichas[id];
    if (!a && d) {
      const motivo = problemaNaFichaNova(d, autorId, jogadoresCriam);
      if (motivo) {
        return recusar(motivo);
      }
      continue;
    }
    if (a && !d) {
      // O jogador pode desistir do personagem que ainda está criando.
      if (a.donoId === autorId && a.emCriacao) {
        continue;
      }
      return recusar('Só o mestre apaga fichas.');
    }
    if (!a || !d) {
      continue;
    }
    if (a !== d && !igual(a, d)) {
      mudadas.push([a, d]);
    }
  }

  // O que saiu das fichas do autor pode ir para qualquer ficha; o resto não pode aparecer do nada.
  const doado = new Map<string, number>();
  const recebido = new Map<string, number>();
  for (const [a, d] of mudadas) {
    const { perdidas, ganhas } = diferencaDeItens(a, d);
    if (a.donoId === autorId) {
      perdidas.forEach((n, chave) => doado.set(chave, (doado.get(chave) ?? 0) + n));
    }
    // Com a edição liberada (ou durante a criação), o dono pode criar itens na própria ficha.
    if (!(a.donoId === autorId && liberadaParaODono(a))) {
      ganhas.forEach((n, chave) => recebido.set(chave, (recebido.get(chave) ?? 0) + n));
    }
  }

  for (const [a, d] of mudadas) {
    const motivo = a.donoId === autorId ? problemaNaFichaDoDono(a, d) : problemaAoReceber(a, d);
    if (motivo) {
      return recusar(motivo);
    }
    // Criando o personagem, o jogador escolhe o equipamento só pelos kits.
    const nosItens = a.donoId === autorId && d.emCriacao && !d.edicaoLiberada ? itensDaCriacao?.(d) : null;
    if (nosItens) {
      return recusar(nosItens);
    }
  }
  for (const [chave, n] of recebido) {
    if (n > (doado.get(chave) ?? 0)) {
      return recusar('Só o mestre põe itens novos numa ficha, a menos que ele libere a edição dela.');
    }
  }
  return PERMITIDO;
}

function problemaNaFichaDoDono(antes: Ficha, depois: Ficha): string | null {
  for (const [campo, nome] of SO_DO_MESTRE) {
    if (!igual(antes[campo], depois[campo])) {
      return `Só o mestre muda ${nome}.`;
    }
  }
  // Concluir a criação só vai num sentido: a ficha não volta a ficar em criação.
  if (!antes.emCriacao && depois.emCriacao) {
    return 'Só o mestre devolve uma ficha à criação.';
  }
  const gastou = antes.niveisLiberados - depois.niveisLiberados;
  if (gastou < 0) {
    return 'Só o mestre libera níveis.';
  }
  if (gastou > 1) {
    return 'Suba um nível de cada vez.';
  }
  if (liberadaParaODono(antes)) {
    return null;
  }
  if (gastou === 1) {
    return problemaNaSubida(antes, depois);
  }
  for (const [campo, nome] of COM_EDICAO_LIBERADA) {
    if (!igual(antes[campo], depois[campo])) {
      return `Só o mestre muda ${nome}, a menos que ele libere a edição da ficha.`;
    }
  }
  if (copiasMudaram(antes, depois)) {
    return 'Só o mestre muda as cópias do compêndio na ficha, a menos que ele libere a edição dela.';
  }
  return null;
}

/**
 * Uma subida de nível liberada pelo mestre: exatamente um nível a mais, aumentos de atributo de
 * no máximo 2 pontos, habilidades, talentos e magias novas, e nada tirado. Espécie, antecedente,
 * proficiências marcadas e as cópias que já existiam ficam como estavam.
 */
function problemaNaSubida(antes: Ficha, depois: Ficha): string | null {
  const recusa = (oQue: string) => `Na subida de nível, ${oQue}.`;
  if (nivelTotal(depois) !== nivelTotal(antes) + 1) {
    return recusa('a ficha ganha exatamente um nível');
  }
  for (const campo of ['especieId', 'antecedenteId', 'monstroId', 'proficiencias'] as const) {
    if (!igual(antes[campo], depois[campo])) {
      return recusa('só a classe, os PV, os atributos, os talentos e as magias mudam');
    }
  }
  const aumentos = Object.entries(depois.atributos).map(([a, v]) => v - antes.atributos[a as keyof Ficha['atributos']]);
  if (aumentos.some((n) => n < 0) || aumentos.reduce((s, n) => s + n, 0) > 2) {
    return recusa('os atributos sobem no máximo 2 pontos ao todo');
  }
  if (!antes.extras.every((id) => depois.extras.includes(id))) {
    return recusa('nada é tirado da ficha');
  }
  if (Object.entries(antes.entradas).some(([id, copia]) => depois.entradas[id] !== undefined && !igual(copia, depois.entradas[id]))) {
    return recusa('as cópias do compêndio que já estavam na ficha não mudam');
  }
  const classesAntes = new Set(antes.classes.map((c) => c.entradaId));
  const tirouCopia = Object.keys(antes.entradas).some(
    (id) => !(id in depois.entradas) && (classesAntes.has(id) || antes.extras.includes(id)),
  );
  return tirouCopia ? recusa('nada é tirado da ficha') : null;
}

/** Quem não é dono da ficha só pode ter dado algo a ela: novas pilhas ou mais unidades, nada mais. */
function problemaAoReceber(antes: Ficha, depois: Ficha): string | null {
  const recusa = 'Esta ficha é de outro participante: você só pode dar itens a ela.';
  const outros = [...SO_DO_MESTRE.map(([c]) => c), ...COM_EDICAO_LIBERADA.map(([c]) => c), ...DO_DIA_A_DIA];
  if (outros.some((campo) => !igual(antes[campo], depois[campo]))) {
    return recusa;
  }
  const mantidas = depois.itens.filter((p) => antes.itens.some((a) => a.id === p.id));
  if (!igual(semQuantidade(antes.itens, true), semQuantidade(mantidas, true))) {
    return recusa;
  }
  const encolheu = antes.itens.some((a) => (depois.itens.find((p) => p.id === a.id)?.quantidade ?? 0) < a.quantidade);
  if (encolheu || copiasMudaram(antes, depois) || Object.keys(antes.entradas).some((id) => !(id in depois.entradas))) {
    return recusa;
  }
  return null;
}

/**
 * Kits de equipamento: uma lista de itens do compêndio (e moedas) que o mestre monta para
 * entregar de uma vez. O kit é só uma conveniência: quem recebe ganha os itens separados,
 * como pilhas comuns. No assistente de criação, cada classe oferece os kits dela, e
 * antecedentes e perícias podem dar kits a mais.
 */
import type { EstadoCompendio } from './compendio';
import { MOEDAS, type Entrada, type EntradaDe } from './entradas';
import { comPilha, type Ficha } from './fichas';
import { encontrarPericia, type Regras } from './regras';

export type Kit = EntradaDe<'kit'>;

export function ehKit(entrada: Entrada | undefined): entrada is Kit {
  return entrada?.tipo === 'kit';
}

const porNome = (a: Kit, b: Kit) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

/** Os kits do compêndio, por nome. */
export function todosOsKits(compendio: EstadoCompendio): Kit[] {
  return Object.values(compendio.entradas).filter(ehKit).sort(porNome);
}

/** Os kits que a classe oferece como equipamento inicial, por nome. Sem classe, nenhum. */
export function kitsDaClasse(compendio: EstadoCompendio, classeId: string | null): Kit[] {
  return classeId === null ? [] : todosOsKits(compendio).filter((k) => k.dados.classes.includes(classeId));
}

export interface KitExtra {
  readonly kit: Kit;
  /** "pelo antecedente Acolyte" ou "pela perícia Medicina". */
  readonly motivo: string;
}

/**
 * Os kits que vêm a mais na criação, sem escolha: pelo antecedente ou por uma das perícias
 * do personagem. Um kit que vem pelos dois motivos aparece uma vez só.
 */
export function kitsExtras(
  compendio: EstadoCompendio,
  antecedenteId: string | null,
  pericias: readonly string[],
  regras: Regras,
): KitExtra[] {
  const extras: KitExtra[] = [];
  for (const kit of todosOsKits(compendio)) {
    if (antecedenteId !== null && kit.dados.extraPorAntecedente.includes(antecedenteId)) {
      extras.push({ kit, motivo: `pelo antecedente ${compendio.entradas[antecedenteId]?.nome ?? antecedenteId}` });
      continue;
    }
    const pericia = pericias.find((id) => kit.dados.extraPorPericia.includes(id));
    if (pericia) {
      extras.push({ kit, motivo: `pela perícia ${regras.pericias.find((p) => p.id === pericia)?.nome ?? pericia}` });
    }
  }
  return extras;
}

/**
 * As perícias de uma ficha em criação: as marcadas e as que o antecedente dá. É com elas que
 * os kits extras são decididos.
 */
export function periciasDaCriacao(ficha: Ficha, regras: Regras): string[] {
  const marcadas = Object.entries(ficha.proficiencias)
    .filter(([id, valor]) => valor >= 1 && regras.pericias.some((p) => p.id === id))
    .map(([id]) => id);
  const antecedente = ficha.antecedenteId ? ficha.entradas[ficha.antecedenteId] : undefined;
  const doAntecedente =
    antecedente?.tipo === 'antecedente'
      ? antecedente.dados.proficiencias.map((t) => encontrarPericia(regras, t)).filter((id): id is string => id !== null)
      : [];
  return [...new Set([...marcadas, ...doAntecedente])];
}

/** Uma linha do conteúdo do kit, para mostrar: o item pode ter sido apagado do compêndio. */
export interface LinhaDoKit {
  readonly entradaId: string;
  readonly nome: string;
  readonly quantidade: number;
  readonly existe: boolean;
}

export function conteudoDoKit(kit: Kit, compendio: EstadoCompendio): LinhaDoKit[] {
  return kit.dados.itens.map(({ entradaId, quantidade }) => {
    const item = compendio.entradas[entradaId];
    const existe = item?.tipo === 'item';
    return { entradaId, quantidade, existe, nome: existe ? item.nome : '(item apagado do compêndio)' };
  });
}

/** "15 po, 5 pp", ou vazio sem moedas. */
export function textoDasMoedas(kit: Kit): string {
  return [...MOEDAS]
    .reverse()
    .filter((m) => kit.dados.moedas[m] > 0)
    .map((m) => `${kit.dados.moedas[m]} ${m}`)
    .join(', ');
}

/**
 * Põe `quantidade` unidades de um item do compêndio na ficha. Com uma cópia igual, as unidades
 * se juntam a uma pilha não equipada dela; com uma cópia diferente de mesmo id (editada só na
 * ficha), o item entra com um id novo, para as duas existirem.
 */
function comUnidades(ficha: Ficha, item: Entrada, quantidade: number, criarId: () => string): Ficha {
  const jaTem = ficha.entradas[item.id];
  const mesmaCopia = jaTem !== undefined && JSON.stringify(jaTem) === JSON.stringify(item);
  const juntar = mesmaCopia ? ficha.itens.find((p) => p.entradaId === item.id && !p.equipado) : undefined;
  if (juntar) {
    return comPilha(ficha, juntar.id, { quantidade: juntar.quantidade + quantidade });
  }
  const copia: Entrada = jaTem && !mesmaCopia ? { ...item, id: `${item.id}~${criarId()}` } : item;
  return {
    ...ficha,
    entradas: { ...ficha.entradas, [copia.id]: copia },
    itens: [...ficha.itens, { id: criarId(), entradaId: copia.id, quantidade, equipado: false, sintonizado: false }],
  };
}

/**
 * Entrega um kit a uma ficha: cada item vira uma pilha (ou se junta a uma igual) e as moedas se
 * somam. Itens que não estão mais no compêndio ficam de fora e são devolvidos em `faltando`.
 */
export function entregarKit(
  ficha: Ficha,
  kit: Kit,
  compendio: EstadoCompendio,
  criarId: () => string = () => crypto.randomUUID(),
): { readonly ficha: Ficha; readonly faltando: readonly string[] } {
  let atual = ficha;
  const faltando: string[] = [];
  for (const { entradaId, quantidade } of kit.dados.itens) {
    const item = compendio.entradas[entradaId];
    if (item?.tipo !== 'item') {
      faltando.push(entradaId);
      continue;
    }
    atual = comUnidades(atual, item, quantidade, criarId);
  }
  const moedas = Object.fromEntries(MOEDAS.map((m) => [m, atual.moedas[m] + kit.dados.moedas[m]])) as Ficha['moedas'];
  return { ficha: { ...atual, moedas }, faltando };
}

/** Quantas unidades de cada item (pelo id no compêndio) os kits dão juntos. */
export function unidadesDosKits(kits: readonly Kit[]): Map<string, number> {
  const unidades = new Map<string, number>();
  for (const kit of kits) {
    for (const { entradaId, quantidade } of kit.dados.itens) {
      unidades.set(entradaId, (unidades.get(entradaId) ?? 0) + quantidade);
    }
  }
  return unidades;
}

/**
 * Para a loja das fichas: um jogador, criando o personagem, só fica com itens dos kits que a
 * classe dele oferece e dos extras do antecedente e das perícias. Itens livres são do mestre.
 * Devolve o problema, ou `null` se está tudo certo.
 */
export function problemaNosItensDaCriacao(ficha: Ficha, compendio: EstadoCompendio, regras: Regras): string | null {
  const rascunho = ficha.rascunho;
  if (rascunho && rascunho.itens.length > 0) {
    return 'Na criação, o jogador escolhe o equipamento só pelos kits.';
  }
  const classeId = ficha.classes[0]?.entradaId ?? null;
  const kitId = rascunho?.kitId ?? null;
  const daClasse = kitsDaClasse(compendio, classeId);
  if (kitId !== null && !daClasse.some((k) => k.id === kitId)) {
    return 'Este kit não é uma opção da classe escolhida.';
  }
  const escolhido = daClasse.filter((k) => k.id === kitId);
  const extras = kitsExtras(compendio, ficha.antecedenteId, periciasDaCriacao(ficha, regras), regras).map((e) => e.kit);
  const permitidos = unidadesDosKits([...escolhido, ...extras]);
  const naFicha = new Map<string, number>();
  for (const pilha of ficha.itens) {
    // Uma cópia com id novo ("id~xyz") conta como o item original.
    const id = pilha.entradaId.split('~')[0];
    naFicha.set(id, (naFicha.get(id) ?? 0) + pilha.quantidade);
  }
  for (const [id, n] of naFicha) {
    if (n > (permitidos.get(id) ?? 0)) {
      return 'Na criação, o jogador só fica com os itens dos kits oferecidos.';
    }
  }
  return null;
}

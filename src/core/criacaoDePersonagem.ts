/**
 * As regras do assistente de criação de personagem e de subida de nível.
 * Tudo aqui é puro: recebe as escolhas e devolve a ficha nova, ou o que falta escolher.
 * As telas só juntam as escolhas e mostram o resultado.
 */
import { espacosDeMagia, type RolagemFeita } from './acoesDaFicha';
import type { Calculo } from './calculadora';
import { calcularFicha, extrasDaClasse, proficienciasAutomaticas } from './calculoDaFicha';
import type { EstadoCompendio } from './compendio';
import { ATRIBUTOS, type Atributo, type Entrada, type EntradaDe } from './entradas';
import {
  comClasse,
  comExtra,
  comItem,
  comNivel,
  comOrigem,
  criarFicha,
  entradaDaFicha,
  NIVEL_MAXIMO,
  nivelTotal,
  type Ficha,
} from './fichas';
import { lerFormula, rolarFormula } from './formulas';
import { encontrarPericia, type MetodoAtributos, type Regras, type RegrasDeCriacao } from './regras';

export type ValoresDeAtributo = Readonly<Record<Atributo, number>>;

// ---------- Atributos ----------

/** Quantos pontos os valores custam na compra de pontos, ou o valor que não pode ser comprado. */
export function custoDosPontos(
  criacao: RegrasDeCriacao,
  valores: ValoresDeAtributo,
): { readonly ok: true; readonly gastos: number } | { readonly ok: false; readonly erro: string } {
  let gastos = 0;
  for (const atributo of ATRIBUTOS) {
    const custo = criacao.custos.find((c) => c.valor === valores[atributo]);
    if (!custo) {
      const valoresPossiveis = criacao.custos.map((c) => c.valor).sort((a, b) => a - b);
      return {
        ok: false,
        erro: `Na compra de pontos, cada atributo vai de ${valoresPossiveis[0]} a ${valoresPossiveis.at(-1)}.`,
      };
    }
    gastos += custo.custo;
  }
  return { ok: true, gastos };
}

/**
 * Se o "+" da compra de pontos pode subir este atributo para o próximo valor da tabela:
 * precisa existir um valor acima e sobrar pontos para pagar a diferença de custo.
 */
export function aumentoNaCompra(
  criacao: RegrasDeCriacao,
  valores: ValoresDeAtributo,
  atributo: Atributo,
): { readonly ok: true; readonly proximo: number } | { readonly ok: false; readonly motivo: string } {
  const tabela = [...criacao.custos].sort((a, b) => a.valor - b.valor);
  const atual = tabela.findIndex((c) => c.valor === valores[atributo]);
  const proximo = tabela[atual + 1];
  if (atual < 0 || !proximo) {
    return { ok: false, motivo: `Na compra de pontos, o máximo é ${tabela.at(-1)?.valor ?? '—'}.` };
  }
  const gasto = custoDosPontos(criacao, valores);
  if (!gasto.ok) {
    return { ok: false, motivo: gasto.erro };
  }
  const diferenca = proximo.custo - tabela[atual].custo;
  const sobram = criacao.pontos - gasto.gastos;
  if (diferenca > sobram) {
    return {
      ok: false,
      motivo: `Subir para ${proximo.valor} custa ${diferenca} ${diferenca === 1 ? 'ponto' : 'pontos'}, e ${sobram === 1 ? 'sobra 1' : `sobram ${sobram}`}.`,
    };
  }
  return { ok: true, proximo: proximo.valor };
}

/** Os mesmos números, em qualquer ordem. */
function mesmosValores(a: readonly number[], b: readonly number[]): boolean {
  const ordenar = (lista: readonly number[]) => [...lista].sort((x, y) => x - y).join(',');
  return a.length === b.length && ordenar(a) === ordenar(b);
}

/**
 * Confere os atributos escolhidos pelo método. Na rolagem, `rolados` são os seis valores que saíram.
 * Devolve o problema, ou `null` se estiver tudo certo.
 */
export function problemaNosAtributos(
  criacao: RegrasDeCriacao,
  metodo: MetodoAtributos,
  valores: ValoresDeAtributo,
  rolados: readonly number[] | null,
): string | null {
  if (!criacao.metodos.includes(metodo)) {
    return 'Este método de atributos não vale nesta campanha.';
  }
  const lista = ATRIBUTOS.map((a) => valores[a]);
  switch (metodo) {
    case 'pontos': {
      const custo = custoDosPontos(criacao, valores);
      if (!custo.ok) {
        return custo.erro;
      }
      return custo.gastos > criacao.pontos ? `Foram gastos ${custo.gastos} pontos, de ${criacao.pontos}.` : null;
    }
    case 'padrao':
      return mesmosValores(lista, criacao.conjuntoPadrao)
        ? null
        : `Distribua os valores ${criacao.conjuntoPadrao.join(', ')}, um para cada atributo.`;
    case 'rolagem':
      if (!rolados || rolados.length !== ATRIBUTOS.length) {
        return 'Role os atributos primeiro.';
      }
      return mesmosValores(lista, rolados) ? null : `Distribua os valores rolados (${rolados.join(', ')}), um para cada atributo.`;
  }
}

/** Rola os seis valores de atributo pela fórmula das regras, cada um pronto para o registro de rolagens. */
export function rolarAtributos(criacao: RegrasDeCriacao, aleatorio: () => number = Math.random): RolagemFeita[] {
  const lida = lerFormula(criacao.rolagem);
  if (!lida.ok) {
    return [];
  }
  return ATRIBUTOS.map((_, i) => {
    const rolagem = rolarFormula(lida.formula, { valor: () => undefined }, aleatorio);
    if (!rolagem.ok) {
      throw new Error(rolagem.erro);
    }
    return { rotulo: `Atributo nº ${i + 1}`, formula: criacao.rolagem, rolagem };
  });
}

// ---------- Escolhas da criação ----------

export interface EscolhasDeCriacao {
  readonly nome: string;
  readonly especieId: string | null;
  readonly classeId: string | null;
  readonly antecedenteId: string | null;
  readonly metodo: MetodoAtributos;
  /** Os valores escolhidos, antes dos aumentos da espécie. */
  readonly atributos: ValoresDeAtributo;
  /** Os seis valores rolados, quando o método é a rolagem. */
  readonly rolados: readonly number[] | null;
  /** Ids das perícias escolhidas da lista da classe. */
  readonly pericias: readonly string[];
  /** Ids das magias do compêndio. */
  readonly magias: readonly string[];
  /** Itens do compêndio, como o equipamento inicial. */
  readonly itens: readonly { readonly entradaId: string; readonly quantidade: number }[];
}

export function escolhasIniciais(criacao: RegrasDeCriacao): EscolhasDeCriacao {
  const metodo = criacao.metodos[0] ?? 'pontos';
  const menor = Math.min(...criacao.custos.map((c) => c.valor));
  return {
    nome: '',
    especieId: null,
    classeId: null,
    antecedenteId: null,
    metodo,
    atributos: Object.fromEntries(ATRIBUTOS.map((a) => [a, metodo === 'pontos' ? menor : 10])) as Record<Atributo, number>,
    rolados: null,
    pericias: [],
    magias: [],
    itens: [],
  };
}

function doTipo<T extends Entrada['tipo']>(compendio: EstadoCompendio, id: string | null, tipo: T): EntradaDe<T> | null {
  const entrada = id ? compendio.entradas[id] : undefined;
  return entrada && entrada.tipo === tipo ? (entrada as EntradaDe<T>) : null;
}

export interface OpcaoDePericia {
  readonly id: string;
  readonly nome: string;
}

/**
 * As perícias que a classe deixa escolher, achadas nas regras pelo nome ("Skill: Athletics").
 * As que o antecedente já dá ficam de fora, para a escolha não ser desperdiçada.
 */
export function periciasParaEscolher(
  classe: EntradaDe<'classe'> | null,
  antecedente: EntradaDe<'antecedente'> | null,
  regras: Regras,
): { readonly quantidade: number; readonly opcoes: readonly OpcaoDePericia[] } {
  const escolha = classe?.dados.escolhaPericias;
  if (!escolha) {
    return { quantidade: 0, opcoes: [] };
  }
  const doAntecedente = new Set(
    (antecedente?.dados.proficiencias ?? []).map((t) => encontrarPericia(regras, t)).filter((id) => id !== null),
  );
  const ids = [...new Set(escolha.opcoes.map((t) => encontrarPericia(regras, t)).filter((id): id is string => id !== null))];
  const opcoes = ids
    .filter((id) => !doAntecedente.has(id))
    .map((id) => ({ id, nome: regras.pericias.find((p) => p.id === id)?.nome ?? id }));
  return { quantidade: Math.min(escolha.quantidade, opcoes.length), opcoes };
}

/**
 * Monta a ficha com as escolhas, sobre uma ficha já existente (a da criação em andamento).
 * O que não foi escolhido fica de fora; a ficha continua "em criação" até ser concluída.
 */
export function fichaDaCriacao(base: Ficha, escolhas: EscolhasDeCriacao, compendio: EstadoCompendio, criarId: () => string): Ficha {
  // Começa do zero a cada mudança, para trocar de classe ou espécie não deixar sobras.
  let ficha: Ficha = {
    ...base,
    nome: escolhas.nome,
    atributos: { ...escolhas.atributos },
    entradas: {},
    classes: [],
    especieId: null,
    antecedenteId: null,
    proficiencias: Object.fromEntries(escolhas.pericias.map((id) => [id, 1])),
    pvPorNivel: [],
    pvAtuais: null,
    itens: [],
    extras: [],
    secoes: base.secoes.map((s) => ({ ...s, cartas: [] })),
    rascunho: { metodo: escolhas.metodo, rolados: escolhas.rolados },
  };
  if (doTipo(compendio, escolhas.especieId, 'especie')) {
    ficha = comOrigem(ficha, compendio, 'especieId', escolhas.especieId);
  }
  if (doTipo(compendio, escolhas.antecedenteId, 'antecedente')) {
    ficha = comOrigem(ficha, compendio, 'antecedenteId', escolhas.antecedenteId);
  }
  if (escolhas.classeId && doTipo(compendio, escolhas.classeId, 'classe')) {
    ficha = comClasse(ficha, compendio, escolhas.classeId);
  }
  for (const id of escolhas.magias) {
    ficha = comExtra(ficha, compendio, id);
  }
  for (const item of escolhas.itens) {
    ficha = comItem(ficha, compendio, item.entradaId, criarId(), item.quantidade);
  }
  return ficha;
}

/** Uma ficha nova, "em criação", do personagem de `donoId`, pronta para o assistente. */
export function novaFichaEmCriacao(id: string, donoId: string, criacao: RegrasDeCriacao): Ficha {
  const escolhas = escolhasIniciais(criacao);
  return {
    ...criarFicha('personagem', id, donoId),
    emCriacao: true,
    atributos: escolhas.atributos,
    rascunho: { metodo: escolhas.metodo, rolados: null },
  };
}

/** As escolhas guardadas numa ficha em criação, para o assistente continuar de onde parou. */
export function escolhasDaFicha(ficha: Ficha, regras: Regras): EscolhasDeCriacao {
  const iniciais = escolhasIniciais(regras.criacao);
  return {
    nome: ficha.nome,
    especieId: ficha.especieId,
    classeId: ficha.classes[0]?.entradaId ?? null,
    antecedenteId: ficha.antecedenteId,
    metodo: ficha.rascunho?.metodo ?? iniciais.metodo,
    atributos: ficha.atributos,
    rolados: ficha.rascunho?.rolados ?? null,
    pericias: Object.entries(ficha.proficiencias)
      .filter(([id, valor]) => valor === 1 && regras.pericias.some((p) => p.id === id))
      .map(([id]) => id),
    magias: ficha.extras.filter((id) => ficha.entradas[id]?.tipo === 'magia'),
    itens: ficha.itens.map((p) => ({ entradaId: p.entradaId, quantidade: p.quantidade })),
  };
}

/** Conclui a criação: a ficha trava como as outras e o rascunho some. */
export function concluirCriacao(ficha: Ficha): Ficha {
  return { ...ficha, emCriacao: false, rascunho: null };
}

/** O que ainda falta para concluir a criação, na ordem dos passos do assistente. Vazio quando está pronto. */
export function pendenciasDaCriacao(escolhas: EscolhasDeCriacao, compendio: EstadoCompendio, regras: Regras): string[] {
  const pendencias: string[] = [];
  if (escolhas.nome.trim() === '') {
    pendencias.push('Dê um nome ao personagem.');
  }
  if (!doTipo(compendio, escolhas.especieId, 'especie')) {
    pendencias.push('Escolha uma espécie.');
  }
  const classe = doTipo(compendio, escolhas.classeId, 'classe');
  if (!classe) {
    pendencias.push('Escolha uma classe.');
  }
  const problema = problemaNosAtributos(regras.criacao, escolhas.metodo, escolhas.atributos, escolhas.rolados);
  if (problema) {
    pendencias.push(problema);
  }
  const { quantidade, opcoes } = periciasParaEscolher(classe, doTipo(compendio, escolhas.antecedenteId, 'antecedente'), regras);
  const validas = escolhas.pericias.filter((id) => opcoes.some((o) => o.id === id));
  if (validas.length !== escolhas.pericias.length) {
    pendencias.push('Há perícias escolhidas que esta classe não oferece.');
  } else if (new Set(validas).size !== quantidade) {
    pendencias.push(`Escolha ${quantidade} perícia${quantidade === 1 ? '' : 's'} da classe.`);
  }
  return pendencias;
}

// ---------- Magias ----------

/** O maior nível de magia que a ficha conjura agora, pelos espaços da classe: 0 se só truques ou nada. */
export function nivelMaximoDeMagia(ficha: Ficha, calculo: Calculo): number {
  return espacosDeMagia(ficha, calculo).reduce((maior, e) => (e.maximo > 0 ? e.nivel : maior), 0);
}

/**
 * As magias do compêndio que a classe pode aprender, até o nível que a ficha alcança.
 * Truques entram se a tabela da classe tem truques conhecidos.
 */
export function magiasDaClasse(ficha: Ficha, classeId: string, compendio: EstadoCompendio, calculo: Calculo): EntradaDe<'magia'>[] {
  const classe = entradaDaFicha(ficha, classeId, 'classe');
  if (!classe?.dados.atributoConjuracao) {
    return [];
  }
  const maximo = nivelMaximoDeMagia(ficha, calculo);
  const truques = guiaDeMagias(ficha, classeId, calculo).truques;
  return Object.values(compendio.entradas)
    .filter((e): e is EntradaDe<'magia'> => e.tipo === 'magia' && e.dados.classes.includes(classeId))
    .filter((m) => (m.dados.nivel === 0 ? (truques ?? 0) > 0 : m.dados.nivel <= maximo))
    .sort((a, b) => a.dados.nivel - b.dados.nivel || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Quantos truques e magias a tabela da classe indica no nível atual, como guia (`null` quando a tabela não diz). */
export function guiaDeMagias(
  ficha: Ficha,
  classeId: string,
  calculo: Calculo,
): { readonly truques: number | null; readonly magiasConhecidas: number | null } {
  const naFicha = ficha.classes.find((c) => c.entradaId === classeId);
  const classe = entradaDaFicha(ficha, classeId, 'classe');
  if (!naFicha || !classe) {
    return { truques: null, magiasConhecidas: null };
  }
  const extras = extrasDaClasse({ entrada: classe, nivel: naFicha.nivel });
  const ler = (coluna: string) => {
    const celula = extras.coluna?.(coluna);
    if (!celula || celula.trim() === '') {
      return null;
    }
    const resultado = calculo.formula(celula, extras);
    return resultado.ok ? resultado.valor : null;
  };
  return { truques: ler('truques'), magiasConhecidas: ler('magias_conhecidas') };
}

// ---------- Subida de nível ----------

export type AumentoDeNivel =
  | { readonly tipo: 'atributos'; readonly aumentos: Readonly<Partial<Record<Atributo, number>>> }
  | { readonly tipo: 'talento'; readonly entradaId: string };

export interface EscolhasDeNivel {
  /** A classe que ganha o nível: uma que a ficha já tem, ou outra do compêndio (multiclasse). */
  readonly classeId: string;
  /** PV deste nível: `null` usa a média; um número é o valor rolado. */
  readonly pvRolado: number | null;
  /** Obrigatório nos níveis de aumento da classe. */
  readonly aumento: AumentoDeNivel | null;
  readonly magias: readonly string[];
}

/** A classe que vai subir, com o nível que ela terá depois da subida. */
export function classeDaSubida(ficha: Ficha, classeId: string, compendio: EstadoCompendio): { entrada: EntradaDe<'classe'>; novoNivel: number } | null {
  const naFicha = ficha.classes.find((c) => c.entradaId === classeId);
  const entrada = entradaDaFicha(ficha, classeId, 'classe') ?? doTipo(compendio, classeId, 'classe');
  if (!entrada) {
    return null;
  }
  return { entrada, novoNivel: (naFicha?.nivel ?? 0) + 1 };
}

/** As habilidades que a classe dá exatamente neste nível. */
export function habilidadesDoNivel(classe: EntradaDe<'classe'>, nivel: number, compendio: EstadoCompendio, ficha?: Ficha): Entrada[] {
  return classe.dados.habilidades
    .filter((h) => h.nivel === nivel)
    .map((h) => ficha?.entradas[h.entradaId] ?? compendio.entradas[h.entradaId])
    .filter((e): e is Entrada => e !== undefined);
}

/** O que impede a subida com estas escolhas, ou vazio se está tudo certo. */
export function pendenciasDaSubida(ficha: Ficha, escolhas: EscolhasDeNivel, compendio: EstadoCompendio, regras: Regras): string[] {
  const pendencias: string[] = [];
  if (nivelTotal(ficha) >= NIVEL_MAXIMO) {
    return [`A ficha já está no nível ${NIVEL_MAXIMO}.`];
  }
  const subida = classeDaSubida(ficha, escolhas.classeId, compendio);
  if (!subida) {
    return ['Escolha uma classe.'];
  }
  const dado = subida.entrada.dados.dadoVida;
  if (escolhas.pvRolado !== null && (!Number.isInteger(escolhas.pvRolado) || escolhas.pvRolado < 1 || escolhas.pvRolado > dado)) {
    pendencias.push(`Os PV rolados vão de 1 a ${dado}.`);
  }
  const ganhaAumento = subida.entrada.dados.niveisDeAumento.includes(subida.novoNivel);
  if (ganhaAumento && !escolhas.aumento) {
    pendencias.push('Escolha o aumento de atributo ou um talento.');
  }
  if (!ganhaAumento && escolhas.aumento) {
    pendencias.push('Este nível não dá aumento de atributo.');
  }
  if (ganhaAumento && escolhas.aumento?.tipo === 'atributos') {
    const valores = Object.entries(escolhas.aumento.aumentos).filter(([, n]) => n !== 0);
    const soma = valores.reduce((s, [, n]) => s + (n ?? 0), 0);
    if (soma !== 2 || valores.some(([, n]) => n !== 1 && n !== 2)) {
      pendencias.push('Some +2 a um atributo ou +1 a dois atributos.');
    }
    const calculo = calcularFicha(ficha, regras);
    for (const [atributo, n] of valores) {
      const atual = calculo.valor(atributo);
      if (atual.ok && atual.valor + (n ?? 0) > regras.criacao.maximoAtributo) {
        pendencias.push(`${regras.atributos[atributo as Atributo]} passaria de ${regras.criacao.maximoAtributo}.`);
      }
    }
  }
  if (ganhaAumento && escolhas.aumento?.tipo === 'talento') {
    const talento = doTipo(compendio, escolhas.aumento.entradaId, 'talento');
    if (!talento) {
      pendencias.push('Escolha um talento do compêndio.');
    } else if (ficha.extras.includes(talento.id)) {
      pendencias.push('A ficha já tem este talento.');
    }
  }
  return pendencias;
}

/**
 * A posição, entre os PV por nível, do nível novo de uma classe: os níveis aparecem agrupados
 * por classe, na ordem das classes (como em `dadosDeVida`).
 */
function posicaoDoNivelNovo(ficha: Ficha, classeId: string): number {
  let posicao = 0;
  for (const c of ficha.classes) {
    posicao += c.nivel;
    if (c.entradaId === classeId) {
      return posicao;
    }
  }
  return posicao;
}

/** Aplica a subida de nível, já conferida por `pendenciasDaSubida`. Gasta um dos níveis liberados. */
export function fichaComNivel(ficha: Ficha, escolhas: EscolhasDeNivel, compendio: EstadoCompendio): Ficha {
  const jaTem = ficha.classes.some((c) => c.entradaId === escolhas.classeId);
  const posicao = posicaoDoNivelNovo(ficha, escolhas.classeId);
  let nova = jaTem
    ? comNivel(ficha, escolhas.classeId, (ficha.classes.find((c) => c.entradaId === escolhas.classeId)?.nivel ?? 0) + 1)
    : comClasse(ficha, compendio, escolhas.classeId);
  if (nivelTotal(nova) === nivelTotal(ficha)) {
    return ficha;
  }

  // O PV rolado entra na posição do nível novo; os que vêm depois andam uma casa.
  const pvs = [...ficha.pvPorNivel];
  while (pvs.length < nivelTotal(ficha)) {
    pvs.push(null);
  }
  pvs.splice(posicao, 0, escolhas.pvRolado);
  while (pvs.length > 0 && pvs[pvs.length - 1] === null) {
    pvs.pop();
  }
  nova = { ...nova, pvPorNivel: pvs, niveisLiberados: Math.max(0, ficha.niveisLiberados - 1) };

  if (escolhas.aumento?.tipo === 'atributos') {
    const atributos = { ...nova.atributos };
    for (const [atributo, n] of Object.entries(escolhas.aumento.aumentos)) {
      atributos[atributo as Atributo] += n ?? 0;
    }
    nova = { ...nova, atributos };
  } else if (escolhas.aumento?.tipo === 'talento') {
    nova = comExtra(nova, compendio, escolhas.aumento.entradaId);
  }
  for (const id of escolhas.magias) {
    nova = comExtra(nova, compendio, id);
  }
  return nova;
}

/** Proficiências que já vêm prontas na criação, para o assistente mostrar o que não precisa escolher. */
export function periciasAutomaticas(ficha: Ficha, regras: Regras): string[] {
  return Object.keys(proficienciasAutomaticas(ficha, regras)).filter((id) => regras.pericias.some((p) => p.id === id));
}

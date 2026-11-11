/**
 * Transforma uma ficha no que a calculadora precisa: nível, PV dos dados de vida,
 * deslocamento, conjuração, proficiências e efeitos, cada um com a sua origem.
 */
import { criarCalculo, type Calculo, type EfeitoAtivo, type EntradaDoCalculo, type ExtrasDaEntrada } from './calculadora';
import { ATRIBUTOS, type Atributo, type Entrada, type EntradaDe } from './entradas';
import { entradaDaFicha, nivelTotal, pvPorNivel, type Ficha } from './fichas';
import type { ResultadoFormula } from './formulas';
import { encontrarPericia, idSalvaguarda, valoresDeViagem, type Regras } from './regras';
import type { MembroNaViagem } from './viagem';

export interface ProficienciaDaFicha {
  readonly valor: number;
  /** De onde veio: o nome da classe, do antecedente ou "marcada na ficha". */
  readonly origem: string;
}

/** Proficiências que vêm sozinhas: salvaguardas da primeira classe e perícias do antecedente. */
export function proficienciasAutomaticas(ficha: Ficha, regras: Regras): Record<string, ProficienciaDaFicha> {
  const resultado: Record<string, ProficienciaDaFicha> = {};
  const primeira = ficha.classes[0] ? entradaDaFicha(ficha, ficha.classes[0].entradaId, 'classe') : null;
  for (const atributo of primeira?.dados.salvaguardas ?? []) {
    resultado[idSalvaguarda(atributo)] = { valor: 1, origem: primeira!.nome };
  }
  const antecedente = entradaDaFicha(ficha, ficha.antecedenteId, 'antecedente');
  for (const texto of antecedente?.dados.proficiencias ?? []) {
    const pericia = encontrarPericia(regras, texto);
    if (pericia) {
      resultado[pericia] = { valor: 1, origem: antecedente!.nome };
    }
  }
  return resultado;
}

/** Todas as proficiências da ficha: as marcadas à mão valem mais que as automáticas. */
export function proficienciasDaFicha(ficha: Ficha, regras: Regras): Record<string, ProficienciaDaFicha> {
  const resultado = proficienciasAutomaticas(ficha, regras);
  for (const [id, valor] of Object.entries(ficha.proficiencias)) {
    resultado[id] = { valor, origem: 'marcada na ficha' };
  }
  return resultado;
}

/** Os aumentos da espécie e os efeitos "sempre" das entradas em uso viram efeitos ativos. */
export function efeitosDaFicha(ficha: Ficha): EfeitoAtivo[] {
  const efeitos: EfeitoAtivo[] = [];
  const especie = entradaDaFicha(ficha, ficha.especieId, 'especie');
  if (especie) {
    for (const [atributo, aumento] of Object.entries(especie.dados.aumentosAtributo)) {
      efeitos.push({
        fonte: especie.nome || 'Espécie',
        efeito: { id: `especie-${atributo}`, alvo: atributo, operacao: 'somar', valor: String(aumento), quando: 'sempre' },
      });
    }
  }
  for (const { entrada, extras } of entradasEmUso(ficha)) {
    for (const efeito of entrada.efeitos) {
      if (efeito.quando === 'sempre') {
        efeitos.push({ fonte: entrada.nome || 'Sem nome', efeito, extras });
      }
    }
  }
  return [...efeitos, ...efeitosDosItens(ficha)];
}

/** O bônus de proficiência de um monstro pelo nível de desafio, como na tabela dos livros. */
export function proficienciaDoMonstro(nivelDesafio: number): number {
  return nivelDesafio < 1 ? 2 : 2 + Math.floor((nivelDesafio - 1) / 4);
}

function fixosDoMonstro(monstro: EntradaDe<'monstro'>, regras: Regras): EntradaDoCalculo['fixos'] {
  const origem = 'ficha do monstro';
  const d = monstro.dados;
  const fixos: Record<string, { valor: number; origem: string }> = {
    ca: { valor: d.classeArmadura, origem: d.notaArmadura ? `ficha do monstro (${d.notaArmadura})` : origem },
    pv_maximos: { valor: d.pontosVida, origem: `ficha do monstro (${d.dadosVida})` },
    prof: { valor: proficienciaDoMonstro(d.nivelDesafio), origem: `nível de desafio` },
  };
  // O primeiro número do texto, como o 10,5 de "10,5 m, fly 18 m".
  const deslocamento = /\d+(?:[.,]\d+)?/.exec(d.deslocamento);
  if (deslocamento) {
    fixos.deslocamento = { valor: Number(deslocamento[0].replace(',', '.')), origem: d.deslocamento };
  }
  for (const [atributo, valor] of Object.entries(d.salvaguardas) as [Atributo, number][]) {
    fixos[idSalvaguarda(atributo)] = { valor, origem };
  }
  for (const [nome, valor] of Object.entries(d.pericias)) {
    const pericia = encontrarPericia(regras, nome);
    if (pericia) {
      fixos[pericia] = { valor, origem };
    }
  }
  return fixos;
}

export function entradaDoCalculo(ficha: Ficha, regras: Regras): EntradaDoCalculo {
  const monstro = entradaDaFicha(ficha, ficha.monstroId, 'monstro');
  const proficiencias = Object.fromEntries(
    Object.entries(proficienciasDaFicha(ficha, regras)).map(([id, p]) => [id, p.valor]),
  );
  const niveis = pvPorNivel(ficha);
  const especie = entradaDaFicha(ficha, ficha.especieId, 'especie');
  const conjuradora = ficha.classes
    .map((c) => entradaDaFicha(ficha, c.entradaId, 'classe'))
    .find((c) => c?.dados.atributoConjuracao);
  return {
    atributos: ficha.atributos,
    // Fichas sem classe, como a de muitos NPCs, contam como nível 1.
    nivel: Math.max(1, nivelTotal(ficha)),
    pvDosDados: niveis.length > 0 ? niveis.reduce((s, n) => s + n.valor, 0) : undefined,
    deslocamentoBase: especie?.dados.deslocamento,
    conjuracao: conjuradora?.dados.atributoConjuracao ?? null,
    proficiencias,
    efeitos: efeitosDaFicha(ficha),
    fixos: monstro ? fixosDoMonstro(monstro, regras) : undefined,
    equipamento: equipamentoDaFicha(ficha).variaveis,
  };
}

export function calcularFicha(ficha: Ficha, regras: Regras): Calculo {
  return criarCalculo(regras, entradaDoCalculo(ficha, regras));
}

/**
 * A ficha como a viagem a enxerga: o nome e os valores de viagem (montaria, veículo, guia, visão).
 * Um valor com problema numa fórmula de efeito vale o padrão, para não travar a viagem.
 */
export function membroNaViagem(ficha: Ficha, regras: Regras): MembroNaViagem {
  const calculo = calcularFicha(ficha, regras);
  const padroes = new Map(valoresDeViagem(regras).map((v) => [v.id, v.padrao]));
  return {
    nome: ficha.nome.trim() || 'Sem nome',
    valor: (nome) => {
      const calculado = calculo.valor(nome);
      return calculado.ok ? calculado.valor : (padroes.get(nome) ?? 0);
    },
  };
}

/** Uma habilidade da ficha, com de onde ela vem. */
export interface HabilidadeNaFicha {
  readonly entrada: EntradaDe<'habilidade'>;
  /** Como "Barbarian 1", "Hill Dwarf" ou "Acolyte". */
  readonly origem: string;
  /** Quando vem de uma classe: a classe e o nível nela, para fórmulas como `tabela(furias)`. */
  readonly classe: { readonly entrada: EntradaDe<'classe'>; readonly nivel: number } | null;
}

/** O nível e a tabela de uma classe, para fórmulas como `tabela(furias)` e `nivel_classe`. */
export function extrasDaClasse(classe: { readonly entrada: EntradaDe<'classe'>; readonly nivel: number }): ExtrasDaEntrada {
  return {
    nivelClasse: classe.nivel,
    coluna: (id) => classe.entrada.dados.tabela.find((c) => c.id === id)?.valores[classe.nivel - 1],
  };
}

/**
 * As entradas cujos efeitos "sempre" valem agora: classes, espécie, antecedente,
 * habilidades já ganhas e as habilidades e talentos acrescentados à mão.
 * Magias ficam de fora: o efeito delas vale ao conjurar, não o tempo todo.
 */
function entradasEmUso(ficha: Ficha): { entrada: Entrada; extras?: ExtrasDaEntrada }[] {
  const lista: { entrada: Entrada; extras?: ExtrasDaEntrada }[] = [];
  for (const c of ficha.classes) {
    const classe = entradaDaFicha(ficha, c.entradaId, 'classe');
    if (classe) {
      lista.push({ entrada: classe, extras: extrasDaClasse({ entrada: classe, nivel: c.nivel }) });
    }
  }
  const especie = entradaDaFicha(ficha, ficha.especieId, 'especie');
  if (especie) {
    lista.push({ entrada: especie });
  }
  const antecedente = entradaDaFicha(ficha, ficha.antecedenteId, 'antecedente');
  if (antecedente) {
    lista.push({ entrada: antecedente });
  }
  const vistas = new Set<string>();
  for (const h of habilidadesDaFicha(ficha)) {
    vistas.add(h.entrada.id);
    lista.push({ entrada: h.entrada, extras: h.classe ? extrasDaClasse(h.classe) : undefined });
  }
  for (const id of ficha.extras) {
    const entrada = ficha.entradas[id];
    if (entrada && entrada.tipo !== 'magia' && !vistas.has(id)) {
      lista.push({ entrada });
    }
  }
  return lista;
}

/**
 * Os efeitos dos itens carregados: "sempre" vale só por carregar, "equipado" quando a pilha
 * está equipada, "sintonizado" quando está sintonizada. Duas pilhas do mesmo item não somam
 * o efeito duas vezes, como no 5e (efeitos do mesmo objeto mágico não se acumulam).
 */
function efeitosDosItens(ficha: Ficha): EfeitoAtivo[] {
  const efeitos: EfeitoAtivo[] = [];
  const porEntrada = new Map<string, { equipado: boolean; sintonizado: boolean }>();
  for (const pilha of ficha.itens) {
    const atual = porEntrada.get(pilha.entradaId) ?? { equipado: false, sintonizado: false };
    porEntrada.set(pilha.entradaId, {
      equipado: atual.equipado || pilha.equipado,
      sintonizado: atual.sintonizado || pilha.sintonizado,
    });
  }
  for (const [id, estado] of porEntrada) {
    const item = entradaDaFicha(ficha, id, 'item');
    if (!item) {
      continue;
    }
    for (const efeito of item.efeitos) {
      const vale =
        efeito.quando === 'sempre' ||
        (efeito.quando === 'equipado' && estado.equipado) ||
        // Sintonizar só faz sentido em itens que pedem sintonia; nos outros, basta equipar.
        (efeito.quando === 'sintonizado' && (item.dados.requerSintonia ? estado.sintonizado : estado.equipado));
      if (vale) {
        efeitos.push({ fonte: item.nome || 'Item sem nome', efeito });
      }
    }
  }
  return efeitos;
}

/** O que a ficha tem equipado, para a regra da CA e do deslocamento. */
export interface EquipamentoDaFicha {
  readonly armadura: EntradaDe<'item'> | null;
  readonly escudo: EntradaDe<'item'> | null;
  readonly armadurasEquipadas: number;
  readonly escudosEquipados: number;
  readonly variaveis: Readonly<Record<string, { readonly valor: number; readonly origem: string }>>;
}

/** Com mais de uma armadura (ou escudo) equipada, vale a de maior CA. */
export function equipamentoDaFicha(ficha: Ficha): EquipamentoDaFicha {
  const equipados = ficha.itens
    .filter((p) => p.equipado)
    .map((p) => entradaDaFicha(ficha, p.entradaId, 'item'))
    .filter((item): item is EntradaDe<'item'> => item !== null && item.dados.armadura !== null);
  const armaduras = equipados.filter((i) => i.dados.armadura!.peso !== 'escudo');
  const escudos = equipados.filter((i) => i.dados.armadura!.peso === 'escudo');
  const melhor = (lista: EntradaDe<'item'>[]) =>
    lista.reduce<EntradaDe<'item'> | null>((m, i) => (!m || i.dados.armadura!.caBase > m.dados.armadura!.caBase ? i : m), null);
  const armadura = melhor(armaduras);
  const escudo = melhor(escudos);
  const variaveis: Record<string, { valor: number; origem: string }> = {};
  if (armadura) {
    const a = armadura.dados.armadura!;
    const origem = armadura.nome || 'Armadura';
    variaveis.usando_armadura = { valor: 1, origem };
    variaveis.armadura_pesada = { valor: a.peso === 'pesada' ? 1 : 0, origem };
    variaveis.armadura_base = { valor: a.caBase, origem };
    variaveis.armadura_des_max = { valor: a.usaDestreza ? (a.destrezaMaxima ?? Infinity) : 0, origem };
    variaveis.armadura_forca_minima = { valor: a.forcaMinima, origem };
  }
  if (escudo) {
    const origem = escudo.nome || 'Escudo';
    variaveis.usando_escudo = { valor: 1, origem };
    variaveis.escudo_bonus = { valor: escudo.dados.armadura!.caBase, origem };
  }
  return { armadura, escudo, armadurasEquipadas: armaduras.length, escudosEquipados: escudos.length, variaveis };
}

/** Limite de itens sintonizados ao mesmo tempo, como no 5e. Passar dele só mostra um aviso. */
export const LIMITE_SINTONIA = 3;

/** Avisos sobre o equipamento: o que a ficha não bloqueia, mas o jogador precisa saber. */
export function avisosDaFicha(ficha: Ficha, calculo: Calculo): string[] {
  const avisos: string[] = [];
  const equipamento = equipamentoDaFicha(ficha);
  if (equipamento.armadurasEquipadas > 1) {
    avisos.push(`${equipamento.armadurasEquipadas} armaduras equipadas: vale só ${equipamento.armadura?.nome}.`);
  }
  if (equipamento.escudosEquipados > 1) {
    avisos.push(`${equipamento.escudosEquipados} escudos equipados: vale só ${equipamento.escudo?.nome}.`);
  }
  const sintonizados = new Set(
    ficha.itens
      .filter((p) => p.sintonizado && entradaDaFicha(ficha, p.entradaId, 'item')?.dados.requerSintonia)
      .map((p) => p.entradaId),
  ).size;
  if (sintonizados > LIMITE_SINTONIA) {
    avisos.push(`${sintonizados} itens sintonizados: o limite é ${LIMITE_SINTONIA}.`);
  }
  const armadura = equipamento.armadura?.dados.armadura;
  if (armadura?.desvantagemFurtividade) {
    avisos.push(`${equipamento.armadura!.nome} dá desvantagem em Furtividade.`);
  }
  const forca = calculo.valor('for');
  if (armadura && forca.ok && forca.valor < armadura.forcaMinima) {
    avisos.push(`${equipamento.armadura!.nome} exige Força ${armadura.forcaMinima}: o deslocamento cai 3 m.`);
  }
  return avisos;
}

/** As habilidades que a ficha já tem: as das classes até o nível atual, da espécie e do antecedente. */
export function habilidadesDaFicha(ficha: Ficha): HabilidadeNaFicha[] {
  const lista: HabilidadeNaFicha[] = [];
  const vistas = new Set<string>();
  for (const c of ficha.classes) {
    const classe = entradaDaFicha(ficha, c.entradaId, 'classe');
    if (!classe) {
      continue;
    }
    const ganhas = classe.dados.habilidades
      .filter((h) => h.nivel <= c.nivel)
      .sort((a, b) => a.nivel - b.nivel);
    for (const h of ganhas) {
      const entrada = entradaDaFicha(ficha, h.entradaId, 'habilidade');
      // Uma habilidade ganha em vários níveis (como Aumento de Atributo) aparece uma vez só.
      if (entrada && !vistas.has(entrada.id)) {
        vistas.add(entrada.id);
        lista.push({ entrada, origem: `${classe.nome} ${h.nivel}`, classe: { entrada: classe, nivel: c.nivel } });
      }
    }
  }
  for (const [id, tipo] of [
    [ficha.especieId, 'especie'],
    [ficha.antecedenteId, 'antecedente'],
  ] as const) {
    const origem = entradaDaFicha(ficha, id, tipo);
    const citadas = origem ? (origem.tipo === 'especie' ? origem.dados.tracos : origem.dados.habilidades) : [];
    for (const habilidadeId of citadas) {
      const entrada = entradaDaFicha(ficha, habilidadeId, 'habilidade');
      if (entrada && !vistas.has(entrada.id)) {
        vistas.add(entrada.id);
        lista.push({ entrada, origem: origem!.nome, classe: null });
      }
    }
  }
  return lista;
}

/** Quantos usos a habilidade tem, com a tabela e o nível da classe de onde ela vem. */
export function usosDaHabilidade(
  calculo: Calculo,
  habilidade: HabilidadeNaFicha,
): ResultadoFormula<{ readonly valor: number }> | null {
  const usos = habilidade.entrada.dados.usos;
  if (!usos) {
    return null;
  }
  return calculo.formula(usos.maximo, habilidade.classe ? extrasDaClasse(habilidade.classe) : undefined);
}

export function modificadoresDaFicha(calculo: Calculo): Record<Atributo, ReturnType<Calculo['modificador']>> {
  return Object.fromEntries(ATRIBUTOS.map((a) => [a, calculo.modificador(a)])) as Record<
    Atributo,
    ReturnType<Calculo['modificador']>
  >;
}

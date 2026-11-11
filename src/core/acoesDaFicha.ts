/**
 * O que se faz com a ficha: rolar testes, atacar, usar itens e habilidades, conjurar,
 * descansar e passar itens para outra ficha. Tudo puro: devolve a ficha nova e as rolagens,
 * sem mudar nada sozinho.
 */
import type { Calculo, ExtrasDaEntrada } from './calculadora';
import { equipamentoDaFicha, extrasDaClasse, habilidadesDaFicha, type HabilidadeNaFicha } from './calculoDaFicha';
import type { AcaoDeEntrada, Entrada, EntradaDe } from './entradas';
import {
  comPilha,
  entradaDaFicha,
  ESPACOS_ZERADOS,
  semPilha,
  type Ficha,
  type Moeda,
} from './fichas';
import { lerFormula, normalizarNome, usoDaFormula, type Rolagem } from './formulas';
import { NOME_NIVEL_DO_ESPACO } from './regras';

/** Uma rolagem feita por uma ação, pronta para o registro. */
export interface RolagemFeita {
  readonly rotulo: string;
  /** A fórmula com os números já postos, como "1d20 + 6". */
  readonly formula: string;
  readonly rolagem: Rolagem;
}

export type ResultadoDaAcao =
  | { readonly ok: true; readonly ficha: Ficha; readonly rolagens: readonly RolagemFeita[] }
  | { readonly ok: false; readonly erro: string };

export type ModoDoTeste = 'normal' | 'vantagem' | 'desvantagem';

const D20: Readonly<Record<ModoDoTeste, string>> = { normal: '1d20', vantagem: '2d20kh1', desvantagem: '2d20kl1' };

function rolar(
  calculo: Calculo,
  formula: string,
  rotulo: string,
  extras: ExtrasDaEntrada | undefined,
  aleatorio: (() => number) | undefined,
  dadosDobrados = false,
): { ok: true; feita: RolagemFeita } | { ok: false; erro: string } {
  const rolagem = calculo.rolar(formula, extras, aleatorio, { dadosDobrados });
  if (!rolagem.ok) {
    return { ok: false, erro: `${rotulo}: ${rolagem.erro}` };
  }
  const texto = calculo.texto(formula, extras);
  // No crítico, os dados rolados (em `rolagem.dados`) já aparecem em dobro, como foram rolados.
  return {
    ok: true,
    feita: { rotulo: dadosDobrados ? `${rotulo} (crítico)` : rotulo, formula: texto.ok ? texto.texto : formula, rolagem },
  };
}

/**
 * Um teste de d20: `termo` é o que soma ao dado, como `atletismo`, `salvaguarda_des`,
 * `mod(FOR)` ou `iniciativa`. Vantagem rola dois d20 e fica com o maior.
 */
export function rolarTeste(
  calculo: Calculo,
  termo: string,
  rotulo: string,
  modo: ModoDoTeste = 'normal',
  aleatorio?: () => number,
): { ok: true; feita: RolagemFeita } | { ok: false; erro: string } {
  // Armadura sem proficiência: uma desvantagem nos testes de Força e Destreza (que anula a vantagem).
  const penalizado = semProficienciaNaArmadura(calculo) && envolveForcaOuDestreza(calculo, termo);
  const final: ModoDoTeste = !penalizado ? modo : modo === 'vantagem' ? 'normal' : 'desvantagem';
  const sufixo =
    (final === 'vantagem' ? ' (vantagem)' : final === 'desvantagem' ? ' (desvantagem)' : '') +
    (penalizado ? ' (armadura sem proficiência)' : '');
  return rolar(calculo, `${D20[final]} + ${termo}`, `${rotulo}${sufixo}`, undefined, aleatorio);
}

/** A ficha usa armadura ou escudo sem proficiência (a variável do equipamento). */
export function semProficienciaNaArmadura(calculo: Calculo): boolean {
  const valor = calculo.valor('armadura_sem_proficiencia');
  return valor.ok && valor.valor >= 1;
}

/**
 * Se o termo de um teste usa Força ou Destreza: os próprios atributos, as salvaguardas deles,
 * as perícias deles e os valores das regras cuja fórmula cita um deles (como a iniciativa).
 */
export function envolveForcaOuDestreza(calculo: Calculo, termo: string): boolean {
  const regras = calculo.regras;
  const nomesDe = (texto: string): string[] => {
    const lido = lerFormula(texto);
    return lido.ok ? [...usoDaFormula(lido.formula).nomes].map(normalizarNome) : [];
  };
  const fisicos = new Set(['for', 'des', 'salvaguarda_for', 'salvaguarda_des']);
  return nomesDe(termo).some(
    (nome) =>
      fisicos.has(nome) ||
      regras.pericias.some((p) => p.id === nome && (p.atributo === 'for' || p.atributo === 'des')) ||
      regras.valores.some((v) => v.id === nome && nomesDe(v.formula).some((n) => n === 'for' || n === 'des')),
  );
}

// ---------- Usos e espaços ----------

export interface UsosDaHabilidade {
  readonly maximo: number;
  readonly gastos: number;
  readonly restantes: number;
}

/** Quantos usos a habilidade tem, quantos foram gastos e quantos restam. */
export function usosDaHabilidadeNaFicha(
  ficha: Ficha,
  calculo: Calculo,
  habilidade: HabilidadeNaFicha,
): { ok: true; usos: UsosDaHabilidade } | { ok: false; erro: string } | null {
  const usos = habilidade.entrada.dados.usos;
  if (!usos) {
    return null;
  }
  const resultado = calculo.formula(usos.maximo, habilidade.classe ? extrasDaClasse(habilidade.classe) : undefined);
  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro };
  }
  const gastos = ficha.usosGastos[habilidade.entrada.id] ?? 0;
  return { ok: true, usos: { maximo: resultado.valor, gastos, restantes: Math.max(0, resultado.valor - gastos) } };
}

export interface EspacoDeMagia {
  readonly nivel: number;
  readonly maximo: number;
  readonly gastos: number;
}

/**
 * Os espaços de magia da ficha, do 1º ao 9º nível, pela tabela da primeira classe que conjura
 * (colunas `espacos_1` a `espacos_9`). A tabela de multiclasse de conjuradores fica para depois.
 */
export function espacosDeMagia(ficha: Ficha, calculo: Calculo): EspacoDeMagia[] {
  const conjuradora = ficha.classes
    .map((c) => ({ entrada: entradaDaFicha(ficha, c.entradaId, 'classe'), nivel: c.nivel }))
    .find((c) => c.entrada?.dados.atributoConjuracao);
  return ESPACOS_ZERADOS.map((_, i) => {
    const nivel = i + 1;
    let maximo = 0;
    if (conjuradora?.entrada) {
      const classe = { entrada: conjuradora.entrada, nivel: conjuradora.nivel };
      const celula = classe.entrada.dados.tabela.find((c) => c.id === `espacos_${nivel}`)?.valores[classe.nivel - 1];
      if (celula && celula.trim() !== '') {
        const resultado = calculo.formula(celula, extrasDaClasse(classe));
        maximo = resultado.ok ? Math.max(0, Math.floor(resultado.valor)) : 0;
      }
    }
    return { nivel, maximo, gastos: ficha.espacosGastos[i] ?? 0 };
  });
}

// ---------- Executar uma ação ----------

/** De onde vem a ação: a pilha do item (para consumir) ou a habilidade (para gastar usos). */
export interface OrigemDaAcao {
  readonly pilhaId?: string;
  readonly habilidade?: HabilidadeNaFicha;
  /** Nível, tabela e outros valores das fórmulas, como `nivel_espaco` ao conjurar. */
  readonly extras?: ExtrasDaEntrada;
}

function curar(ficha: Ficha, calculo: Calculo, pontos: number): Ficha {
  const maximo = calculo.valor('pv_maximos');
  if (!maximo.ok || ficha.pvAtuais === null) {
    return ficha;
  }
  const novos = ficha.pvAtuais + Math.max(0, pontos);
  return { ...ficha, pvAtuais: novos >= maximo.valor ? null : novos };
}

/**
 * Faz os passos da ação, na ordem. Se algum passo não puder ser feito (sem usos, sem itens,
 * fórmula com erro), nada acontece e o motivo volta como erro.
 */
export function executarAcao(
  ficha: Ficha,
  calculo: Calculo,
  acao: AcaoDeEntrada,
  origem: OrigemDaAcao = {},
  opcoes: { readonly aleatorio?: () => number; readonly critico?: boolean } = {},
): ResultadoDaAcao {
  const extras = origem.habilidade?.classe ? { ...extrasDaClasse(origem.habilidade.classe), ...origem.extras } : origem.extras;
  const usosPedidos = acao.passos.reduce((s, p) => (p.tipo === 'gastarUso' ? s + p.quantidade : s), 0);
  if (usosPedidos > 0) {
    const usos = origem.habilidade ? usosDaHabilidadeNaFicha(ficha, calculo, origem.habilidade) : null;
    if (!usos || !usos.ok) {
      return { ok: false, erro: usos && !usos.ok ? usos.erro : 'Esta ação gasta usos, mas não vem de uma habilidade com usos.' };
    }
    if (usos.usos.restantes < usosPedidos) {
      return { ok: false, erro: `Sem usos de ${origem.habilidade!.entrada.nome}: restam ${usos.usos.restantes}.` };
    }
  }
  const consumo = acao.passos.reduce((s, p) => (p.tipo === 'consumir' ? s + p.quantidade : s), 0);
  if (consumo > 0) {
    const pilha = ficha.itens.find((p) => p.id === origem.pilhaId);
    if (!pilha) {
      return { ok: false, erro: 'Esta ação gasta unidades de um item, mas o item não está na ficha.' };
    }
    if (pilha.quantidade < consumo) {
      return { ok: false, erro: `Não há unidades suficientes: só ${pilha.quantidade}.` };
    }
  }

  let atual = ficha;
  const rolagens: RolagemFeita[] = [];
  for (const passo of acao.passos) {
    switch (passo.tipo) {
      case 'rolar': {
        const feita = rolar(calculo, passo.formula, passo.rotulo || acao.rotulo, extras, opcoes.aleatorio, opcoes.critico);
        if (!feita.ok) {
          return feita;
        }
        rolagens.push(feita.feita);
        break;
      }
      case 'curar': {
        const feita = rolar(calculo, passo.formula, `${acao.rotulo}: cura`, extras, opcoes.aleatorio);
        if (!feita.ok) {
          return feita;
        }
        rolagens.push(feita.feita);
        atual = curar(atual, calculo, feita.feita.rolagem.total);
        break;
      }
      case 'consumir': {
        const pilha = atual.itens.find((p) => p.id === origem.pilhaId)!;
        atual =
          pilha.quantidade <= passo.quantidade
            ? semPilha(atual, pilha.id)
            : comPilha(atual, pilha.id, { quantidade: pilha.quantidade - passo.quantidade });
        break;
      }
      case 'gastarUso': {
        const id = origem.habilidade!.entrada.id;
        atual = { ...atual, usosGastos: { ...atual.usosGastos, [id]: (atual.usosGastos[id] ?? 0) + passo.quantidade } };
        break;
      }
    }
  }
  return { ok: true, ficha: atual, rolagens };
}

/** Gasta um uso de uma habilidade que não tem ações próprias, como uma Fúria. */
export function gastarUso(ficha: Ficha, calculo: Calculo, habilidade: HabilidadeNaFicha): ResultadoDaAcao {
  return executarAcao(ficha, calculo, { id: 'usar', rotulo: habilidade.entrada.nome, passos: [{ tipo: 'gastarUso', quantidade: 1 }] }, { habilidade });
}

/**
 * Conjura uma magia: gasta um espaço do nível escolhido (truques não gastam) e faz todas as ações
 * dela, com `nivel_espaco` valendo o nível do espaço (o dano sobe com espaços maiores).
 */
export function conjurar(
  ficha: Ficha,
  calculo: Calculo,
  magia: EntradaDe<'magia'>,
  nivelDoEspaco: number,
  aleatorio?: () => number,
): ResultadoDaAcao {
  // Como no 5e: com armadura ou escudo sem proficiência, não se conjura.
  const semProficiencia = equipamentoDaFicha(ficha).variaveis.armadura_sem_proficiencia;
  if (semProficiencia) {
    return { ok: false, erro: `Usando ${semProficiencia.origem} sem proficiência, não dá para conjurar magias.` };
  }
  let atual = ficha;
  const nivel = magia.dados.nivel === 0 ? 0 : Math.max(magia.dados.nivel, nivelDoEspaco);
  if (magia.dados.nivel > 0) {
    const espaco = espacosDeMagia(ficha, calculo)[nivel - 1];
    if (!espaco || espaco.maximo - espaco.gastos <= 0) {
      return { ok: false, erro: `Sem espaços de magia de ${nivel}º nível.` };
    }
    const gastos = [...atual.espacosGastos];
    gastos[nivel - 1] = (gastos[nivel - 1] ?? 0) + 1;
    atual = { ...atual, espacosGastos: gastos };
  }
  const rolagens: RolagemFeita[] = [];
  for (const acao of magia.acoes) {
    const resultado = executarAcao(atual, calculo, acao, { extras: { valores: { [NOME_NIVEL_DO_ESPACO]: Math.max(nivel, magia.dados.nivel) } } }, { aleatorio });
    if (!resultado.ok) {
      return resultado;
    }
    atual = resultado.ficha;
    rolagens.push(...resultado.rolagens);
  }
  return { ok: true, ficha: atual, rolagens };
}

// ---------- Descansos ----------

/** Descanso curto: voltam os usos das habilidades que recarregam no descanso curto. */
export function descansoCurto(ficha: Ficha): Ficha {
  const usosGastos = Object.fromEntries(
    Object.entries(ficha.usosGastos).filter(([id]) => {
      const habilidade = entradaDaFicha(ficha, id, 'habilidade');
      return habilidade?.dados.usos?.recarga !== 'descanso-curto';
    }),
  );
  return { ...ficha, usosGastos };
}

/** Descanso longo: voltam todos os usos, os espaços de magia e os PV. */
export function descansoLongo(ficha: Ficha): Ficha {
  return { ...ficha, usosGastos: {}, espacosGastos: ESPACOS_ZERADOS, pvAtuais: null };
}

// ---------- Armas ----------

/** A ficha sabe usar a arma: "Simple Weapons", "Martial Weapons" ou o nome dela nas proficiências. */
export function proficienteComArma(ficha: Ficha, item: EntradaDe<'item'>): boolean {
  const arma = item.dados.arma;
  if (!arma) {
    return false;
  }
  const textos = [
    ...ficha.classes.flatMap((c) => entradaDaFicha(ficha, c.entradaId, 'classe')?.dados.proficiencias ?? []),
    ...(entradaDaFicha(ficha, ficha.antecedenteId, 'antecedente')?.dados.proficiencias ?? []),
    // As aprendidas treinando à noite.
    ...ficha.proficienciasExtras,
  ].map(normalizarNome);
  const categoria = arma.dominio === 'simples' ? ['simple weapons', 'armas simples'] : ['martial weapons', 'armas marciais'];
  const nome = normalizarNome(item.nome).replace(/,.*$/, '').trim();
  return textos.some((t) => categoria.includes(t) || (nome.length > 2 && t.includes(nome)));
}

/**
 * Ataque e dano automáticos de uma arma: d20 + atributo (+ proficiência), e o dano + atributo.
 * Armas à distância usam Destreza; as com "Finesse" usam a melhor entre Força e Destreza.
 */
export function acoesDaArma(ficha: Ficha, item: EntradaDe<'item'>): AcaoDeEntrada[] {
  const arma = item.dados.arma;
  if (!arma) {
    return [];
  }
  const propriedades = arma.propriedades.map(normalizarNome);
  const atributo =
    arma.alcanceTipo === 'distancia'
      ? 'mod(DES)'
      : propriedades.includes('finesse') || propriedades.includes('acuidade')
        ? 'max(mod(FOR), mod(DES))'
        : 'mod(FOR)';
  const prof = proficienteComArma(ficha, item) ? ' + prof' : '';
  const nome = item.nome || 'Arma';
  // Todo ataque com arma usa Força ou Destreza: armadura sem proficiência dá desvantagem.
  const penalizado = equipamentoDaFicha(ficha).variaveis.armadura_sem_proficiencia !== undefined;
  const d20 = penalizado ? '2d20kl1' : '1d20';
  const aviso = penalizado ? ' (desvantagem: armadura sem proficiência)' : '';
  const acoes: AcaoDeEntrada[] = [
    { id: 'auto-ataque', rotulo: 'Atacar', passos: [{ tipo: 'rolar', formula: `${d20} + ${atributo}${prof}`, rotulo: `${nome}: ataque${aviso}` }] },
  ];
  if (arma.dano.trim() !== '') {
    acoes.push({
      id: 'auto-dano',
      rotulo: 'Dano',
      passos: [{ tipo: 'rolar', formula: `${arma.dano} + ${atributo}`, rotulo: `${nome}: dano${arma.tipoDano ? ` (${arma.tipoDano.toLowerCase()})` : ''}` }],
    });
  }
  if (arma.danoVersatil) {
    acoes.push({
      id: 'auto-dano-duas-maos',
      rotulo: 'Dano com as duas mãos',
      passos: [{ tipo: 'rolar', formula: `${arma.danoVersatil} + ${atributo}`, rotulo: `${nome}: dano com as duas mãos` }],
    });
  }
  return acoes;
}

/** As ações de uma rolagem de dano podem ser roladas como crítico (dados em dobro). */
export function ehAcaoDeDano(acao: AcaoDeEntrada): boolean {
  return /dano|damage/i.test(acao.rotulo) || acao.passos.some((p) => p.tipo === 'rolar' && /dano|damage/i.test(p.rotulo));
}

// ---------- Passar itens e moedas entre fichas ----------

/**
 * Passa `quantidade` unidades de uma pilha para outra ficha (presentear; e, no futuro, trocar).
 * Quem recebe ganha a própria cópia do item; se já tem uma cópia igual, as unidades se juntam
 * a uma pilha não equipada dela. Devolve as duas fichas novas, ou `null` se não der.
 */
export function transferirItem(
  origem: Ficha,
  destino: Ficha,
  pilhaId: string,
  quantidade: number,
  criarId: () => string = () => crypto.randomUUID(),
): readonly [Ficha, Ficha] | null {
  const pilha = origem.itens.find((p) => p.id === pilhaId);
  const item = pilha ? origem.entradas[pilha.entradaId] : undefined;
  if (!pilha || !item || origem.id === destino.id) {
    return null;
  }
  const q = Math.max(1, Math.min(Math.round(quantidade), pilha.quantidade));
  const novaOrigem = q >= pilha.quantidade ? semPilha(origem, pilhaId) : comPilha(origem, pilhaId, { quantidade: pilha.quantidade - q });

  const jaTem = destino.entradas[item.id];
  const mesmaCopia = jaTem !== undefined && JSON.stringify(jaTem) === JSON.stringify(item);
  // Uma cópia diferente com o mesmo id (editada só numa das fichas) ganha um id novo, para as duas existirem.
  const copia: Entrada = jaTem && !mesmaCopia ? { ...item, id: `${item.id}~${criarId()}` } : item;
  const juntar = mesmaCopia ? destino.itens.find((p) => p.entradaId === item.id && !p.equipado) : undefined;
  const novoDestino: Ficha = juntar
    ? comPilha(destino, juntar.id, { quantidade: juntar.quantidade + q })
    : {
        ...destino,
        entradas: { ...destino.entradas, [copia.id]: copia },
        itens: [...destino.itens, { id: criarId(), entradaId: copia.id, quantidade: q, equipado: false, sintonizado: false }],
      };
  return [novaOrigem, novoDestino];
}

/** Passa moedas de uma ficha para outra, se a origem tiver o bastante. */
export function transferirMoedas(origem: Ficha, destino: Ficha, moeda: Moeda, quantidade: number): readonly [Ficha, Ficha] | null {
  const q = Math.round(quantidade);
  if (q <= 0 || origem.moedas[moeda] < q || origem.id === destino.id) {
    return null;
  }
  return [
    { ...origem, moedas: { ...origem.moedas, [moeda]: origem.moedas[moeda] - q } },
    { ...destino, moedas: { ...destino.moedas, [moeda]: destino.moedas[moeda] + q } },
  ];
}

/** As habilidades da ficha, para achar a de uma carta. */
export function habilidadeNaFicha(ficha: Ficha, entradaId: string): HabilidadeNaFicha | null {
  const automatica = habilidadesDaFicha(ficha).find((h) => h.entrada.id === entradaId);
  if (automatica) {
    return automatica;
  }
  const extra = ficha.extras.includes(entradaId) ? entradaDaFicha(ficha, entradaId, 'habilidade') : null;
  return extra ? { entrada: extra, origem: 'acrescentada', classe: null } : null;
}

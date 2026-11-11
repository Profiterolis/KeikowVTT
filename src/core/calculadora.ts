/**
 * Calcula os valores de uma ficha a partir das regras (dados), do que a ficha informa
 * e dos efeitos ativos, guardando de onde vem cada número.
 */
import { ATRIBUTOS, type Atributo, type Efeito, type OperacaoEfeito } from './entradas';
import {
  calcularFormula,
  ErroDeFormula,
  formatarNumero,
  lerFormula,
  normalizarNome,
  rolarFormula,
  textoResolvido,
  type ContextoFormula,
  type FormulaLida,
  type Parte,
  type ResultadoFormula,
  type Rolagem,
} from './formulas';
import {
  ENTRADAS_DA_FICHA,
  VARIAVEIS_DO_EQUIPAMENTO,
  idSalvaguarda,
  NOME_DO_VALOR_NO_MODIFICADOR,
  NOME_NIVEL_DA_CLASSE,
  rotuloDoNome,
  valoresDeViagem,
  type Regras,
} from './regras';

/** Um efeito em vigor, com o nome de quem o causa, como "Anel de Proteção". */
export interface EfeitoAtivo {
  readonly fonte: string;
  readonly efeito: Efeito;
  /** Para efeitos de uma habilidade de classe: o nível e a tabela daquela classe. */
  readonly extras?: ExtrasDaEntrada;
}

/** O que a ficha informa para o cálculo. */
export interface EntradaDoCalculo {
  readonly atributos: Readonly<Record<Atributo, number>>;
  readonly nivel: number;
  readonly pvDosDados?: number;
  readonly deslocamentoBase?: number;
  /** O atributo usado para conjurar magias, se houver. */
  readonly conjuracao?: Atributo | null;
  /** Multiplicador de proficiência por perícia ou salvaguarda: 1 proficiente, 2 especialista, 0.5 metade. */
  readonly proficiencias?: Readonly<Record<string, number>>;
  readonly efeitos?: readonly EfeitoAtivo[];
  /**
   * Valores que já vêm prontos e substituem a regra, como a CA e os PV de um monstro.
   * Os efeitos continuam valendo por cima deles.
   */
  readonly fixos?: Readonly<Record<string, { readonly valor: number; readonly origem: string }>>;
  /** O que está equipado, como `armadura_base` ou `usando_escudo`. O que faltar vale o padrão (nada equipado). */
  readonly equipamento?: Readonly<Record<string, { readonly valor: number; readonly origem: string }>>;
}

/** O que um efeito fez (ou não fez) com um valor. */
export interface Ajuste {
  readonly fonte: string;
  readonly operacao: OperacaoEfeito;
  readonly formula: string;
  /** `null` quando a fórmula do efeito tem um problema. */
  readonly valor: number | null;
  /** Um "no mínimo" menor que o valor, ou qualquer efeito vencido por um "definir", não conta. */
  readonly aplicado: boolean;
  readonly erro?: string;
}

export type Calculado =
  | {
      readonly ok: true;
      readonly valor: number;
      /** O valor antes dos efeitos. */
      readonly base: number;
      /** As parcelas da fórmula que deram a base. */
      readonly partes: readonly Parte[];
      readonly ajustes: readonly Ajuste[];
    }
  | { readonly ok: false; readonly erro: string };

/** O que muda numa fórmula de habilidade de uma classe, como os usos da Fúria. */
export interface ExtrasDaEntrada {
  readonly nivelClasse?: number;
  /** O texto da célula de uma coluna da tabela da classe, no nível atual. */
  readonly coluna?: (coluna: string) => string | undefined;
  /** Outros nomes que só existem nesta fórmula, como `nivel_espaco` ao conjurar uma magia. */
  readonly valores?: Readonly<Record<string, number>>;
}

export interface Calculo {
  readonly regras: Regras;
  /** Um atributo, valor, perícia, salvaguarda ou dado da ficha, como `des`, `ca` ou `furtividade`. */
  valor(nome: string): Calculado;
  modificador(atributo: Atributo): Calculado;
  /** Uma fórmula avulsa, como os usos de uma habilidade. */
  formula(texto: string, extras?: ExtrasDaEntrada): ResultadoFormula<{ readonly valor: number; readonly partes: readonly Parte[] }>;
  rolar(
    texto: string,
    extras?: ExtrasDaEntrada,
    aleatorio?: () => number,
    opcoes?: { readonly dadosDobrados?: boolean },
  ): ResultadoFormula<Rolagem>;
  /** A fórmula com os números já postos, mantendo os dados: `1d8 + mod(FOR)` → `1d8 + 3`. */
  texto(texto: string, extras?: ExtrasDaEntrada): ResultadoFormula<{ readonly texto: string }>;
  rotulo(nome: string): string;
}

// As mesmas fórmulas são lidas muitas vezes: guardar a leitura poupa trabalho.
const LEITURAS = new Map<string, ReturnType<typeof lerFormula>>();
const LIMITE_LEITURAS = 5000;

export function lerFormulaGuardada(texto: string): ReturnType<typeof lerFormula> {
  let lido = LEITURAS.get(texto);
  if (!lido) {
    if (LEITURAS.size >= LIMITE_LEITURAS) {
      LEITURAS.clear();
    }
    lido = lerFormula(texto);
    LEITURAS.set(texto, lido);
  }
  return lido;
}

function exigirLida(texto: string, onde: string): FormulaLida {
  const lido = lerFormulaGuardada(texto);
  if (!lido.ok) {
    throw new ErroDeFormula(`${onde} tem um erro: ${lido.erro}`);
  }
  return lido.formula;
}

const ZERO = exigirLida('0', 'O zero');

export function criarCalculo(regras: Regras, entrada: EntradaDoCalculo): Calculo {
  const valores = new Map(regras.valores.map((v) => [v.id, v]));
  const pericias = new Map(regras.pericias.map((p) => [p.id, p]));
  const salvaguardas = new Map(ATRIBUTOS.map((a) => [idSalvaguarda(a), a]));
  const deViagem = new Map(valoresDeViagem(regras).map((v) => [v.id, v]));
  const efeitosPorAlvo = new Map<string, EfeitoAtivo[]>();
  for (const ativo of entrada.efeitos ?? []) {
    const alvo = normalizarNome(ativo.efeito.alvo.trim());
    efeitosPorAlvo.set(alvo, [...(efeitosPorAlvo.get(alvo) ?? []), ativo]);
  }

  const memoria = new Map<string, Calculado>();
  const emCalculo: string[] = [];
  const rotulo = (nome: string) => rotuloDoNome(regras, nome);
  const ehAtributo = (nome: string): nome is Atributo => (ATRIBUTOS as readonly string[]).includes(nome);
  const conhecido = (nome: string) =>
    ehAtributo(nome) ||
    nome in ENTRADAS_DA_FICHA ||
    nome in VARIAVEIS_DO_EQUIPAMENTO ||
    deViagem.has(nome) ||
    valores.has(nome) ||
    pericias.has(nome) ||
    salvaguardas.has(nome);

  /** O número de um nome, para as fórmulas. Um nome com problema vira erro na fórmula que o cita. */
  function numeroDe(nome: string): number | undefined {
    if (!conhecido(nome)) {
      return undefined;
    }
    const resultado = calculado(nome);
    if (!resultado.ok) {
      throw new ErroDeFormula(`Depende de "${rotulo(nome)}": ${resultado.erro}`);
    }
    return resultado.valor;
  }

  function modificar(valor: number): number {
    const lida = exigirLida(regras.modificador, 'A regra do modificador');
    const resultado = calcularFormula(lida, {
      valor: (nome) => (nome === NOME_DO_VALOR_NO_MODIFICADOR ? valor : undefined),
    });
    if (!resultado.ok) {
      throw new ErroDeFormula(`A regra do modificador tem um erro: ${resultado.erro}`);
    }
    return resultado.valor;
  }

  const funcao = (nome: string, argumentos: readonly number[]) =>
    nome === 'mod' && argumentos.length === 1 ? modificar(argumentos[0]) : undefined;
  const contextoGeral: ContextoFormula = { valor: numeroDe, funcao };

  function calculado(nome: string): Calculado {
    const pronto = memoria.get(nome);
    if (pronto) {
      return pronto;
    }
    const indice = emCalculo.indexOf(nome);
    if (indice >= 0) {
      return { ok: false, erro: `Depende de si mesmo: ${[...emCalculo.slice(indice), nome].map(rotulo).join(' → ')}.` };
    }
    emCalculo.push(nome);
    let resultado: Calculado;
    try {
      resultado = calcularNome(nome);
    } catch (erro) {
      if (!(erro instanceof ErroDeFormula)) {
        throw erro;
      }
      resultado = { ok: false, erro: erro.message };
    } finally {
      emCalculo.pop();
    }
    memoria.set(nome, resultado);
    return resultado;
  }

  function daFicha(valor: number | undefined, texto: string, faltando: string): Calculado {
    return valor === undefined
      ? { ok: false, erro: faltando }
      : { ok: true, valor, base: valor, partes: [{ texto, valor }], ajustes: [] };
  }

  function calcularNome(nome: string): Calculado {
    const fixo = entrada.fixos?.[nome];
    if (fixo && !(nome in ENTRADAS_DA_FICHA)) {
      return comEfeitos(nome, fixo.valor, [{ texto: fixo.origem, valor: fixo.valor }]);
    }
    const doEquipamento = VARIAVEIS_DO_EQUIPAMENTO[nome];
    if (doEquipamento) {
      const informado = entrada.equipamento?.[nome];
      const valor = informado?.valor ?? doEquipamento.padrao;
      return { ok: true, valor, base: valor, partes: [{ texto: informado?.origem ?? 'nada equipado', valor }], ajustes: [] };
    }
    const daViagem = deViagem.get(nome);
    if (daViagem) {
      return comEfeitos(nome, daViagem.padrao, [{ texto: 'padrão', valor: daViagem.padrao }]);
    }
    if (ehAtributo(nome)) {
      const base = entrada.atributos[nome];
      return comEfeitos(nome, base, [{ texto: 'valor na ficha', valor: base }]);
    }
    switch (nome) {
      case 'nivel':
        return daFicha(entrada.nivel, 'nível na ficha', 'A ficha não informa o nível.');
      case 'pv_dos_dados':
        return daFicha(entrada.pvDosDados, 'dados de vida', 'A ficha não informa os PV dos dados de vida.');
      case 'deslocamento_base':
        return daFicha(entrada.deslocamentoBase, 'espécie', 'A ficha não informa o deslocamento da espécie.');
      case 'conjuracao': {
        const atributo = entrada.conjuracao;
        if (!atributo) {
          return { ok: false, erro: 'A ficha não tem atributo de conjuração.' };
        }
        const valor = numeroDe(atributo) as number;
        return { ok: true, valor, base: valor, partes: [{ texto: rotulo(atributo), valor, nome: atributo }], ajustes: [] };
      }
    }
    const definicao = valores.get(nome);
    if (definicao) {
      const resultado = calcularFormula(exigirLida(definicao.formula, `A fórmula de "${definicao.nome}"`), contextoGeral);
      return resultado.ok ? comEfeitos(nome, resultado.valor, resultado.partes) : { ok: false, erro: resultado.erro };
    }
    const pericia = pericias.get(nome);
    if (pericia) {
      return comoPericia(nome, regras.formulaPericia, pericia.atributo, 'A fórmula das perícias');
    }
    const atributo = salvaguardas.get(nome);
    if (atributo) {
      return comoPericia(nome, regras.formulaSalvaguarda, atributo, 'A fórmula das salvaguardas');
    }
    return { ok: false, erro: `Nome desconhecido: "${nome}".` };
  }

  /** Perícias e salvaguardas usam uma fórmula comum, com `atributo` e `proficiencia` próprios. */
  function comoPericia(nome: string, formula: string, atributo: Atributo, onde: string): Calculado {
    const multiplicador = entrada.proficiencias?.[nome] ?? 0;
    const valorAtributo = numeroDe(atributo) as number;
    const resultado = calcularFormula(exigirLida(formula, onde), {
      valor: (n) => (n === 'atributo' ? valorAtributo : n === 'proficiencia' ? multiplicador : numeroDe(n)),
      funcao,
    });
    if (!resultado.ok) {
      return { ok: false, erro: resultado.erro };
    }
    // Na explicação, "mod(atributo)" vira "mod(DES)" e "proficiencia" vira o multiplicador.
    const partes = resultado.partes.map((parte) => ({
      ...parte,
      texto: parte.texto
        .replace(/\batributo\b/giu, atributo.toUpperCase())
        .replace(/\bprofici[eêÊ]ncia\b/giu, formatarNumero(multiplicador)),
      ...(parte.nome === 'atributo' ? { nome: atributo } : {}),
    }));
    return comEfeitos(nome, resultado.valor, partes);
  }

  /**
   * Aplica os efeitos: o maior entre a base e os "no mínimo", depois as somas.
   * Um "definir" vence tudo; com vários, vale o menor (em geral são restrições, como Agarrado).
   */
  function comEfeitos(nome: string, base: number, partes: readonly Parte[]): Calculado {
    const lista = efeitosPorAlvo.get(nome) ?? [];
    const avaliados = lista.map(({ fonte, efeito, extras }) => {
      const comum = { fonte, operacao: efeito.operacao, formula: efeito.valor };
      const lido = lerFormulaGuardada(efeito.valor);
      if (!lido.ok) {
        return { ...comum, valor: null, erro: lido.erro };
      }
      const resultado = calcularFormula(lido.formula, extras ? contextoDaEntrada(extras) : contextoGeral);
      return resultado.ok ? { ...comum, valor: resultado.valor } : { ...comum, valor: null, erro: resultado.erro };
    });

    const indiceDo = (operacao: OperacaoEfeito, melhor: (a: number, b: number) => boolean) => {
      let escolhido = -1;
      avaliados.forEach((a, i) => {
        if (a.operacao === operacao && a.valor !== null && (escolhido < 0 || melhor(a.valor, avaliados[escolhido].valor as number))) {
          escolhido = i;
        }
      });
      return escolhido;
    };

    let valor = base;
    const aplicados = new Set<number>();
    const maiorMinimo = indiceDo('minimo', (a, b) => a > b);
    if (maiorMinimo >= 0 && (avaliados[maiorMinimo].valor as number) > valor) {
      valor = avaliados[maiorMinimo].valor as number;
      aplicados.add(maiorMinimo);
    }
    avaliados.forEach((a, i) => {
      if (a.operacao === 'somar' && a.valor !== null) {
        valor += a.valor;
        aplicados.add(i);
      }
    });
    const menorDefinir = indiceDo('definir', (a, b) => a < b);
    if (menorDefinir >= 0) {
      valor = avaliados[menorDefinir].valor as number;
      aplicados.clear();
      aplicados.add(menorDefinir);
    }
    return {
      ok: true,
      valor,
      base,
      partes,
      ajustes: avaliados.map((a, i) => ({ ...a, aplicado: aplicados.has(i) })),
    };
  }

  function contextoDaEntrada(extras: ExtrasDaEntrada | undefined): ContextoFormula {
    const coluna = extras?.coluna;
    return {
      valor: (nome) =>
        extras?.valores?.[nome] ??
        (nome === NOME_NIVEL_DA_CLASSE && extras?.nivelClasse !== undefined ? extras.nivelClasse : numeroDe(nome)),
      funcao,
      tabela: coluna
        ? (nome) => {
            const texto = coluna(nome);
            if (texto === undefined) {
              return undefined;
            }
            // Célula vazia, como o "—" dos livros, vale zero.
            return texto.trim() === '' ? ZERO : exigirLida(texto, `A coluna "${nome}" da tabela`);
          }
        : undefined,
    };
  }

  function comFormula<T>(texto: string, fazer: (lida: FormulaLida) => ResultadoFormula<T>): ResultadoFormula<T> {
    const lido = lerFormulaGuardada(texto);
    return lido.ok ? fazer(lido.formula) : lido;
  }

  return {
    regras,
    valor: (nome) => calculado(normalizarNome(nome)),
    modificador(atributo) {
      const resultado = calculado(atributo);
      if (!resultado.ok) {
        return resultado;
      }
      try {
        const valor = modificar(resultado.valor);
        return {
          ok: true,
          valor,
          base: valor,
          partes: [{ texto: `mod(${atributo.toUpperCase()})`, valor, nome: atributo, funcao: 'mod' }],
          ajustes: [],
        };
      } catch (erro) {
        if (erro instanceof ErroDeFormula) {
          return { ok: false, erro: erro.message };
        }
        throw erro;
      }
    },
    formula: (texto, extras) => comFormula(texto, (lida) => calcularFormula(lida, contextoDaEntrada(extras))),
    rolar: (texto, extras, aleatorio, opcoes) =>
      comFormula(texto, (lida) => rolarFormula(lida, contextoDaEntrada(extras), aleatorio, opcoes)),
    texto: (texto, extras) => comFormula(texto, (lida) => textoResolvido(lida, contextoDaEntrada(extras))),
    rotulo,
  };
}

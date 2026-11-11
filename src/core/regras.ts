/**
 * As regras do sistema, guardadas como dados: cada valor da ficha é uma fórmula com nome.
 * O programa traz regras parecidas com 5e (`regrasPadrao.ts`); cada campanha poderá
 * ter a própria cópia, editável.
 */
import { ATRIBUTOS, type Atributo } from './entradas';
import { lerFormula, normalizarNome, usoDaFormula, type FormulaLida } from './formulas';
import { ehObjeto, ErroDeFormato, exigir } from './persistencia';
import { lerViagem, problemasNaViagem, type RegrasDeViagem } from './viagem';

export interface DefinicaoValor {
  /** Nome usado nas fórmulas e nos efeitos, como `ca`. */
  readonly id: string;
  /** Nome mostrado na ficha, como "Classe de Armadura". */
  readonly nome: string;
  readonly formula: string;
  readonly descricao: string;
}

export interface DefinicaoPericia {
  readonly id: string;
  readonly nome: string;
  readonly atributo: Atributo;
  /** Outros nomes da perícia, como o nome em inglês do SRD ("Stealth"). */
  readonly apelidos?: readonly string[];
}

/**
 * A perícia citada num texto, como "Skill: Insight", "Furtividade" ou "stealth".
 * Devolve o id da perícia, ou `null` se o texto não for de uma perícia conhecida.
 */
export function encontrarPericia(regras: Regras, texto: string): string | null {
  const limpo = normalizarNome(texto.trim())
    .replace(/^(skill|pericia)\s*:\s*/, '')
    .trim();
  const pericia = regras.pericias.find(
    (p) => p.id === limpo || normalizarNome(p.nome) === limpo || (p.apelidos ?? []).some((a) => normalizarNome(a) === limpo),
  );
  return pericia?.id ?? null;
}

/** Como os atributos são escolhidos na criação de personagem. */
export const METODOS_ATRIBUTOS = ['pontos', 'padrao', 'rolagem'] as const;
export type MetodoAtributos = (typeof METODOS_ATRIBUTOS)[number];

export interface RegrasDeCriacao {
  /** Os jogadores podem criar os próprios personagens pelo assistente. */
  readonly jogadoresCriam: boolean;
  /** Os métodos de atributos que valem nesta campanha, ao menos um. */
  readonly metodos: readonly MetodoAtributos[];
  /** Pontos para gastar na compra de pontos. */
  readonly pontos: number;
  /** Quanto custa cada valor na compra de pontos; só esses valores podem ser comprados. */
  readonly custos: readonly { readonly valor: number; readonly custo: number }[];
  /** Os seis valores do conjunto padrão, distribuídos entre os atributos. */
  readonly conjuntoPadrao: readonly number[];
  /** A fórmula rolada para cada atributo, como `4d6kh3`. */
  readonly rolagem: string;
  /** Nenhum atributo passa disto por aumentos de nível. */
  readonly maximoAtributo: number;
}

export interface Regras {
  readonly nome: string;
  /** Nome de cada atributo, como "Destreza". */
  readonly atributos: Readonly<Record<Atributo, string>>;
  /** O modificador de um atributo. `valor` é o valor do atributo. */
  readonly modificador: string;
  /** O bônus de uma perícia. `atributo` é o valor do atributo dela; `proficiencia`, o multiplicador (0, ½, 1 ou 2). */
  readonly formulaPericia: string;
  /** O bônus de uma salvaguarda, com os mesmos nomes da perícia. */
  readonly formulaSalvaguarda: string;
  readonly pericias: readonly DefinicaoPericia[];
  /** Peso de cada moeda, em quilos. Zero faz as moedas não pesarem. */
  readonly pesoPorMoeda: number;
  /** Os demais valores da ficha, na ordem em que aparecem. */
  readonly valores: readonly DefinicaoValor[];
  readonly criacao: RegrasDeCriacao;
  /** Tempo de viagem no hexcrawl: tamanho do hex, ritmos e tags de terreno. */
  readonly viagem: RegrasDeViagem;
}

/** Valores que vêm da própria ficha, e não de uma fórmula. */
export const ENTRADAS_DA_FICHA: Readonly<Record<string, string>> = {
  nivel: 'Nível',
  pv_dos_dados: 'PV dos dados de vida',
  deslocamento_base: 'Deslocamento da espécie',
  conjuracao: 'Atributo de conjuração',
};

/**
 * O que a ficha tem equipado, para as regras e efeitos usarem: CA com armadura,
 * Defesa sem Armadura etc. Sem nada equipado, valem os padrões.
 */
export const VARIAVEIS_DO_EQUIPAMENTO: Readonly<Record<string, { readonly rotulo: string; readonly padrao: number }>> = {
  usando_armadura: { rotulo: 'Usando armadura (1 sim, 0 não)', padrao: 0 },
  armadura_pesada: { rotulo: 'Usando armadura pesada (1 sim, 0 não)', padrao: 0 },
  armadura_base: { rotulo: 'CA base da armadura', padrao: 10 },
  armadura_des_max: { rotulo: 'Destreza máxima da armadura', padrao: Infinity },
  armadura_forca_minima: { rotulo: 'Força mínima da armadura', padrao: 0 },
  usando_escudo: { rotulo: 'Usando escudo (1 sim, 0 não)', padrao: 0 },
  escudo_bonus: { rotulo: 'Bônus do escudo', padrao: 0 },
};

/** Nomes que só existem dentro de certas fórmulas. */
export const NOME_DO_VALOR_NO_MODIFICADOR = 'valor';
export const NOMES_LOCAIS_DA_PERICIA = ['atributo', 'proficiencia'] as const;
/** Nas fórmulas de habilidades de uma classe: o nível naquela classe. */
export const NOME_NIVEL_DA_CLASSE = 'nivel_classe';
/** Nas fórmulas de uma magia: o nível do espaço usado para conjurá-la (sobe o dano ao usar espaço maior). */
export const NOME_NIVEL_DO_ESPACO = 'nivel_espaco';

const RESERVADOS: ReadonlySet<string> = new Set([
  'e',
  'ou',
  'ilimitado',
  NOME_DO_VALOR_NO_MODIFICADOR,
  ...NOMES_LOCAIS_DA_PERICIA,
  NOME_NIVEL_DA_CLASSE,
  NOME_NIVEL_DO_ESPACO,
]);

export function idSalvaguarda(atributo: Atributo): string {
  return `salvaguarda_${atributo}`;
}

/** Todos os nomes que qualquer fórmula da ficha pode citar. */
export function nomesDasRegras(regras: Regras): ReadonlySet<string> {
  return new Set([
    ...ATRIBUTOS,
    ...Object.keys(ENTRADAS_DA_FICHA),
    ...Object.keys(VARIAVEIS_DO_EQUIPAMENTO),
    ...ATRIBUTOS.map(idSalvaguarda),
    ...regras.pericias.map((p) => p.id),
    ...regras.valores.map((v) => v.id),
  ]);
}

/** O nome legível de um nome usado nas fórmulas: `des` → "Destreza". */
export function rotuloDoNome(regras: Regras, nome: string): string {
  if ((ATRIBUTOS as readonly string[]).includes(nome)) {
    return regras.atributos[nome as Atributo];
  }
  const salvaguarda = ATRIBUTOS.find((a) => idSalvaguarda(a) === nome);
  if (salvaguarda) {
    return `Salvaguarda de ${regras.atributos[salvaguarda]}`;
  }
  return (
    ENTRADAS_DA_FICHA[nome] ??
    VARIAVEIS_DO_EQUIPAMENTO[nome]?.rotulo ??
    regras.pericias.find((p) => p.id === nome)?.nome ??
    regras.valores.find((v) => v.id === nome)?.nome ??
    (nome === NOME_NIVEL_DA_CLASSE ? 'Nível na classe' : nome)
  );
}

export interface OpcoesDeConferencia {
  /** Nomes a mais que esta fórmula pode citar, como `nivel_classe`. */
  readonly extras?: Iterable<string>;
  /** Colunas que `tabela(...)` pode citar: `null` proíbe `tabela`, `'qualquer'` não confere. */
  readonly colunas: ReadonlySet<string> | null | 'qualquer';
  readonly dados: 'permitidos' | 'proibidos';
}

/**
 * Confere uma fórmula de entrada do compêndio antes de usá-la, como os usos de uma habilidade
 * ou uma célula da tabela. Devolve o primeiro problema, ou `null` se estiver tudo certo.
 */
export function problemaNaFormula(regras: Regras, texto: string, opcoes: OpcoesDeConferencia): string | null {
  const lido = lerFormula(texto);
  if (!lido.ok) {
    return lido.erro;
  }
  const uso = usoDaFormula(lido.formula);
  const permitidos = new Set([...nomesDasRegras(regras), ...(opcoes.extras ?? [])]);
  const desconhecido = [...uso.nomes].find((nome) => !permitidos.has(nome));
  if (desconhecido) {
    return `Nome desconhecido: "${desconhecido}".`;
  }
  const funcao = [...uso.funcoes].find((f) => f !== 'mod');
  if (funcao) {
    return `Função desconhecida: "${funcao}".`;
  }
  if (uso.colunas.size > 0) {
    if (opcoes.colunas === null) {
      return '"tabela(...)" só funciona em fórmulas de uma classe.';
    }
    if (opcoes.colunas !== 'qualquer') {
      const permitidas = opcoes.colunas;
      const coluna = [...uso.colunas].find((c) => !permitidas.has(c));
      if (coluna) {
        return `A tabela da classe não tem a coluna "${coluna}".`;
      }
    }
  }
  if (uso.temDados && opcoes.dados === 'proibidos') {
    return 'Esta fórmula não pode rolar dados.';
  }
  return null;
}

export interface ProblemaNasRegras {
  /** Onde está o problema, como "Classe de Armadura". */
  readonly onde: string;
  readonly erro: string;
}

/**
 * Confere as regras antes de usá-las: fórmulas válidas, nomes conhecidos,
 * nada de dados e nenhum valor que dependa de si mesmo.
 */
export function conferirRegras(regras: Regras): ProblemaNasRegras[] {
  const problemas: ProblemaNasRegras[] = [];
  const globais = nomesDasRegras(regras);

  // Ids: válidos, sem repetir e sem tomar nomes reservados.
  const vistos = new Set<string>([
    ...ATRIBUTOS,
    ...Object.keys(ENTRADAS_DA_FICHA),
    ...Object.keys(VARIAVEIS_DO_EQUIPAMENTO),
    ...ATRIBUTOS.map(idSalvaguarda),
  ]);
  for (const { id, nome } of [...regras.pericias, ...regras.valores]) {
    if (!/^[a-z_][a-z0-9_]*$/.test(id)) {
      problemas.push({ onde: nome, erro: `O nome "${id}" só pode ter letras minúsculas sem acento, números e "_".` });
    } else if (vistos.has(id) || RESERVADOS.has(id)) {
      problemas.push({ onde: nome, erro: `O nome "${id}" já é usado por outra coisa.` });
    }
    vistos.add(id);
  }

  const lidas = new Map<string, FormulaLida>();
  const conferir = (
    onde: string,
    chave: string,
    texto: string,
    permitidos: ReadonlySet<string>,
    podeUsarMod: boolean,
  ) => {
    const lido = lerFormula(texto);
    if (!lido.ok) {
      problemas.push({ onde, erro: lido.erro });
      return;
    }
    lidas.set(chave, lido.formula);
    const uso = usoDaFormula(lido.formula);
    for (const nome of uso.nomes) {
      if (!permitidos.has(nome)) {
        problemas.push({ onde, erro: `Nome desconhecido: "${nome}".` });
      }
    }
    for (const funcao of uso.funcoes) {
      if (!(podeUsarMod && funcao === 'mod')) {
        problemas.push({ onde, erro: `Função desconhecida: "${funcao}".` });
      }
    }
    if (uso.colunas.size > 0) {
      problemas.push({ onde, erro: '"tabela(...)" só funciona em habilidades de uma classe, não nas regras gerais.' });
    }
    if (uso.temDados) {
      problemas.push({ onde, erro: 'As regras da ficha não podem rolar dados.' });
    }
  };

  conferir('Modificador', '#modificador', regras.modificador, new Set([NOME_DO_VALOR_NO_MODIFICADOR]), false);
  const comLocais = new Set([...globais, ...NOMES_LOCAIS_DA_PERICIA]);
  conferir('Fórmula das perícias', '#pericia', regras.formulaPericia, comLocais, true);
  conferir('Fórmula das salvaguardas', '#salvaguarda', regras.formulaSalvaguarda, comLocais, true);
  for (const valor of regras.valores) {
    conferir(valor.nome, valor.id, valor.formula, globais, true);
  }

  // Dependências entre valores calculados, para achar círculos como "ca depende de ca".
  const calculados = new Set([...regras.pericias.map((p) => p.id), ...ATRIBUTOS.map(idSalvaguarda), ...regras.valores.map((v) => v.id)]);
  const usosDe = (chave: string) => {
    const lida = lidas.get(chave);
    return lida ? [...usoDaFormula(lida).nomes].filter((n) => calculados.has(n)) : [];
  };
  const dependencias = new Map<string, string[]>();
  for (const pericia of regras.pericias) {
    dependencias.set(pericia.id, usosDe('#pericia'));
  }
  for (const atributo of ATRIBUTOS) {
    dependencias.set(idSalvaguarda(atributo), usosDe('#salvaguarda'));
  }
  for (const valor of regras.valores) {
    dependencias.set(valor.id, usosDe(valor.id));
  }
  const estado = new Map<string, 'visitando' | 'pronto'>();
  const caminho: string[] = [];
  const circulos = new Set<string>();
  const visitar = (id: string) => {
    if (estado.get(id) === 'pronto') {
      return;
    }
    if (estado.get(id) === 'visitando') {
      const ciclo = [...caminho.slice(caminho.indexOf(id)), id];
      const chave = [...new Set(ciclo)].sort().join(',');
      if (!circulos.has(chave)) {
        circulos.add(chave);
        problemas.push({
          onde: rotuloDoNome(regras, id),
          erro: `Depende de si mesmo: ${ciclo.join(' → ')}.`,
        });
      }
      return;
    }
    estado.set(id, 'visitando');
    caminho.push(id);
    for (const proximo of dependencias.get(id) ?? []) {
      visitar(proximo);
    }
    caminho.pop();
    estado.set(id, 'pronto');
  };
  for (const id of dependencias.keys()) {
    visitar(id);
  }
  problemas.push(...problemasNaCriacao(regras.criacao));
  problemas.push(...problemasNaViagem(regras.viagem));
  return problemas;
}

/** Confere as regras de criação de personagem: métodos, pontos, custos, conjunto e rolagem. */
function problemasNaCriacao(criacao: RegrasDeCriacao): ProblemaNasRegras[] {
  const problemas: ProblemaNasRegras[] = [];
  const onde = 'Criação de personagem';
  const valorDeAtributo = (n: number) => Number.isInteger(n) && n >= 1 && n <= 30;
  if (criacao.metodos.length === 0) {
    problemas.push({ onde, erro: 'Escolha ao menos um método de atributos.' });
  }
  if (!Number.isInteger(criacao.pontos) || criacao.pontos < 0) {
    problemas.push({ onde, erro: 'Os pontos precisam ser um número inteiro, zero ou mais.' });
  }
  if (criacao.custos.length === 0) {
    problemas.push({ onde, erro: 'A compra de pontos precisa de ao menos um valor com custo.' });
  }
  if (criacao.custos.some((c) => !valorDeAtributo(c.valor) || !Number.isInteger(c.custo) || c.custo < 0)) {
    problemas.push({ onde, erro: 'Cada custo precisa de um valor de 1 a 30 e um custo inteiro, zero ou mais.' });
  }
  if (new Set(criacao.custos.map((c) => c.valor)).size !== criacao.custos.length) {
    problemas.push({ onde, erro: 'Há valores repetidos na tabela de custos.' });
  }
  if (criacao.conjuntoPadrao.length !== ATRIBUTOS.length || !criacao.conjuntoPadrao.every(valorDeAtributo)) {
    problemas.push({ onde, erro: `O conjunto padrão precisa de ${ATRIBUTOS.length} valores de 1 a 30.` });
  }
  if (!valorDeAtributo(criacao.maximoAtributo)) {
    problemas.push({ onde, erro: 'O máximo de um atributo precisa ser de 1 a 30.' });
  }
  const lida = lerFormula(criacao.rolagem);
  if (!lida.ok) {
    problemas.push({ onde: 'Rolagem dos atributos', erro: lida.erro });
  } else {
    const uso = usoDaFormula(lida.formula);
    if (!uso.temDados || uso.nomes.size > 0 || uso.funcoes.size > 0 || uso.colunas.size > 0) {
      problemas.push({ onde: 'Rolagem dos atributos', erro: 'Use só dados e números, como 4d6kh3.' });
    }
  }
  return problemas;
}

// ---------- Leitura de regras guardadas ----------

function texto(d: Record<string, unknown>, campo: string, onde: string): string {
  const valor = d[campo];
  exigir(typeof valor === 'string', `${onde}: "${campo}" precisa ser um texto.`);
  return valor;
}

function lerCriacao(valor: unknown, padrao: RegrasDeCriacao): RegrasDeCriacao {
  // Regras guardadas antes do assistente de criação não têm este bloco: valem as padrão.
  if (valor === undefined) {
    return padrao;
  }
  const onde = 'A criação de personagem';
  exigir(ehObjeto(valor), `${onde} não é válida.`);
  const numeros = (lista: unknown, oQue: string) => {
    exigir(Array.isArray(lista) && lista.every((n) => typeof n === 'number'), `${onde}: ${oQue} não são válidos.`);
    return lista as number[];
  };
  exigir(typeof valor.jogadoresCriam === 'boolean', `${onde}: "jogadoresCriam" precisa ser sim ou não.`);
  exigir(
    Array.isArray(valor.metodos) && valor.metodos.every((m) => (METODOS_ATRIBUTOS as readonly unknown[]).includes(m)),
    `${onde}: os métodos são desconhecidos.`,
  );
  exigir(typeof valor.pontos === 'number' && typeof valor.maximoAtributo === 'number', `${onde}: os números não são válidos.`);
  exigir(
    Array.isArray(valor.custos) && valor.custos.every((c) => ehObjeto(c) && typeof c.valor === 'number' && typeof c.custo === 'number'),
    `${onde}: os custos não são válidos.`,
  );
  return {
    jogadoresCriam: valor.jogadoresCriam,
    metodos: [...new Set(valor.metodos as MetodoAtributos[])],
    pontos: valor.pontos,
    custos: (valor.custos as { valor: number; custo: number }[]).map((c) => ({ valor: c.valor, custo: c.custo })),
    conjuntoPadrao: numeros(valor.conjuntoPadrao, 'os valores do conjunto padrão'),
    rolagem: texto(valor, 'rolagem', onde),
    maximoAtributo: valor.maximoAtributo,
  };
}

/**
 * Lê regras guardadas num arquivo ou na campanha, e confere as fórmulas.
 * `padrao` completa regras antigas, gravadas antes de existirem a criação de personagem ou a viagem.
 */
export interface PadroesDasRegras {
  readonly criacao?: RegrasDeCriacao;
  readonly viagem?: RegrasDeViagem;
}

export function lerRegras(valor: unknown, padrao: PadroesDasRegras = {}): Regras {
  exigir(ehObjeto(valor), 'As regras não são válidas.');
  const atributos = valor.atributos;
  exigir(ehObjeto(atributos), 'As regras estão sem os nomes dos atributos.');
  const nomesAtributos = Object.fromEntries(
    ATRIBUTOS.map((a) => [a, texto(atributos, a, 'Os nomes dos atributos')]),
  ) as Record<Atributo, string>;
  exigir(Array.isArray(valor.pericias), 'As regras estão sem a lista de perícias.');
  exigir(Array.isArray(valor.valores), 'As regras estão sem a lista de valores.');
  const regras: Regras = {
    nome: texto(valor, 'nome', 'As regras'),
    atributos: nomesAtributos,
    modificador: texto(valor, 'modificador', 'As regras'),
    formulaPericia: texto(valor, 'formulaPericia', 'As regras'),
    formulaSalvaguarda: texto(valor, 'formulaSalvaguarda', 'As regras'),
    pesoPorMoeda: (() => {
      const peso = valor.pesoPorMoeda;
      exigir(typeof peso === 'number' && Number.isFinite(peso) && peso >= 0, 'As regras: o peso das moedas é inválido.');
      return peso;
    })(),
    pericias: valor.pericias.map((p, i) => {
      const onde = `A perícia nº ${i + 1}`;
      exigir(ehObjeto(p), `${onde} não é válida.`);
      const atributo = p.atributo;
      exigir(
        typeof atributo === 'string' && (ATRIBUTOS as readonly string[]).includes(atributo),
        `${onde}: o atributo é desconhecido.`,
      );
      const apelidos = p.apelidos;
      exigir(
        apelidos === undefined || (Array.isArray(apelidos) && apelidos.every((a) => typeof a === 'string')),
        `${onde}: os apelidos precisam ser uma lista de textos.`,
      );
      return {
        id: normalizarNome(texto(p, 'id', onde)),
        nome: texto(p, 'nome', onde),
        atributo: atributo as Atributo,
        ...(apelidos ? { apelidos: apelidos as string[] } : {}),
      };
    }),
    valores: valor.valores.map((v, i) => {
      const onde = `O valor nº ${i + 1}`;
      exigir(ehObjeto(v), `${onde} não é válido.`);
      return {
        id: normalizarNome(texto(v, 'id', onde)),
        nome: texto(v, 'nome', onde),
        formula: texto(v, 'formula', onde),
        descricao: typeof v.descricao === 'string' ? v.descricao : '',
      };
    }),
    criacao: (() => {
      exigir(valor.criacao !== undefined || padrao.criacao !== undefined, 'As regras estão sem a criação de personagem.');
      return lerCriacao(valor.criacao, padrao.criacao!);
    })(),
    viagem: (() => {
      exigir(valor.viagem !== undefined || padrao.viagem !== undefined, 'As regras estão sem a viagem.');
      return lerViagem(valor.viagem, padrao.viagem!);
    })(),
  };
  const problemas = conferirRegras(regras);
  if (problemas.length > 0) {
    throw new ErroDeFormato(`Regras com problema em "${problemas[0].onde}": ${problemas[0].erro}`);
  }
  return regras;
}

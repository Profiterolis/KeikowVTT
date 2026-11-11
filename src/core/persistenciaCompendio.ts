import type { EstadoCompendio } from './compendio';
import { pesParaMetros, textoParaMetrico } from './unidades';
import {
  ATRIBUTOS,
  CATEGORIAS_ITEM,
  ESCOLAS_MAGIA,
  MOEDAS,
  NIVEIS_DA_TABELA,
  NIVEIS_DE_AUMENTO_PADRAO,
  OPERACOES_EFEITO,
  PESOS_ARMADURA,
  QUANDO_EFEITO,
  RARIDADES,
  RECARGAS,
  TAMANHOS,
  TIPOS_ENTRADA,
  type AcaoDeEntrada,
  type Atributo,
  type BlocoDeTexto,
  type ColunaTabela,
  type DadosArma,
  type DadosArmadura,
  type DadosPorTipo,
  type Efeito,
  type Entrada,
  type OrigemEntrada,
  type PassoDeAcao,
  type TipoEntrada,
} from './entradas';
import {
  ehObjeto,
  ErroDeFormato,
  exigir,
  lerVisibilidade,
  type ResultadoDe,
} from './persistencia';

/** Aumente ao mudar o formato das entradas, e acrescente a conversão em CONVERSOES. */
export const VERSAO_COMPENDIO = 7;

type Dado = Record<string, unknown>;

function objeto(valor: unknown, onde: string): Dado {
  exigir(ehObjeto(valor), `${onde} não é válido.`);
  return valor;
}

function texto(d: Dado, campo: string, onde: string): string {
  const valor = d[campo];
  exigir(typeof valor === 'string', `${onde}: "${campo}" precisa ser um texto.`);
  return valor;
}

function textoPreenchido(d: Dado, campo: string, onde: string): string {
  const valor = texto(d, campo, onde);
  exigir(valor !== '', `${onde}: "${campo}" não pode ficar vazio.`);
  return valor;
}

function textoOuNulo(d: Dado, campo: string, onde: string): string | null {
  return d[campo] === null ? null : texto(d, campo, onde);
}

function numero(
  d: Dado,
  campo: string,
  onde: string,
  { inteiro = false, minimo = -Infinity, maximo = Infinity } = {},
): number {
  const valor = d[campo];
  exigir(
    typeof valor === 'number' &&
      Number.isFinite(valor) &&
      (!inteiro || Number.isInteger(valor)) &&
      valor >= minimo &&
      valor <= maximo,
    `${onde}: "${campo}" tem um número inválido.`,
  );
  return valor as number;
}

function numeroOuNulo(d: Dado, campo: string, onde: string): number | null {
  return d[campo] === null ? null : numero(d, campo, onde);
}

function booleano(d: Dado, campo: string, onde: string): boolean {
  const valor = d[campo];
  exigir(typeof valor === 'boolean', `${onde}: "${campo}" precisa ser sim ou não.`);
  return valor;
}

function opcao<T extends string>(d: Dado, campo: string, valores: readonly T[], onde: string): T {
  const valor = d[campo];
  exigir(
    typeof valor === 'string' && (valores as readonly string[]).includes(valor),
    `${onde}: "${campo}" tem um valor desconhecido.`,
  );
  return valor as T;
}

function opcaoOuNulo<T extends string>(
  d: Dado,
  campo: string,
  valores: readonly T[],
  onde: string,
): T | null {
  return d[campo] === null ? null : opcao(d, campo, valores, onde);
}

function lista<T>(d: Dado, campo: string, onde: string, ler: (item: unknown, onde: string) => T): T[] {
  const valor = d[campo];
  exigir(Array.isArray(valor), `${onde}: "${campo}" precisa ser uma lista.`);
  return valor.map((item, i) => ler(item, `${onde}, ${campo} nº ${i + 1}`));
}

function listaDeTextos(d: Dado, campo: string, onde: string): string[] {
  return lista(d, campo, onde, (item, aqui) => {
    exigir(typeof item === 'string', `${aqui} precisa ser um texto.`);
    return item;
  });
}

function numerosPorNome(d: Dado, campo: string, onde: string): Record<string, number> {
  const mapa = objeto(d[campo], `${onde}: "${campo}"`);
  const resultado: Record<string, number> = {};
  for (const nome of Object.keys(mapa)) {
    resultado[nome] = numero(mapa, nome, `${onde}: "${campo}"`, { inteiro: true });
  }
  return resultado;
}

function numerosPorAtributo(
  d: Dado,
  campo: string,
  onde: string,
  todos: boolean,
): Partial<Record<Atributo, number>> {
  const valores = numerosPorNome(d, campo, onde);
  for (const nome of Object.keys(valores)) {
    exigir((ATRIBUTOS as readonly string[]).includes(nome), `${onde}: "${campo}" tem um atributo desconhecido.`);
  }
  if (todos) {
    exigir(
      ATRIBUTOS.every((atributo) => atributo in valores),
      `${onde}: "${campo}" precisa ter os seis atributos.`,
    );
  }
  return valores;
}

function lerOrigem(valor: unknown, onde: string): OrigemEntrada {
  const d = objeto(valor, `${onde}: a origem`);
  if (d.tipo === 'campanha') {
    return { tipo: 'campanha' };
  }
  exigir(d.tipo === 'pacote', `${onde}: a origem é desconhecida.`);
  return { tipo: 'pacote', pacote: textoPreenchido(d, 'pacote', onde) };
}

function lerEfeito(valor: unknown, onde: string): Efeito {
  const d = objeto(valor, onde);
  return {
    id: textoPreenchido(d, 'id', onde),
    alvo: textoPreenchido(d, 'alvo', onde),
    operacao: opcao(d, 'operacao', OPERACOES_EFEITO, onde),
    valor: textoPreenchido(d, 'valor', onde),
    quando: opcao(d, 'quando', QUANDO_EFEITO, onde),
  };
}

function lerPasso(valor: unknown, onde: string): PassoDeAcao {
  const d = objeto(valor, onde);
  switch (d.tipo) {
    case 'rolar':
      return {
        tipo: 'rolar',
        formula: textoPreenchido(d, 'formula', onde),
        rotulo: texto(d, 'rotulo', onde),
      };
    case 'curar':
      return { tipo: 'curar', formula: textoPreenchido(d, 'formula', onde) };
    case 'consumir':
      return { tipo: 'consumir', quantidade: numero(d, 'quantidade', onde, { inteiro: true, minimo: 1 }) };
    case 'gastarUso':
      return { tipo: 'gastarUso', quantidade: numero(d, 'quantidade', onde, { inteiro: true, minimo: 1 }) };
    default:
      throw new ErroDeFormato(`${onde} tem um tipo de passo desconhecido.`);
  }
}

function lerAcao(valor: unknown, onde: string): AcaoDeEntrada {
  const d = objeto(valor, onde);
  return {
    id: textoPreenchido(d, 'id', onde),
    rotulo: textoPreenchido(d, 'rotulo', onde),
    passos: lista(d, 'passos', onde, lerPasso),
  };
}

function lerBloco(valor: unknown, onde: string): BlocoDeTexto {
  const d = objeto(valor, onde);
  return { nome: texto(d, 'nome', onde), descricao: texto(d, 'descricao', onde) };
}

function lerArma(valor: unknown, onde: string): DadosArma | null {
  if (valor === null) {
    return null;
  }
  const d = objeto(valor, `${onde}: a arma`);
  let alcance: DadosArma['alcance'] = null;
  if (d.alcance !== null) {
    const a = objeto(d.alcance, `${onde}: o alcance`);
    alcance = { normal: numero(a, 'normal', onde, { minimo: 0 }), longo: numeroOuNulo(a, 'longo', onde) };
  }
  return {
    dominio: opcao(d, 'dominio', ['simples', 'marcial'] as const, onde),
    alcanceTipo: opcao(d, 'alcanceTipo', ['corpo-a-corpo', 'distancia'] as const, onde),
    dano: texto(d, 'dano', onde),
    tipoDano: texto(d, 'tipoDano', onde),
    danoVersatil: textoOuNulo(d, 'danoVersatil', onde),
    alcance,
    propriedades: listaDeTextos(d, 'propriedades', onde),
  };
}

function lerArmadura(valor: unknown, onde: string): DadosArmadura | null {
  if (valor === null) {
    return null;
  }
  const d = objeto(valor, `${onde}: a armadura`);
  return {
    peso: opcao(d, 'peso', PESOS_ARMADURA, onde),
    caBase: numero(d, 'caBase', onde, { inteiro: true }),
    usaDestreza: booleano(d, 'usaDestreza', onde),
    destrezaMaxima: numeroOuNulo(d, 'destrezaMaxima', onde),
    forcaMinima: numero(d, 'forcaMinima', onde, { inteiro: true, minimo: 0 }),
    desvantagemFurtividade: booleano(d, 'desvantagemFurtividade', onde),
  };
}

/** As colunas da tabela de nível de uma classe. As fórmulas são conferidas na tela, não aqui. */
function lerTabela(d: Dado, onde: string): ColunaTabela[] {
  const ids = new Set<string>();
  return lista(d, 'tabela', onde, (item, aqui) => {
    const c = objeto(item, aqui);
    const id = textoPreenchido(c, 'id', aqui);
    exigir(/^[a-z_][a-z0-9_]*$/.test(id), `${aqui}: o nome "${id}" só pode ter letras minúsculas sem acento, números e "_".`);
    exigir(!ids.has(id), `${aqui}: a coluna "${id}" está repetida.`);
    ids.add(id);
    const valores = listaDeTextos(c, 'valores', aqui);
    exigir(valores.length === NIVEIS_DA_TABELA, `${aqui} precisa ter um valor para cada nível, do 1 ao ${NIVEIS_DA_TABELA}.`);
    return { id, nome: texto(c, 'nome', aqui), valores };
  });
}

type LeitorDeDados ={ readonly [T in TipoEntrada]: (d: Dado, onde: string) => DadosPorTipo[T] };

const LER_DADOS: LeitorDeDados = {
  item: (d, onde) => {
    let custo: DadosPorTipo['item']['custo'] = null;
    if (d.custo !== null) {
      const c = objeto(d.custo, `${onde}: o custo`);
      custo = {
        quantidade: numero(c, 'quantidade', onde, { minimo: 0 }),
        moeda: opcao(c, 'moeda', MOEDAS, onde),
      };
    }
    return {
      categoria: opcao(d, 'categoria', CATEGORIAS_ITEM, onde),
      peso: numero(d, 'peso', onde, { minimo: 0 }),
      custo,
      raridade: opcaoOuNulo(d, 'raridade', RARIDADES, onde),
      requerSintonia: booleano(d, 'requerSintonia', onde),
      empilhavel: booleano(d, 'empilhavel', onde),
      arma: lerArma(d.arma, onde),
      armadura: lerArmadura(d.armadura, onde),
    };
  },
  magia: (d, onde) => {
    const c = objeto(d.componentes, `${onde}: os componentes`);
    return {
      nivel: numero(d, 'nivel', onde, { inteiro: true, minimo: 0, maximo: 9 }),
      escola: opcao(d, 'escola', ESCOLAS_MAGIA, onde),
      tempoConjuracao: texto(d, 'tempoConjuracao', onde),
      alcance: texto(d, 'alcance', onde),
      componentes: {
        verbal: booleano(c, 'verbal', onde),
        somatico: booleano(c, 'somatico', onde),
        material: textoOuNulo(c, 'material', onde),
      },
      duracao: texto(d, 'duracao', onde),
      concentracao: booleano(d, 'concentracao', onde),
      ritual: booleano(d, 'ritual', onde),
      classes: listaDeTextos(d, 'classes', onde),
    };
  },
  habilidade: (d, onde) => {
    let usos: DadosPorTipo['habilidade']['usos'] = null;
    if (d.usos !== null) {
      const u = objeto(d.usos, `${onde}: os usos`);
      usos = { maximo: textoPreenchido(u, 'maximo', onde), recarga: opcao(u, 'recarga', RECARGAS, onde) };
    }
    return { requisito: texto(d, 'requisito', onde), usos };
  },
  classe: (d, onde) => ({
    dadoVida: numero(d, 'dadoVida', onde, { inteiro: true, minimo: 1 }),
    salvaguardas: lista(d, 'salvaguardas', onde, (item, aqui) => {
      exigir(
        typeof item === 'string' && (ATRIBUTOS as readonly string[]).includes(item),
        `${aqui} não é um atributo.`,
      );
      return item as Atributo;
    }),
    proficiencias: listaDeTextos(d, 'proficiencias', onde),
    habilidades: lista(d, 'habilidades', onde, (item, aqui) => {
      const h = objeto(item, aqui);
      return {
        nivel: numero(h, 'nivel', aqui, { inteiro: true, minimo: 1, maximo: 20 }),
        entradaId: textoPreenchido(h, 'entradaId', aqui),
      };
    }),
    atributoConjuracao: opcaoOuNulo(d, 'atributoConjuracao', ATRIBUTOS, onde),
    tabela: lerTabela(d, onde),
    escolhaPericias: (() => {
      if (d.escolhaPericias === null) {
        return null;
      }
      const e = objeto(d.escolhaPericias, `${onde}: a escolha de perícias`);
      return {
        quantidade: numero(e, 'quantidade', `${onde}: a escolha de perícias`, { inteiro: true, minimo: 1 }),
        opcoes: listaDeTextos(e, 'opcoes', `${onde}: a escolha de perícias`),
      };
    })(),
    niveisDeAumento: (() => {
      const niveis = lista(d, 'niveisDeAumento', onde, (item, aqui) => {
        exigir(typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= 20, `${aqui} não é um nível de 1 a 20.`);
        return item;
      });
      exigir(new Set(niveis).size === niveis.length, `${onde}: há níveis de aumento repetidos.`);
      return [...niveis].sort((a, b) => a - b);
    })(),
  }),
  especie: (d, onde) => ({
    tamanho: opcao(d, 'tamanho', TAMANHOS, onde),
    deslocamento: numero(d, 'deslocamento', onde, { minimo: 0 }),
    aumentosAtributo: numerosPorAtributo(d, 'aumentosAtributo', onde, false),
    idiomas: listaDeTextos(d, 'idiomas', onde),
    tracos: listaDeTextos(d, 'tracos', onde),
  }),
  antecedente: (d, onde) => ({
    proficiencias: listaDeTextos(d, 'proficiencias', onde),
    habilidades: listaDeTextos(d, 'habilidades', onde),
  }),
  talento: (d, onde) => ({ prerequisito: texto(d, 'prerequisito', onde) }),
  condicao: () => ({}),
  monstro: (d, onde) => ({
    tamanho: opcao(d, 'tamanho', TAMANHOS, onde),
    tipoCriatura: texto(d, 'tipoCriatura', onde),
    alinhamento: texto(d, 'alinhamento', onde),
    classeArmadura: numero(d, 'classeArmadura', onde, { inteiro: true }),
    notaArmadura: texto(d, 'notaArmadura', onde),
    pontosVida: numero(d, 'pontosVida', onde, { inteiro: true, minimo: 0 }),
    dadosVida: texto(d, 'dadosVida', onde),
    deslocamento: texto(d, 'deslocamento', onde),
    atributos: numerosPorAtributo(d, 'atributos', onde, true) as Record<Atributo, number>,
    salvaguardas: numerosPorAtributo(d, 'salvaguardas', onde, false),
    pericias: numerosPorNome(d, 'pericias', onde),
    vulnerabilidades: listaDeTextos(d, 'vulnerabilidades', onde),
    resistencias: listaDeTextos(d, 'resistencias', onde),
    imunidades: listaDeTextos(d, 'imunidades', onde),
    imunidadesCondicao: listaDeTextos(d, 'imunidadesCondicao', onde),
    sentidos: texto(d, 'sentidos', onde),
    idiomas: texto(d, 'idiomas', onde),
    nivelDesafio: numero(d, 'nivelDesafio', onde, { minimo: 0 }),
    experiencia: numero(d, 'experiencia', onde, { inteiro: true, minimo: 0 }),
    tracos: lista(d, 'tracos', onde, lerBloco),
    acoesDeCombate: lista(d, 'acoesDeCombate', onde, lerBloco),
    reacoes: lista(d, 'reacoes', onde, lerBloco),
    acoesLendarias: lista(d, 'acoesLendarias', onde, lerBloco),
  }),
  kit: (d, onde) => {
    const moedas = objeto(d.moedas, `${onde}: as moedas`);
    return {
      itens: lista(d, 'itens', onde, (valor, ondeItem) => {
        const item = objeto(valor, ondeItem);
        return {
          entradaId: textoPreenchido(item, 'entradaId', ondeItem),
          quantidade: numero(item, 'quantidade', ondeItem, { inteiro: true, minimo: 1 }),
        };
      }),
      moedas: Object.fromEntries(
        MOEDAS.map((m) => [m, numero(moedas, m, `${onde}: as moedas`, { inteiro: true, minimo: 0 })]),
      ) as Record<(typeof MOEDAS)[number], number>,
      classes: listaDeTextos(d, 'classes', onde),
      extraPorAntecedente: listaDeTextos(d, 'extraPorAntecedente', onde),
      extraPorPericia: listaDeTextos(d, 'extraPorPericia', onde),
    };
  },
};

/**
 * Lê e confere uma entrada vinda de um arquivo, do salvamento ou de um pacote como o SRD.
 * Lança `ErroDeFormato` explicando o primeiro problema encontrado.
 */
export function lerEntrada(valor: unknown, onde: string): Entrada {
  const d = objeto(valor, onde);
  const tipo = opcao(d, 'tipo', TIPOS_ENTRADA, onde);
  const base = {
    id: textoPreenchido(d, 'id', onde),
    nome: texto(d, 'nome', onde),
    descricao: texto(d, 'descricao', onde),
    etiquetas: listaDeTextos(d, 'etiquetas', onde),
    origem: lerOrigem(d.origem, onde),
    // Uma visibilidade desconhecida é recusada: um segredo nunca pode virar público por engano.
    visibilidade: lerVisibilidade(d.visibilidade, onde),
    efeitos: lista(d, 'efeitos', onde, lerEfeito),
    acoes: lista(d, 'acoes', onde, lerAcao),
  };
  const dados = objeto(d.dados, `${onde}: os dados`);
  // O compilador garante que cada tipo recebe os dados certos.
  return { ...base, tipo, dados: LER_DADOS[tipo](dados, onde) } as Entrada;
}

/** Lê uma lista de entradas, recusando ids repetidos. */
export function lerEntradas(valor: unknown, onde: string): Entrada[] {
  exigir(Array.isArray(valor), `${onde} não tem a lista de entradas.`);
  const ids = new Set<string>();
  return valor.map((item, i) => {
    const entrada = lerEntrada(item, `A entrada nº ${i + 1}`);
    exigir(!ids.has(entrada.id), `A entrada "${entrada.id}" está repetida.`);
    ids.add(entrada.id);
    return entrada;
  });
}

export function compendioParaObjeto(estado: EstadoCompendio) {
  return { versao: VERSAO_COMPENDIO, entradas: Object.values(estado.entradas) };
}

/** Acrescenta campos novos aos dados das entradas de um tipo, sem mexer no que já existe. */
function completarDados(entradas: unknown, tipo: string, novos: Record<string, unknown>): unknown {
  if (!Array.isArray(entradas)) {
    return entradas;
  }
  return entradas.map((entrada) =>
    ehObjeto(entrada) && entrada.tipo === tipo && ehObjeto(entrada.dados)
      ? { ...entrada, dados: { ...novos, ...entrada.dados } }
      : entrada,
  );
}

/** Cada versão antiga do compêndio, e como passá-la para a seguinte. */
const CONVERSOES: Readonly<Record<number, (entradas: unknown) => unknown>> = {
  // Versão 2: a ficha de monstro ganhou a nota da CA, vulnerabilidades, resistências e imunidades.
  1: (entradas) =>
    completarDados(entradas, 'monstro', {
      notaArmadura: '',
      vulnerabilidades: [],
      resistencias: [],
      imunidades: [],
      imunidadesCondicao: [],
    }),
  // Versão 3: as classes ganharam a tabela de nível.
  2: (entradas) => completarDados(entradas, 'classe', { tabela: [] }),
  // Versão 4: o peso dos itens passou de libras para quilos (1 libra = 0,5 kg).
  3: (entradas) =>
    Array.isArray(entradas)
      ? entradas.map((entrada) =>
          ehObjeto(entrada) && entrada.tipo === 'item' && ehObjeto(entrada.dados) && typeof entrada.dados.peso === 'number'
            ? { ...entrada, dados: { ...entrada.dados, peso: entrada.dados.peso / 2 } }
            : entrada,
        )
      : entradas,
  // Versão 5: distâncias e demais medidas imperiais passaram para o sistema métrico.
  4: (entradas) => (Array.isArray(entradas) ? entradas.map(entradaParaMetrico) : entradas),
  // Versão 6: as classes ganharam a escolha de perícias e os níveis de aumento de atributo.
  5: (entradas) => completarDados(entradas, 'classe', { escolhaPericias: null, niveisDeAumento: NIVEIS_DE_AUMENTO_PADRAO }),
  // Versão 7: o tipo "kit" (kits de equipamento). As entradas antigas não mudam.
  6: (entradas) => entradas,
};

/** Um número em pés vira metros; um texto, como "Movimento (pés)", troca as medidas imperiais. */
function metroSeNumero(valor: unknown): unknown {
  return typeof valor === 'number' ? pesParaMetros(valor) : valor;
}

function textoMetrico(valor: unknown): unknown {
  return typeof valor === 'string' ? textoParaMetrico(valor) : valor;
}

function blocosMetricos(valor: unknown): unknown {
  return Array.isArray(valor)
    ? valor.map((b) => (ehObjeto(b) ? { ...b, nome: textoMetrico(b.nome), descricao: textoMetrico(b.descricao) } : b))
    : valor;
}

/**
 * Passa uma entrada de medidas imperiais (pés, milhas, libras no texto…) para métricas.
 * Funciona sobre dados ainda não conferidos: o que não tiver o formato esperado fica como está.
 * O peso dos itens já é convertido antes, na versão 4.
 */
export function entradaParaMetrico(entrada: unknown): unknown {
  if (!ehObjeto(entrada) || !ehObjeto(entrada.dados)) {
    return entrada;
  }
  const d = entrada.dados;
  let dados: Record<string, unknown> = d;
  switch (entrada.tipo) {
    case 'item':
      if (ehObjeto(d.arma)) {
        const alcance = ehObjeto(d.arma.alcance)
          ? { ...d.arma.alcance, normal: metroSeNumero(d.arma.alcance.normal), longo: metroSeNumero(d.arma.alcance.longo) }
          : d.arma.alcance;
        dados = { ...d, arma: { ...d.arma, alcance } };
      }
      break;
    case 'magia':
      dados = {
        ...d,
        alcance: textoMetrico(d.alcance),
        componentes: ehObjeto(d.componentes) ? { ...d.componentes, material: textoMetrico(d.componentes.material) } : d.componentes,
      };
      break;
    case 'especie':
      dados = { ...d, deslocamento: metroSeNumero(d.deslocamento) };
      break;
    case 'classe':
      dados = {
        ...d,
        tabela: Array.isArray(d.tabela)
          ? d.tabela.map((coluna) =>
              ehObjeto(coluna) && typeof coluna.nome === 'string' && /\(pés\)/.test(coluna.nome) && Array.isArray(coluna.valores)
                ? {
                    ...coluna,
                    nome: coluna.nome.replace('(pés)', '(m)'),
                    valores: coluna.valores.map((v) =>
                      typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? String(pesParaMetros(Number(v))) : v,
                    ),
                  }
                : coluna,
            )
          : d.tabela,
      };
      break;
    case 'monstro':
      dados = {
        ...d,
        notaArmadura: textoMetrico(d.notaArmadura),
        deslocamento: textoMetrico(d.deslocamento),
        sentidos: textoMetrico(d.sentidos),
        idiomas: textoMetrico(d.idiomas),
        tracos: blocosMetricos(d.tracos),
        acoesDeCombate: blocosMetricos(d.acoesDeCombate),
        reacoes: blocosMetricos(d.reacoes),
        acoesLendarias: blocosMetricos(d.acoesLendarias),
      };
      break;
  }
  return { ...entrada, nome: textoMetrico(entrada.nome), descricao: textoMetrico(entrada.descricao), dados };
}

/**
 * Passa uma lista de entradas gravadas na versão `versao` para a atual, ainda sem conferir.
 * Usado pelo compêndio e pelas cópias de entradas guardadas nas fichas.
 */
export function atualizarEntradas(brutas: unknown, versao: number): unknown {
  let atual = brutas;
  for (let v = versao; v < VERSAO_COMPENDIO; v++) {
    atual = CONVERSOES[v](atual);
  }
  return atual;
}

export function lerJson(texto: string, oQue: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    throw new ErroDeFormato(`${oQue} não é um JSON válido.`);
  }
}

/** Arquivos salvos antes da versão 2 guardavam o compêndio sem número de versão. */
function lerEstado(dados: unknown, onde: string, versaoPadrao?: number): EstadoCompendio {
  exigir(ehObjeto(dados), `${onde} não é válido.`);
  const versao = dados.versao ?? versaoPadrao;
  exigir(
    typeof versao === 'number' && Number.isInteger(versao) && versao >= 1 && versao <= VERSAO_COMPENDIO,
    `${onde} usa um formato desconhecido.`,
  );
  const entradas = lerEntradas(atualizarEntradas(dados.entradas, versao), onde);
  return { entradas: Object.fromEntries(entradas.map((e) => [e.id, e])) };
}

export function comoResultado<T>(ler: () => T): ResultadoDe<T> {
  try {
    return { ok: true, ...ler() };
  } catch (erro) {
    if (erro instanceof ErroDeFormato) {
      return { ok: false, erro: erro.message };
    }
    throw erro;
  }
}

/** Formato do salvamento automático do compêndio, separado do mapa e da campanha. */
export function serializarCompendio(estado: EstadoCompendio): string {
  return JSON.stringify(compendioParaObjeto(estado));
}

export function desserializarCompendio(
  texto: string,
): ResultadoDe<{ readonly estado: EstadoCompendio }> {
  return comoResultado(() => ({ estado: lerEstado(lerJson(texto, 'O compêndio'), 'O compêndio') }));
}

/** O compêndio dentro de um arquivo salvo. Arquivos sem compêndio devolvem `estado: null`. */
export function lerCompendioDoArquivo(
  texto: string,
): ResultadoDe<{ readonly estado: EstadoCompendio | null }> {
  return comoResultado(() => {
    const dados = lerJson(texto, 'O arquivo');
    if (!ehObjeto(dados) || !('compendio' in dados)) {
      return { estado: null };
    }
    return { estado: lerEstado(dados.compendio, 'O compêndio do arquivo', 1) };
  });
}

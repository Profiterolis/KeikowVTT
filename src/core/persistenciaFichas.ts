import { ATRIBUTOS, MOEDAS, type Atributo } from './entradas';
import {
  ESPACOS_ZERADOS,
  MOEDAS_ZERADAS,
  MULTIPLICADORES_PROFICIENCIA,
  NIVEL_MAXIMO,
  SECOES_PADRAO,
  TIPOS_EXTRAS,
  TIPOS_FICHA,
  type EstadoFichas,
  type Ficha,
  type Moeda,
  type NotaDaFicha,
  type EstudoNaFicha,
  type PilhaDeItem,
  type RascunhoDaCriacao,
  type SecaoDaFicha,
  type TipoFicha,
} from './fichas';
import { ehObjeto, exigir, lerVisibilidade, type ResultadoDe } from './persistencia';
import { SO_MESTRE } from './visibilidade';
import { METODOS_ATRIBUTOS, type MetodoAtributos } from './regras';
import { atualizarEntradas, comoResultado, lerEntradas, lerJson, VERSAO_COMPENDIO } from './persistenciaCompendio';

/** Aumente ao mudar o formato das fichas, e acrescente a conversão em `converterFicha`. */
const VERSAO_FICHAS = 9;

/** Passa uma ficha gravada numa versão antiga para a atual, ainda sem conferir. */
function converterFicha(ficha: unknown, versao: number): unknown {
  if (!ehObjeto(ficha)) {
    return ficha;
  }
  let atual: Record<string, unknown> = ficha;
  if (versao < 2) {
    // Versão 2: inventário, cartas extras, moedas e seções. A nota única virou uma carta de nota.
    const notaAntiga = typeof atual.notas === 'string' ? atual.notas : '';
    atual = {
      ...atual,
      itens: [],
      extras: [],
      notas: notaAntiga.trim() === '' ? [] : [{ id: 'nota-antiga', titulo: 'Notas', texto: notaAntiga }],
      moedas: { ...MOEDAS_ZERADAS },
      secoes: SECOES_PADRAO,
    };
  }
  if (versao < 3) {
    // Versão 3: usos de habilidades e espaços de magia gastos.
    atual = { ...atual, usosGastos: {}, espacosGastos: ESPACOS_ZERADOS };
  }
  if (versao < 4) {
    // Versão 4: quem mais vê a ficha e a edição liberada. As antigas ficam só com o dono e o mestre.
    atual = { ...atual, visibilidade: SO_MESTRE, edicaoLiberada: false };
  }
  if (versao < 5) {
    // Versão 5: assistente de criação e subida de nível.
    atual = { ...atual, emCriacao: false, niveisLiberados: 0 };
  }
  if (versao < 6) {
    // Versão 6: o rascunho da criação (método dos atributos e valores rolados).
    atual = { ...atual, rascunho: null };
  }
  if (versao < 8) {
    // Versão 8: estudos feitos à noite e idiomas aprendidos.
    atual = { ...atual, estudos: [], idiomas: [] };
  }
  if (versao < 9) {
    // Versão 9: estudos com tema e progresso (os turnos antigos viram sucessos) e proficiências aprendidas.
    const estudos = Array.isArray(atual.estudos)
      ? atual.estudos.map((e) =>
          ehObjeto(e)
            ? { id: e.id, tipo: e.tipo, temaId: null, magiaId: e.magiaId ?? null, alvo: e.tipo === 'idioma' ? e.assunto : null, assunto: e.assunto, progresso: e.turnos ?? 0 }
            : e,
        )
      : [];
    atual = { ...atual, estudos, proficienciasExtras: [] };
  }
  if (versao < 7 && ehObjeto(atual.rascunho)) {
    // Versão 7: o rascunho guarda o kit escolhido e os itens livres; os itens que a ficha já tinha
    // passam a ser os livres, para o assistente não perdê-los.
    const itens = Array.isArray(atual.itens)
      ? atual.itens.filter(ehObjeto).map((p) => ({ entradaId: p.entradaId, quantidade: p.quantidade }))
      : [];
    atual = { ...atual, rascunho: { ...atual.rascunho, kitId: null, itens } };
  }
  return atual;
}

type Dado = Record<string, unknown>;

function texto(d: Dado, campo: string, onde: string): string {
  const valor = d[campo];
  exigir(typeof valor === 'string', `${onde}: "${campo}" precisa ser um texto.`);
  return valor;
}

function booleano(d: Dado, campo: string, onde: string): boolean {
  const valor = d[campo];
  exigir(typeof valor === 'boolean', `${onde}: "${campo}" precisa ser sim ou não.`);
  return valor;
}

function lerRascunho(valor: unknown, onde: string): RascunhoDaCriacao | null {
  if (valor === null) {
    return null;
  }
  exigir(ehObjeto(valor), `${onde}: o rascunho da criação não é válido.`);
  exigir(
    typeof valor.metodo === 'string' && (METODOS_ATRIBUTOS as readonly string[]).includes(valor.metodo),
    `${onde}: o método dos atributos é desconhecido.`,
  );
  const rolados = valor.rolados;
  exigir(
    rolados === null ||
      (Array.isArray(rolados) && rolados.length === ATRIBUTOS.length && rolados.every((n) => Number.isInteger(n) && n >= 1 && n <= 30)),
    `${onde}: os valores rolados não são válidos.`,
  );
  exigir(valor.kitId === null || (typeof valor.kitId === 'string' && valor.kitId !== ''), `${onde}: o kit escolhido não é válido.`);
  exigir(
    Array.isArray(valor.itens) &&
      valor.itens.every(
        (i) => ehObjeto(i) && typeof i.entradaId === 'string' && i.entradaId !== '' && Number.isInteger(i.quantidade) && (i.quantidade as number) >= 1,
      ),
    `${onde}: os itens escolhidos na criação não são válidos.`,
  );
  return {
    metodo: valor.metodo as MetodoAtributos,
    rolados: rolados as number[] | null,
    kitId: valor.kitId as string | null,
    itens: (valor.itens as { entradaId: string; quantidade: number }[]).map(({ entradaId, quantidade }) => ({ entradaId, quantidade })),
  };
}

function inteiro(valor: unknown, onde: string, minimo: number, maximo = Infinity): number {
  exigir(
    typeof valor === 'number' && Number.isInteger(valor) && valor >= minimo && valor <= maximo,
    `${onde} tem um número inválido.`,
  );
  return valor as number;
}

function idOuNulo(d: Dado, campo: string, onde: string): string | null {
  return d[campo] === null ? null : texto(d, campo, onde);
}

/** Lê uma ficha, conferindo que cada classe, espécie e monstro citados estão entre as cópias. */
function lerFicha(valor: unknown, onde: string, versaoEntradas: number): Ficha {
  exigir(ehObjeto(valor), `${onde} não é válida.`);
  const tipo = valor.tipo;
  exigir(typeof tipo === 'string' && (TIPOS_FICHA as readonly string[]).includes(tipo), `${onde}: o tipo é desconhecido.`);
  const atributos = valor.atributos;
  exigir(ehObjeto(atributos), `${onde} está sem os atributos.`);
  const lidas = lerEntradas(atualizarEntradas(valor.entradas, versaoEntradas), `${onde}: as cópias`);
  const entradas = Object.fromEntries(lidas.map((e) => [e.id, e]));

  const confereCopia = (id: string | null, tipoEsperado: string, oQue: string) => {
    exigir(id === null || entradas[id]?.tipo === tipoEsperado, `${onde}: ${oQue} não está entre as cópias da ficha.`);
    return id;
  };

  exigir(Array.isArray(valor.classes), `${onde} está sem a lista de classes.`);
  const classes = valor.classes.map((c, i) => {
    exigir(ehObjeto(c), `${onde}: a classe nº ${i + 1} não é válida.`);
    return {
      entradaId: confereCopia(texto(c, 'entradaId', onde), 'classe', `a classe nº ${i + 1}`) as string,
      nivel: inteiro(c.nivel, `${onde}: a classe nº ${i + 1}`, 1, NIVEL_MAXIMO),
    };
  });
  exigir(
    classes.reduce((s, c) => s + c.nivel, 0) <= NIVEL_MAXIMO,
    `${onde}: a soma dos níveis passa de ${NIVEL_MAXIMO}.`,
  );

  const proficiencias = valor.proficiencias;
  exigir(ehObjeto(proficiencias), `${onde} está sem as proficiências.`);
  for (const multiplicador of Object.values(proficiencias)) {
    exigir(
      (MULTIPLICADORES_PROFICIENCIA as readonly unknown[]).includes(multiplicador),
      `${onde}: uma proficiência tem um valor inválido.`,
    );
  }

  exigir(Array.isArray(valor.pvPorNivel), `${onde} está sem os PV por nível.`);
  const pvPorNivel = valor.pvPorNivel.map((pv) => (pv === null ? null : inteiro(pv, `${onde}: os PV de um nível`, 0)));

  return {
    id: texto(valor, 'id', onde),
    tipo: tipo as TipoFicha,
    nome: texto(valor, 'nome', onde),
    donoId: texto(valor, 'donoId', onde),
    visibilidade: lerVisibilidade(valor.visibilidade, onde),
    edicaoLiberada: booleano(valor, 'edicaoLiberada', onde),
    emCriacao: booleano(valor, 'emCriacao', onde),
    niveisLiberados: inteiro(valor.niveisLiberados, `${onde}: os níveis liberados`, 0, NIVEL_MAXIMO),
    rascunho: lerRascunho(valor.rascunho, onde),
    atributos: Object.fromEntries(
      ATRIBUTOS.map((a) => [a, inteiro(atributos[a], `${onde}: ${a.toUpperCase()}`, 1, 30)]),
    ) as Record<Atributo, number>,
    entradas,
    classes,
    especieId: confereCopia(idOuNulo(valor, 'especieId', onde), 'especie', 'a espécie'),
    antecedenteId: confereCopia(idOuNulo(valor, 'antecedenteId', onde), 'antecedente', 'o antecedente'),
    monstroId: confereCopia(idOuNulo(valor, 'monstroId', onde), 'monstro', 'o monstro'),
    proficiencias: proficiencias as Record<string, number>,
    pvPorNivel,
    pvAtuais: valor.pvAtuais === null ? null : inteiro(valor.pvAtuais, `${onde}: os PV atuais`, -1000),
    pvTemporarios: inteiro(valor.pvTemporarios, `${onde}: os PV temporários`, 0),
    ...lerOrganizacao(valor, onde, entradas),
  };
}

function listaDe<T>(valor: unknown, onde: string, ler: (item: Dado, aqui: string) => T): T[] {
  exigir(Array.isArray(valor), `${onde} não é uma lista.`);
  return valor.map((item, i) => {
    const aqui = `${onde} nº ${i + 1}`;
    exigir(ehObjeto(item), `${aqui} não é válido.`);
    return ler(item, aqui);
  });
}

function semRepetir(ids: readonly string[], onde: string): void {
  exigir(new Set(ids).size === ids.length, `${onde}: há ids repetidos.`);
}

/** Inventário, extras, notas, moedas e seções, conferindo que cada um cita uma cópia do tipo certo. */
function lerOrganizacao(valor: Dado, onde: string, entradas: Record<string, { tipo: string }>) {
  const itens: PilhaDeItem[] = listaDe(valor.itens, `${onde}: o item`, (p, aqui) => {
    const entradaId = texto(p, 'entradaId', aqui);
    exigir(entradas[entradaId]?.tipo === 'item', `${aqui} não está entre as cópias da ficha.`);
    exigir(typeof p.equipado === 'boolean' && typeof p.sintonizado === 'boolean', `${aqui} tem marcas inválidas.`);
    return {
      id: texto(p, 'id', aqui),
      entradaId,
      quantidade: inteiro(p.quantidade, aqui, 1),
      equipado: p.equipado as boolean,
      sintonizado: p.sintonizado as boolean,
    };
  });
  semRepetir(itens.map((p) => p.id), `${onde}: os itens`);

  exigir(Array.isArray(valor.extras), `${onde} está sem a lista de extras.`);
  const extras = valor.extras.map((id, i) => {
    exigir(
      typeof id === 'string' && (TIPOS_EXTRAS as readonly string[]).includes(entradas[id]?.tipo ?? ''),
      `${onde}: o extra nº ${i + 1} não está entre as cópias da ficha.`,
    );
    return id;
  });
  semRepetir(extras, `${onde}: os extras`);

  const notas: NotaDaFicha[] = listaDe(valor.notas, `${onde}: a nota`, (n, aqui) => ({
    id: texto(n, 'id', aqui),
    titulo: texto(n, 'titulo', aqui),
    texto: texto(n, 'texto', aqui),
  }));
  semRepetir(notas.map((n) => n.id), `${onde}: as notas`);

  const moedas = valor.moedas;
  exigir(ehObjeto(moedas), `${onde} está sem as moedas.`);
  const lidasMoedas = Object.fromEntries(
    MOEDAS.map((m) => [m, inteiro(moedas[m], `${onde}: as moedas`, 0)]),
  ) as Record<Moeda, number>;

  const secoes: SecaoDaFicha[] = listaDe(valor.secoes, `${onde}: a seção`, (s, aqui) => {
    exigir(Array.isArray(s.cartas) && s.cartas.every((c) => typeof c === 'string'), `${aqui} tem cartas inválidas.`);
    return { id: texto(s, 'id', aqui), nome: texto(s, 'nome', aqui), cartas: s.cartas as string[] };
  });
  exigir(secoes.length > 0, `${onde} precisa ter ao menos uma seção.`);
  semRepetir(secoes.map((s) => s.id), `${onde}: as seções`);

  const usos = valor.usosGastos;
  exigir(ehObjeto(usos), `${onde} está sem os usos gastos.`);
  const usosGastos = Object.fromEntries(
    Object.entries(usos).map(([id, n]) => [id, inteiro(n, `${onde}: os usos gastos`, 0)]),
  );
  exigir(
    Array.isArray(valor.espacosGastos) && valor.espacosGastos.length === ESPACOS_ZERADOS.length,
    `${onde}: os espaços de magia gastos não são válidos.`,
  );
  const espacosGastos = valor.espacosGastos.map((n) => inteiro(n, `${onde}: os espaços de magia gastos`, 0));

  const estudos: EstudoNaFicha[] = listaDe(valor.estudos, `${onde}: o estudo`, (e, aqui) => {
    exigir(['idioma', 'magia', 'pericia', 'proficiencia'].includes(e.tipo as string), `${aqui} tem um tipo desconhecido.`);
    const textoOuNulo = (campo: string) => {
      exigir(e[campo] === null || typeof e[campo] === 'string', `${aqui}: "${campo}" é inválido.`);
      return e[campo] as string | null;
    };
    return {
      id: texto(e, 'id', aqui),
      tipo: e.tipo as EstudoNaFicha['tipo'],
      temaId: textoOuNulo('temaId'),
      magiaId: textoOuNulo('magiaId'),
      alvo: textoOuNulo('alvo'),
      assunto: texto(e, 'assunto', aqui),
      progresso: inteiro(e.progresso, aqui, 0),
    };
  });
  semRepetir(estudos.map((e) => e.id), `${onde}: os estudos`);
  exigir(Array.isArray(valor.idiomas) && valor.idiomas.every((i) => typeof i === 'string'), `${onde}: os idiomas não são válidos.`);
  const idiomas = valor.idiomas as string[];
  exigir(
    Array.isArray(valor.proficienciasExtras) && valor.proficienciasExtras.every((p) => typeof p === 'string'),
    `${onde}: as proficiências aprendidas não são válidas.`,
  );
  const proficienciasExtras = valor.proficienciasExtras as string[];

  return { itens, extras, notas, moedas: lidasMoedas, secoes, usosGastos, espacosGastos, estudos, idiomas, proficienciasExtras };
}

export function fichasParaObjeto(estado: EstadoFichas) {
  return {
    versao: VERSAO_FICHAS,
    // As cópias seguem o formato do compêndio; guardar a versão dele permite converter depois.
    versaoEntradas: VERSAO_COMPENDIO,
    fichas: Object.values(estado.fichas).map((ficha) => ({ ...ficha, entradas: Object.values(ficha.entradas) })),
  };
}

function lerEstado(dados: unknown, onde: string): EstadoFichas {
  exigir(
    ehObjeto(dados) && typeof dados.versao === 'number' && Number.isInteger(dados.versao) && dados.versao >= 1 && dados.versao <= VERSAO_FICHAS,
    `${onde} usam um formato desconhecido.`,
  );
  const versao = dados.versao as number;
  const versaoEntradas = dados.versaoEntradas;
  exigir(
    typeof versaoEntradas === 'number' && Number.isInteger(versaoEntradas) && versaoEntradas >= 1 && versaoEntradas <= VERSAO_COMPENDIO,
    `${onde} têm cópias de entradas num formato desconhecido.`,
  );
  exigir(Array.isArray(dados.fichas), `${onde} estão sem a lista de fichas.`);
  const fichas: Record<string, Ficha> = {};
  dados.fichas.forEach((item, i) => {
    const ficha = lerFicha(converterFicha(item, versao), `A ficha nº ${i + 1}`, versaoEntradas);
    exigir(!(ficha.id in fichas), `A ficha "${ficha.id}" está repetida.`);
    fichas[ficha.id] = ficha;
  });
  return { fichas };
}

export function serializarFichas(estado: EstadoFichas): string {
  return JSON.stringify(fichasParaObjeto(estado));
}

export function desserializarFichas(textoSalvo: string): ResultadoDe<{ readonly estado: EstadoFichas }> {
  return comoResultado(() => ({ estado: lerEstado(lerJson(textoSalvo, 'As fichas'), 'As fichas') }));
}

/** As fichas dentro de um arquivo salvo. Arquivos sem fichas devolvem `estado: null`. */
export function lerFichasDoArquivo(textoSalvo: string): ResultadoDe<{ readonly estado: EstadoFichas | null }> {
  return comoResultado(() => {
    const dados = lerJson(textoSalvo, 'O arquivo');
    if (!ehObjeto(dados) || !('fichas' in dados)) {
      return { estado: null };
    }
    return { estado: lerEstado(dados.fichas, 'As fichas do arquivo') };
  });
}

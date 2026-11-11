/**
 * Regras da viagem no hexcrawl, guardadas como dados nas regras da campanha:
 * quanto mede um hex, os ritmos e as tags de terreno que deixam a viagem mais lenta ou rápida.
 */
import { vizinhosHex, type CoordHex } from './hex';
import { hexEm, type EstadoMapa } from './mapa';
import { ehObjeto, exigir } from './leitura';

export interface TagDeTerreno {
  /** Nome interno, como `montanha`. */
  readonly id: string;
  /** Nome mostrado, como "Montanha". */
  readonly nome: string;
  /** Quanto o tempo de sair de um hex com esta tag é multiplicado. As tags de um hex se multiplicam entre si. */
  readonly multiplicador: number;
  /** Ninguém entra num hex com esta tag, a não ser de barco, se ela for navegável. */
  readonly intransponivel: boolean;
  /** Água: barcos entram e andam nela, e os passos que saem dela usam a velocidade do barco. */
  readonly navegavel: boolean;
  /** Pedaços do nome do arquivo do tile que dão esta tag, como "Mountain". Maiúsculas não importam. */
  readonly palavras: readonly string[];
}

export interface RitmoDeViagem {
  readonly id: string;
  readonly nome: string;
  /** Velocidade do grupo neste ritmo, em km por hora. */
  readonly kmPorHora: number;
  /** O que o ritmo muda na mesa, como "−5 na Percepção passiva". */
  readonly nota: string;
}

export interface RegrasDeViagem {
  /** Distância de um hex ao vizinho, em km. */
  readonly kmPorHex: number;
  /** Horas de viagem num dia; passar disso é marcha forçada. */
  readonly horasPorDia: number;
  /** Hora em que o grupo parte depois de acampar, como 8 (08:00). */
  readonly horaDaPartida: number;
  /** Horas mínimas de um descanso longo: o do 5e dura 8 h. */
  readonly horasDeDescanso: number;
  /** Quanto dura um descanso curto: 1 h no 5e. */
  readonly horasDeDescansoCurto: number;
  readonly ritmos: readonly RitmoDeViagem[];
  readonly tags: readonly TagDeTerreno[];
  /**
   * Tiles cujas tags não seguem o nome do arquivo: id do tile → ids das tags.
   * Uma lista vazia tira todas as tags daquele tile.
   */
  readonly tagsPorTile: Readonly<Record<string, readonly string[]>>;
}

/** O ritmo usado quando o grupo ainda não escolheu um. */
export const RITMO_PADRAO = 'normal';

/**
 * As velocidades são as do 5e (3, 4 e 2 milhas por hora) em km. O hex de 9 km (6 milhas)
 * é o tamanho mais comum em hexcrawls: no ritmo normal, 2 h por hex em terreno aberto.
 */
export const REGRAS_DE_VIAGEM_PADRAO: RegrasDeViagem = {
  kmPorHex: 9,
  horasPorDia: 8,
  horaDaPartida: 8,
  horasDeDescanso: 8,
  horasDeDescansoCurto: 1,
  ritmos: [
    { id: 'lento', nome: 'Lento', kmPorHora: 3, nota: 'O grupo pode andar com furtividade.' },
    { id: 'normal', nome: 'Normal', kmPorHora: 4.5, nota: '' },
    { id: 'rapido', nome: 'Rápido', kmPorHora: 6, nota: '−5 na Percepção passiva.' },
  ],
  tags: [
    { id: 'campo', nome: 'Campo', multiplicador: 1, intransponivel: false, navegavel: false, palavras: ['Plains', 'Scrublands'] },
    { id: 'floresta', nome: 'Floresta', multiplicador: 2, intransponivel: false, navegavel: false, palavras: ['Forest', 'Woodlands', 'Jungle'] },
    { id: 'colina', nome: 'Colina', multiplicador: 1.5, intransponivel: false, navegavel: false, palavras: ['Hills', 'Highlands', 'Mesa'] },
    { id: 'montanha', nome: 'Montanha', multiplicador: 2, intransponivel: false, navegavel: false, palavras: ['Mountain', 'Volcano'] },
    { id: 'neve', nome: 'Neve', multiplicador: 1.5, intransponivel: false, navegavel: false, palavras: ['Snow'] },
    { id: 'pantano', nome: 'Pântano', multiplicador: 2, intransponivel: false, navegavel: false, palavras: ['Marsh', 'Bog', 'Wetlands'] },
    { id: 'deserto', nome: 'Deserto', multiplicador: 1, intransponivel: false, navegavel: false, palavras: ['Desert'] },
    { id: 'dunas', nome: 'Dunas', multiplicador: 1.5, intransponivel: false, navegavel: false, palavras: ['Dunes'] },
    { id: 'lava', nome: 'Lava', multiplicador: 2, intransponivel: false, navegavel: false, palavras: ['Lava', 'Volcano'] },
    // Estradas saem das cidades: deixar um povoado é mais rápido.
    {
      id: 'povoado',
      nome: 'Povoado',
      multiplicador: 0.5,
      intransponivel: false,
      navegavel: false,
      palavras: ['Village', 'Castle', 'Farm', 'Forester', 'Mine'],
    },
    { id: 'agua', nome: 'Água', multiplicador: 1, intransponivel: true, navegavel: true, palavras: ['Ocean'] },
    { id: 'vazio', nome: 'Vazio', multiplicador: 1, intransponivel: true, navegavel: false, palavras: ['Void'] },
  ],
  tagsPorTile: {
    // "Cacti Forest" é um deserto com cactos, não uma floresta.
    hexDesertYellowCactiForest00: ['deserto'],
  },
};

/** As tags de um tile: as escolhidas para ele ou, sem escolha, as que o nome do arquivo dá. */
export function tagsDoTile(viagem: RegrasDeViagem, tile: string): TagDeTerreno[] {
  const escolhidas = viagem.tagsPorTile[tile];
  if (escolhidas) {
    return viagem.tags.filter((t) => escolhidas.includes(t.id));
  }
  const nome = tile.toLowerCase();
  return viagem.tags.filter((t) => t.palavras.some((p) => p !== '' && nome.includes(p.toLowerCase())));
}

/** As tags se multiplicam: montanha (×2) com neve (×1,5) vale ×3. */
export function multiplicadorDasTags(tags: readonly TagDeTerreno[]): number {
  return tags.reduce((total, tag) => total * tag.multiplicador, 1);
}

export function ritmoDe(viagem: RegrasDeViagem, id: string): RitmoDeViagem {
  return viagem.ritmos.find((r) => r.id === id) ?? viagem.ritmos.find((r) => r.id === RITMO_PADRAO) ?? viagem.ritmos[0];
}

export interface ParteDoTempo {
  /** O que pesou no tempo, como "Floresta" ou "9 km a 4,5 km/h". */
  readonly texto: string;
  /** Horas (na base), o multiplicador do tempo (nas tags) ou da velocidade (montarias, veículos). */
  readonly valor: number;
  readonly tipo: 'base' | 'multiplicador' | 'velocidade';
}

/**
 * Um membro do grupo, como a viagem o enxerga: o nome e os valores de viagem da ficha
 * (`fator_viagem`, `veiculo_terra_lugares`, `guia_floresta`…), já com os efeitos.
 */
export interface MembroNaViagem {
  readonly nome: string;
  readonly valor: (nome: string) => number;
}

export type ResultadoDoPasso =
  | {
      readonly ok: true;
      readonly horas: number;
      /** As tags do hex de onde o grupo sai, que decidem o tempo. */
      readonly tagsDaOrigem: readonly TagDeTerreno[];
      readonly partes: readonly ParteDoTempo[];
    }
  | { readonly ok: false; readonly motivo: string };

/** Números com vírgula decimal, como no resto da interface. */
const numero = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

/** O melhor veículo (terrestre ou barco) em que cabe o grupo inteiro, se algum membro tiver um. */
function melhorVeiculo(
  membros: readonly MembroNaViagem[],
  tipo: 'terra' | 'agua',
): { readonly fator: number; readonly dono: string } | null {
  let melhor: { fator: number; dono: string } | null = null;
  for (const membro of membros) {
    if (membro.valor(`veiculo_${tipo}_lugares`) >= membros.length) {
      const fator = membro.valor(`veiculo_${tipo}_fator`);
      if (fator > 0 && (melhor === null || fator > melhor.fator)) {
        melhor = { fator, dono: membro.nome };
      }
    }
  }
  return melhor;
}

/** Quem guia o grupo neste tipo de terreno, se alguém guiar: basta um. */
function guiaDe(membros: readonly MembroNaViagem[], tag: TagDeTerreno): string | null {
  return membros.find((m) => m.valor(`guia_${tag.id}`) >= 1)?.nome ?? null;
}

/**
 * A velocidade do grupo em terra: vale o mais lento (um cavalo só ajuda se todos tiverem um),
 * a não ser que caibam todos num veículo mais rápido.
 */
function velocidadeEmTerra(membros: readonly MembroNaViagem[]): ParteDoTempo | null {
  if (membros.length === 0) {
    return null;
  }
  let maisLento = membros[0];
  for (const membro of membros) {
    if (membro.valor('fator_viagem') < maisLento.valor('fator_viagem')) {
      maisLento = membro;
    }
  }
  const individual = maisLento.valor('fator_viagem');
  const veiculo = melhorVeiculo(membros, 'terra');
  if (veiculo && veiculo.fator > individual) {
    return { texto: `Veículo de ${veiculo.dono}, onde cabem todos`, valor: veiculo.fator, tipo: 'velocidade' };
  }
  if (individual === 1 || individual <= 0) {
    return null;
  }
  const texto =
    membros.length === 1 ? `Velocidade de ${maisLento.nome}` : `Velocidade do mais lento (${maisLento.nome})`;
  return { texto, valor: individual, tipo: 'velocidade' };
}

/**
 * Quanto tempo o grupo leva para ir de um hex ao vizinho. Conta o terreno de onde o
 * grupo sai: deixar uma cidade é rápido; atravessar uma floresta densa até ela, não.
 * O destino só importa para saber se dá para entrar.
 *
 * Com os membros, entram as montarias e veículos (velocidade), os barcos (água) e os guias
 * (tiram a penalidade de um terreno). Sem membros, vale só o ritmo e o terreno.
 */
export function tempoDoPasso(
  viagem: RegrasDeViagem,
  mapa: EstadoMapa,
  de: CoordHex,
  para: CoordHex,
  ritmoId: string,
  membros: readonly MembroNaViagem[] = [],
): ResultadoDoPasso {
  if (!vizinhosHex(de).some((v) => v.q === para.q && v.r === para.r)) {
    return { ok: false, motivo: 'O grupo anda um hex por vez, só para um vizinho.' };
  }
  const destino = hexEm(mapa, para);
  if (!destino) {
    return { ok: false, motivo: 'Não há terreno neste hex.' };
  }
  const barco = melhorVeiculo(membros, 'agua');
  const bloqueio = tagsDoTile(viagem, destino.terreno).find((t) => t.intransponivel && !(t.navegavel && barco));
  if (bloqueio) {
    const semBarco = bloqueio.navegavel ? ' sem um barco onde caibam todos' : '';
    return { ok: false, motivo: `Não dá para entrar: ${bloqueio.nome.toLowerCase()}${semBarco}.` };
  }
  const origem = hexEm(mapa, de);
  // Se o mestre pôs o grupo num lugar sem terreno, a saída conta como terreno aberto.
  const tagsDaOrigem = origem ? tagsDoTile(viagem, origem.terreno) : [];
  const ritmo = ritmoDe(viagem, ritmoId);
  const base = viagem.kmPorHex / ritmo.kmPorHora;
  const naAgua = tagsDaOrigem.some((t) => t.navegavel);

  const partes: ParteDoTempo[] = [
    {
      texto: `Ritmo ${ritmo.nome.toLowerCase()}: ${numero(viagem.kmPorHex)} km a ${numero(ritmo.kmPorHora)} km/h`,
      valor: base,
      tipo: 'base',
    },
  ];
  // Na água, quem leva o grupo é o barco; em terra, as montarias e os veículos.
  const velocidade: ParteDoTempo | null = naAgua
    ? barco && barco.fator !== 1
      ? { texto: `Barco de ${barco.dono}`, valor: barco.fator, tipo: 'velocidade' }
      : null
    : velocidadeEmTerra(membros);
  if (velocidade) {
    partes.push(velocidade);
  }
  for (const tag of tagsDaOrigem) {
    if (tag.multiplicador === 1) {
      continue;
    }
    // O guia tira a penalidade, mas não o bônus das estradas.
    const guia = tag.multiplicador > 1 ? guiaDe(membros, tag) : null;
    partes.push(
      guia
        ? { texto: `${tag.nome}, sem penalidade (guia: ${guia})`, valor: 1, tipo: 'multiplicador' }
        : { texto: tag.nome, valor: tag.multiplicador, tipo: 'multiplicador' },
    );
  }
  let horas = 0;
  for (const parte of partes) {
    horas = parte.tipo === 'base' ? parte.valor : parte.tipo === 'velocidade' ? horas / parte.valor : horas * parte.valor;
  }
  return { ok: true, horas, tagsDaOrigem, partes };
}

// ---------- Conferência ----------

const ID_VALIDO = /^[a-z_][a-z0-9_]*$/;

/** Confere as regras de viagem. Devolve cada problema com o lugar onde está. */
export function problemasNaViagem(viagem: RegrasDeViagem): { onde: string; erro: string }[] {
  const problemas: { onde: string; erro: string }[] = [];
  const positivo = (n: number) => Number.isFinite(n) && n > 0;
  const onde = 'Viagem';
  if (!positivo(viagem.kmPorHex)) {
    problemas.push({ onde, erro: 'O tamanho do hex precisa ser maior que zero.' });
  }
  if (!positivo(viagem.horasPorDia) || viagem.horasPorDia > 24) {
    problemas.push({ onde, erro: 'As horas de viagem por dia precisam ser de mais de 0 até 24.' });
  }
  if (!Number.isFinite(viagem.horaDaPartida) || viagem.horaDaPartida < 0 || viagem.horaDaPartida >= 24) {
    problemas.push({ onde, erro: 'A hora da partida precisa ser de 0 a 23.' });
  }
  if (!Number.isFinite(viagem.horasDeDescanso) || viagem.horasDeDescanso < 0 || viagem.horasDeDescanso > 24) {
    problemas.push({ onde, erro: 'As horas de descanso precisam ser de 0 a 24.' });
  }
  if (!Number.isFinite(viagem.horasDeDescansoCurto) || viagem.horasDeDescansoCurto < 0 || viagem.horasDeDescansoCurto > 24) {
    problemas.push({ onde, erro: 'As horas do descanso curto precisam ser de 0 a 24.' });
  }
  if (viagem.ritmos.length === 0) {
    problemas.push({ onde, erro: 'A viagem precisa de ao menos um ritmo.' });
  }
  const idsRepetidos = (ids: string[]) => ids.find((id, i) => ids.indexOf(id) !== i);
  for (const ritmo of viagem.ritmos) {
    if (!ID_VALIDO.test(ritmo.id)) {
      problemas.push({ onde: `Ritmo ${ritmo.nome}`, erro: `O nome "${ritmo.id}" só pode ter letras minúsculas sem acento, números e "_".` });
    }
    if (!positivo(ritmo.kmPorHora)) {
      problemas.push({ onde: `Ritmo ${ritmo.nome}`, erro: 'A velocidade precisa ser maior que zero.' });
    }
  }
  const ritmoRepetido = idsRepetidos(viagem.ritmos.map((r) => r.id));
  if (ritmoRepetido) {
    problemas.push({ onde, erro: `Há dois ritmos com o nome "${ritmoRepetido}".` });
  }
  for (const tag of viagem.tags) {
    if (!ID_VALIDO.test(tag.id)) {
      problemas.push({ onde: `Tag ${tag.nome}`, erro: `O nome "${tag.id}" só pode ter letras minúsculas sem acento, números e "_".` });
    }
    if (!positivo(tag.multiplicador)) {
      problemas.push({ onde: `Tag ${tag.nome}`, erro: 'O multiplicador precisa ser maior que zero.' });
    }
  }
  const tagRepetida = idsRepetidos(viagem.tags.map((t) => t.id));
  if (tagRepetida) {
    problemas.push({ onde, erro: `Há duas tags com o nome "${tagRepetida}".` });
  }
  const conhecidas = new Set(viagem.tags.map((t) => t.id));
  for (const [tile, tags] of Object.entries(viagem.tagsPorTile)) {
    const desconhecida = tags.find((t) => !conhecidas.has(t));
    if (desconhecida) {
      problemas.push({ onde: `Tile ${tile}`, erro: `A tag "${desconhecida}" não existe.` });
    }
  }
  return problemas;
}

// ---------- Leitura ----------

/** Lê o bloco de viagem guardado nas regras. Regras de antes da Fase 5 não o têm: valem as padrão. */
export function lerViagem(valor: unknown, padrao: RegrasDeViagem): RegrasDeViagem {
  if (valor === undefined) {
    return padrao;
  }
  const onde = 'A viagem';
  exigir(ehObjeto(valor), `${onde} não é válida.`);
  const numero = (d: Record<string, unknown>, campo: string, local: string) => {
    const n = d[campo];
    exigir(typeof n === 'number' && Number.isFinite(n), `${local}: "${campo}" precisa ser um número.`);
    return n;
  };
  const texto = (d: Record<string, unknown>, campo: string, local: string) => {
    const t = d[campo];
    exigir(typeof t === 'string', `${local}: "${campo}" precisa ser um texto.`);
    return t;
  };
  const textos = (lista: unknown, local: string) => {
    exigir(Array.isArray(lista) && lista.every((t) => typeof t === 'string'), `${local} precisa ser uma lista de textos.`);
    return lista as string[];
  };
  exigir(Array.isArray(valor.ritmos), `${onde} está sem os ritmos.`);
  exigir(Array.isArray(valor.tags), `${onde} está sem as tags de terreno.`);
  exigir(ehObjeto(valor.tagsPorTile), `${onde} está sem as tags dos tiles.`);
  return {
    kmPorHex: numero(valor, 'kmPorHex', onde),
    horasPorDia: numero(valor, 'horasPorDia', onde),
    // Acrescentadas depois do primeiro formato do bloco: faltando, valem as padrão.
    horaDaPartida: valor.horaDaPartida === undefined ? padrao.horaDaPartida : numero(valor, 'horaDaPartida', onde),
    horasDeDescanso: valor.horasDeDescanso === undefined ? padrao.horasDeDescanso : numero(valor, 'horasDeDescanso', onde),
    horasDeDescansoCurto:
      valor.horasDeDescansoCurto === undefined ? padrao.horasDeDescansoCurto : numero(valor, 'horasDeDescansoCurto', onde),
    ritmos: valor.ritmos.map((r, i) => {
      const local = `O ritmo nº ${i + 1}`;
      exigir(ehObjeto(r), `${local} não é válido.`);
      return {
        id: texto(r, 'id', local),
        nome: texto(r, 'nome', local),
        kmPorHora: numero(r, 'kmPorHora', local),
        nota: typeof r.nota === 'string' ? r.nota : '',
      };
    }),
    tags: valor.tags.map((t, i) => {
      const local = `A tag de terreno nº ${i + 1}`;
      exigir(ehObjeto(t), `${local} não é válida.`);
      exigir(typeof t.intransponivel === 'boolean', `${local}: "intransponivel" precisa ser sim ou não.`);
      // Gravadas antes dos barcos: só a água era navegável.
      const navegavel = t.navegavel === undefined ? t.id === 'agua' : t.navegavel;
      exigir(typeof navegavel === 'boolean', `${local}: "navegavel" precisa ser sim ou não.`);
      return {
        id: texto(t, 'id', local),
        nome: texto(t, 'nome', local),
        multiplicador: numero(t, 'multiplicador', local),
        intransponivel: t.intransponivel,
        navegavel,
        palavras: textos(t.palavras, `${local}: as palavras`),
      };
    }),
    tagsPorTile: Object.fromEntries(
      Object.entries(valor.tagsPorTile).map(([tile, tags]) => [tile, textos(tags, `As tags do tile ${tile}`)]),
    ),
  };
}

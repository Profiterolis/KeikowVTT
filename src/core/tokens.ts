/**
 * Tokens nas instâncias táticas (Fase 6, passo 4): personagens, NPCs e monstros no mapa, com
 * movimento livre (sem grid). Cada token aponta para uma ficha; uma ficha tem no máximo um token
 * no jogo inteiro, porque uma criatura não está em dois lugares ao mesmo tempo.
 *
 * Só o mestre põe, tira e configura tokens. O jogador move os tokens das fichas que controla,
 * enquanto está na instância e sem trava do mestre.
 */
import { calcularFicha } from './calculoDaFicha';
import { TAMANHOS } from './entradas';
import { entradaDaFicha, type Ficha } from './fichas';
import type { EstadoInstancias, Instancia } from './instancias';
import { imagemDoToken } from './imagens';
import { PERMITIDO, type Permissao } from './permissoes';
import type { Regras } from './regras';
import { ehMestre } from './visibilidade';

export type Tamanho = (typeof TAMANHOS)[number];

export interface TokenNaInstancia {
  readonly id: string;
  readonly fichaId: string;
  /** O centro do token, em pixels da instância. */
  readonly x: number;
  readonly y: number;
  /** Diâmetro em metros escolhido pelo mestre; `null` segue o tamanho da criatura. */
  readonly tamanho: number | null;
  /** Só o mestre vê: os jogadores nem recebem o token. */
  readonly escondido: boolean;
  /** O dono não move este token (o mestre move). */
  readonly travado: boolean;
  /** O nome que aparece no mapa, como "Figura encapuzada"; vazio usa o nome da ficha. */
  readonly nomeNoMapa: string;
}

export type MudancasNoToken = Partial<Pick<TokenNaInstancia, 'tamanho' | 'escondido' | 'travado' | 'nomeNoMapa'>>;

/**
 * O espaço que cada tamanho ocupa, em metros (o 5e conta em pés: 2,5 pés, 5, 10, 15, 20).
 * Pequeno e Médio ocupam o mesmo espaço, como no livro.
 */
export const METROS_POR_TAMANHO: Readonly<Record<Tamanho, number>> = {
  miudo: 0.75,
  pequeno: 1.5,
  medio: 1.5,
  grande: 3,
  enorme: 4.5,
  imenso: 6,
};

/** Limites do tamanho escolhido à mão, em metros. */
export const TAMANHO_MINIMO = 0.1;
export const TAMANHO_MAXIMO = 100;

export function novoToken(id: string, fichaId: string, x: number, y: number): TokenNaInstancia {
  return { id, fichaId, x, y, tamanho: null, escondido: false, travado: false, nomeNoMapa: '' };
}

/** O tamanho da criatura: o do monstro, o da espécie ou, sem nenhum dos dois, Médio. */
export function tamanhoDaFicha(ficha: Ficha): Tamanho {
  const monstro = entradaDaFicha(ficha, ficha.monstroId, 'monstro');
  if (monstro) {
    return monstro.dados.tamanho;
  }
  return entradaDaFicha(ficha, ficha.especieId, 'especie')?.dados.tamanho ?? 'medio';
}

/** O diâmetro do token em metros: o escolhido pelo mestre ou o do tamanho da criatura. */
export function diametroEmMetros(token: TokenNaInstancia, ficha: Ficha | undefined): number {
  return token.tamanho ?? METROS_POR_TAMANHO[ficha ? tamanhoDaFicha(ficha) : 'medio'];
}

export function tamanhoValido(tamanho: number | null): boolean {
  return tamanho === null || (Number.isFinite(tamanho) && tamanho >= TAMANHO_MINIMO && tamanho <= TAMANHO_MAXIMO);
}

/** O que está errado num token, ou `null`. */
export function problemaNoToken(token: TokenNaInstancia): string | null {
  if (token.id === '' || token.fichaId === '') {
    return 'O token está sem id ou sem ficha.';
  }
  if (!Number.isFinite(token.x) || !Number.isFinite(token.y)) {
    return 'A posição do token não é válida.';
  }
  if (!tamanhoValido(token.tamanho)) {
    return `O tamanho do token precisa ficar entre ${TAMANHO_MINIMO} e ${TAMANHO_MAXIMO} m.`;
  }
  return null;
}

/** Mantém o centro do token dentro do mapa. */
export function dentroDoMapa(instancia: Pick<Instancia, 'largura' | 'altura'>, x: number, y: number): { x: number; y: number } {
  return { x: Math.min(Math.max(x, 0), instancia.largura), y: Math.min(Math.max(y, 0), instancia.altura) };
}

/** Onde está o token de uma ficha, se ela estiver em algum mapa. */
export function tokenDaFicha(
  estado: EstadoInstancias,
  fichaId: string,
): { readonly instancia: Instancia; readonly token: TokenNaInstancia } | null {
  for (const instancia of Object.values(estado.instancias)) {
    const token = Object.values(instancia.tokens).find((t) => t.fichaId === fichaId);
    if (token) {
      return { instancia, token };
    }
  }
  return null;
}

/**
 * O nome de um monstro novo no mapa, numerado para os iguais se distinguirem:
 * "Goblin 1", "Goblin 2"… O número é o primeiro que ainda não existe.
 */
export function nomeNumerado(base: string, nomesExistentes: readonly string[]): string {
  const limpo = base.trim() || 'Monstro';
  const usados = new Set(nomesExistentes.map((n) => n.trim().toLocaleLowerCase('pt-BR')));
  let numero = 1;
  while (usados.has(`${limpo} ${numero}`.toLocaleLowerCase('pt-BR'))) {
    numero += 1;
  }
  return `${limpo} ${numero}`;
}

/** O que as instâncias consultam das fichas: quem controla cada uma. */
export interface ContextoDasInstancias {
  readonly obterDonoDaFicha: (fichaId: string) => string | null;
}

export const SEM_FICHAS: ContextoDasInstancias = { obterDonoDaFicha: () => null };

const recusa = (motivo: string): Permissao => ({ ok: false, motivo });

/** Se um participante pode mover um token agora, com o motivo quando não pode. */
export function permissaoParaMover(
  estado: EstadoInstancias,
  instanciaId: string,
  tokenId: string,
  participanteId: string,
  contexto: ContextoDasInstancias,
): Permissao {
  const instancia = estado.instancias[instanciaId];
  const token = instancia?.tokens[tokenId];
  if (!instancia || !token) {
    return recusa('Esse token não existe.');
  }
  if (ehMestre(participanteId)) {
    return PERMITIDO;
  }
  if (contexto.obterDonoDaFicha(token.fichaId) !== participanteId) {
    return recusa('Você só move os seus personagens.');
  }
  const cena = estado.cenas[participanteId] ?? estado.cenaInicial;
  if (cena.tipo !== 'instancia' || cena.instanciaId !== instanciaId) {
    return recusa('Você não está nesta instância.');
  }
  if (instancia.movimentoTravado) {
    return recusa('O mestre travou o movimento nesta instância.');
  }
  if (token.travado) {
    return recusa('O mestre travou este token.');
  }
  return PERMITIDO;
}

const igual = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/**
 * Se quem está agindo pode passar de um estado das instâncias ao outro. O mestre pode tudo;
 * o jogador só muda a posição de tokens que ele pode mover. Vale também para desfazer e refazer.
 */
export function conferirInstancias(
  antes: EstadoInstancias,
  depois: EstadoInstancias,
  autorId: string,
  contexto: ContextoDasInstancias,
): Permissao {
  if (ehMestre(autorId) || antes === depois) {
    return PERMITIDO;
  }
  const soOMestre = recusa('Só o mestre muda as instâncias.');
  if (!igual(antes.cenas, depois.cenas) || !igual(antes.cenaInicial, depois.cenaInicial)) {
    return soOMestre;
  }
  const ids = Object.keys(antes.instancias);
  if (!igual(ids.sort(), Object.keys(depois.instancias).sort())) {
    return soOMestre;
  }
  for (const id of ids) {
    const a = antes.instancias[id];
    const d = depois.instancias[id];
    if (a === d) {
      continue;
    }
    const { tokens: tokensAntes, ...restoAntes } = a;
    const { tokens: tokensDepois, ...restoDepois } = d;
    if (!igual(restoAntes, restoDepois) || !igual(Object.keys(tokensAntes).sort(), Object.keys(tokensDepois).sort())) {
      return soOMestre;
    }
    for (const [tokenId, tokenAntes] of Object.entries(tokensAntes)) {
      const tokenDepois = tokensDepois[tokenId];
      if (igual(tokenAntes, tokenDepois)) {
        continue;
      }
      if (!igual({ ...tokenAntes, x: 0, y: 0 }, { ...tokenDepois, x: 0, y: 0 })) {
        return recusa('Só o mestre muda os tokens; você só move os seus.');
      }
      const permissao = permissaoParaMover(antes, id, tokenId, autorId, contexto);
      if (!permissao.ok) {
        return permissao;
      }
    }
  }
  return PERMITIDO;
}

/**
 * Um token como um participante o vê, pronto para desenhar: o nome que ele pode saber, os PV só
 * para o dono e o mestre, e se ele pode mover. Tokens de fichas apagadas somem daqui.
 */
export interface TokenVisto {
  readonly id: string;
  readonly fichaId: string;
  readonly x: number;
  readonly y: number;
  /** Em pixels da instância. */
  readonly diametro: number;
  readonly nome: string;
  readonly tipo: Ficha['tipo'];
  readonly imagem: string | null;
  readonly pv: { readonly atuais: number; readonly maximo: number } | null;
  readonly escondido: boolean;
  readonly travado: boolean;
  readonly podeMover: boolean;
  /** Em metros; `null` quando a fórmula não deu um número. */
  readonly deslocamento: number | null;
}

/**
 * `instancia` é a que o participante recebe (sem os tokens escondidos, para um jogador);
 * `estado` é o estado inteiro, para conferir quem pode mover.
 */
export function tokensVistos(
  estado: EstadoInstancias,
  instancia: Instancia,
  participanteId: string,
  fichas: Readonly<Record<string, Ficha>>,
  regras: Regras,
  contexto: ContextoDasInstancias,
): TokenVisto[] {
  const mestre = ehMestre(participanteId);
  return Object.values(instancia.tokens).flatMap((token) => {
    const ficha = fichas[token.fichaId];
    if (!ficha) {
      return [];
    }
    const calculo = calcularFicha(ficha, regras);
    const pvMaximos = calculo.valor('pv_maximos');
    const deslocamento = calculo.valor('deslocamento');
    const verPv = (mestre || ficha.donoId === participanteId) && pvMaximos.ok;
    const nomeDaFicha = ficha.nome.trim() || 'Sem nome';
    const nomeNoMapa = token.nomeNoMapa.trim();
    return [
      {
        id: token.id,
        fichaId: ficha.id,
        x: token.x,
        y: token.y,
        diametro: diametroEmMetros(token, ficha) / instancia.metrosPorPixel,
        // O mestre vê os dois nomes; os jogadores, só o do mapa.
        nome: nomeNoMapa ? (mestre && nomeNoMapa !== nomeDaFicha ? `${nomeNoMapa} (${nomeDaFicha})` : nomeNoMapa) : nomeDaFicha,
        tipo: ficha.tipo,
        imagem: imagemDoToken(ficha),
        pv: verPv && pvMaximos.ok ? { atuais: ficha.pvAtuais ?? pvMaximos.valor, maximo: pvMaximos.valor } : null,
        escondido: token.escondido,
        travado: token.travado || instancia.movimentoTravado,
        podeMover: permissaoParaMover(estado, instancia.id, token.id, participanteId, contexto).ok,
        deslocamento: deslocamento.ok ? deslocamento.valor : null,
      },
    ];
  });
}

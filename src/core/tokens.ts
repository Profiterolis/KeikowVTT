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
import { alcancaAPorta, deslizar, raioDoCorpo, trechosLivres, type Ponto } from './paredes';
import { PERMITIDO, type Permissao } from './permissoes';
import type { Regras } from './regras';
import { ehMestre } from './visibilidade';
import { problemaNaLuz, type PropriedadesDaLuz } from './luz';

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
  /**
   * Os pontos onde o último movimento mudou de direção (deslizando numa parede). Serve para
   * conferir que o caminho não atravessou paredes; na Fase 8, para animar a caminhada.
   */
  readonly caminho?: readonly Ponto[];
  /**
   * Luz posta pelo mestre no token (a magia Light, um brilho mágico). Vence a luz da ficha;
   * sem ela, vale a da ficha (uma tocha equipada).
   */
  readonly luz?: PropriedadesDaLuz;
}

/** Na luz, `null` tira a luz própria do token e volta a valer a da ficha. */
export type MudancasNoToken = Partial<Pick<TokenNaInstancia, 'tamanho' | 'escondido' | 'travado' | 'nomeNoMapa'>> & {
  readonly luz?: PropriedadesDaLuz | null;
};

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
  return token.luz ? problemaNaLuz(token.luz) : null;
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

/** O que as instâncias consultam das fichas: quem controla cada uma e o tamanho da criatura. */
export interface ContextoDasInstancias {
  readonly obterDonoDaFicha: (fichaId: string) => string | null;
  readonly obterFicha: (fichaId: string) => Ficha | undefined;
}

export const SEM_FICHAS: ContextoDasInstancias = { obterDonoDaFicha: () => null, obterFicha: () => undefined };

/** O raio do círculo desenhado do token, em pixels da instância. */
export function raioDesenhado(token: TokenNaInstancia, instancia: Instancia, contexto: ContextoDasInstancias): number {
  return diametroEmMetros(token, contexto.obterFicha(token.fichaId)) / 2 / instancia.metrosPorPixel;
}

/** O raio do corpo que bate nas paredes, em pixels da instância. */
export function raioDoCorpoDoToken(token: TokenNaInstancia, instancia: Instancia, contexto: ContextoDasInstancias): number {
  return raioDoCorpo(diametroEmMetros(token, contexto.obterFicha(token.fichaId)), instancia.metrosPorPixel);
}

/**
 * Até onde o token chega indo até `destino`: anda em linha reta, desliza nas paredes, portas
 * fechadas e janelas que encontrar, e nunca sai do mapa. `ignorarParedes` (só o mestre, com Shift)
 * passa por tudo. `caminho` são os pontos onde ele mudou de direção.
 */
export function movimentoDoToken(
  instancia: Instancia,
  token: TokenNaInstancia,
  destino: Ponto,
  contexto: ContextoDasInstancias,
  ignorarParedes = false,
): { readonly final: Ponto; readonly caminho: readonly Ponto[] } {
  const alvo = dentroDoMapa(instancia, destino.x, destino.y);
  if (ignorarParedes) {
    return { final: alvo, caminho: [] };
  }
  const { final, caminho } = deslizar(token, alvo, raioDoCorpoDoToken(token, instancia, contexto), Object.values(instancia.paredes));
  return { final: dentroDoMapa(instancia, final.x, final.y), caminho };
}

/**
 * Se um participante pode abrir ou fechar uma porta agora. O mestre pode tudo; o jogador abre ou
 * fecha (sem trancar nem destrancar) uma porta que conhece, com um token dele a até 1,5 m dela.
 */
export function permissaoParaPorta(
  estado: EstadoInstancias,
  instanciaId: string,
  paredeId: string,
  participanteId: string,
  contexto: ContextoDasInstancias,
): Permissao {
  const instancia = estado.instancias[instanciaId];
  const porta = instancia?.paredes[paredeId];
  if (!instancia || !porta || porta.tipo !== 'porta') {
    return recusa('Essa porta não existe.');
  }
  if (ehMestre(participanteId)) {
    return PERMITIDO;
  }
  if (porta.secreta) {
    return recusa('Essa porta não existe.');
  }
  const cena = estado.cenas[participanteId] ?? estado.cenaInicial;
  if (cena.tipo !== 'instancia' || cena.instanciaId !== instanciaId) {
    return recusa('Você não está nesta instância.');
  }
  if (instancia.movimentoTravado) {
    return recusa('O mestre travou o movimento nesta instância.');
  }
  if (porta.estado === 'trancada') {
    return recusa('Trancada.');
  }
  const perto = Object.values(instancia.tokens).some(
    (token) =>
      contexto.obterDonoDaFicha(token.fichaId) === participanteId &&
      alcancaAPorta(token, raioDesenhado(token, instancia, contexto), porta, instancia.metrosPorPixel),
  );
  return perto ? PERMITIDO : recusa('Longe demais da porta: chegue a até 1,5 m dela.');
}

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
    // As luzes e a luz do ambiente ficam no resto: o jogador não mexe nelas.
    const { tokens: tokensAntes, paredes: paredesAntes, ...restoAntes } = a;
    const { tokens: tokensDepois, paredes: paredesDepois, ...restoDepois } = d;
    if (
      !igual(restoAntes, restoDepois) ||
      !igual(Object.keys(tokensAntes).sort(), Object.keys(tokensDepois).sort()) ||
      !igual(Object.keys(paredesAntes).sort(), Object.keys(paredesDepois).sort())
    ) {
      return soOMestre;
    }
    // Paredes: o jogador só abre ou fecha portas.
    for (const [paredeId, paredeAntes] of Object.entries(paredesAntes)) {
      const paredeDepois = paredesDepois[paredeId];
      if (igual(paredeAntes, paredeDepois)) {
        continue;
      }
      const soAbriuOuFechou =
        igual({ ...paredeAntes, estado: '' }, { ...paredeDepois, estado: '' }) &&
        paredeAntes.estado !== 'trancada' &&
        paredeDepois.estado !== 'trancada';
      if (!soAbriuOuFechou) {
        return recusa('Só o mestre muda as paredes; você só abre e fecha portas.');
      }
      const permissao = permissaoParaPorta(antes, id, paredeId, autorId, contexto);
      if (!permissao.ok) {
        return permissao;
      }
    }
    for (const [tokenId, tokenAntes] of Object.entries(tokensAntes)) {
      const tokenDepois = tokensDepois[tokenId];
      if (igual(tokenAntes, tokenDepois)) {
        continue;
      }
      if (!igual({ ...tokenAntes, x: 0, y: 0, caminho: [] }, { ...tokenDepois, x: 0, y: 0, caminho: [] })) {
        return recusa('Só o mestre muda os tokens; você só move os seus.');
      }
      const permissao = permissaoParaMover(antes, id, tokenId, autorId, contexto);
      if (!permissao.ok) {
        return permissao;
      }
      // O corpo do token não atravessa paredes, portas fechadas nem janelas: cada trecho do caminho é conferido.
      const pontos = [tokenAntes, ...(tokenDepois.caminho ?? []), tokenDepois];
      if (!trechosLivres(pontos, raioDoCorpoDoToken(tokenAntes, a, contexto), Object.values(a.paredes))) {
        return recusa('Uma parede está no caminho.');
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

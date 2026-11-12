/**
 * Luz nas instâncias (Fase 6, passo 6): a luz do ambiente, as fontes de luz postas pelo mestre
 * (braseiros, lustres, fogueiras) e a luz que os tokens carregam (tochas, lanternas).
 *
 * Como no 5e, há três níveis: luz clara, penumbra e escuridão. Uma fonte de luz ilumina com luz
 * clara até um raio e com penumbra por mais alguns metros. As paredes barram a luz como barram a
 * visão; janelas e portas abertas deixam passar.
 */

export const LUZES_DO_AMBIENTE = ['clara', 'penumbra', 'escuridao', 'relogio'] as const;
/** `relogio`: ao ar livre, a luz segue a hora do relógio do mundo. */
export type LuzDoAmbiente = (typeof LUZES_DO_AMBIENTE)[number];

export type NivelDeLuz = 'clara' | 'penumbra' | 'escuridao';

/** O nível como número, para comparar: escuridão 0, penumbra 1, clara 2. */
export const VALOR_DO_NIVEL: Readonly<Record<NivelDeLuz, number>> = { escuridao: 0, penumbra: 1, clara: 2 };

export const NIVEL_PELO_VALOR: readonly NivelDeLuz[] = ['escuridao', 'penumbra', 'clara'];

export const MODOS_DE_VISAO = ['livre', 'escurecer', 'masmorra'] as const;
/**
 * O que os jogadores veem fora da visão dos personagens:
 * - `livre`: tudo, sem restrição (o mestre desligou a visão nesta instância);
 * - `escurecer`: o mapa escurecido, sem os tokens;
 * - `masmorra`: preto onde nunca viram; escurecido onde já viram.
 */
export type ModoDeVisao = (typeof MODOS_DE_VISAO)[number];

/** A luz que um token carrega ou que uma fonte do mapa espalha. Raios em metros. */
export interface PropriedadesDaLuz {
  /** Raio da luz clara. */
  readonly clara: number;
  /** Quanto a penumbra vai além da luz clara (no 5e: "luz clara por 6 m e penumbra por mais 6 m"). */
  readonly penumbra: number;
  /** Cor do brilho, como 0xffb35c. Só muda o desenho, não as regras. */
  readonly cor: number;
  /** Tremula como uma chama. Só muda o desenho. */
  readonly tremular: boolean;
}

/** Uma fonte de luz no mapa da instância, posta pelo mestre. Posição em pixels. */
export interface FonteDeLuz extends PropriedadesDaLuz {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly ligada: boolean;
}

/** A cor quente de uma chama, para tochas e fogueiras. */
export const COR_DE_CHAMA = 0xffb35c;

/** A luz que um token leva quando a ficha diz só os raios (uma tocha equipada). */
export const LUZ_DA_FICHA: Pick<PropriedadesDaLuz, 'cor' | 'tremular'> = { cor: COR_DE_CHAMA, tremular: true };

/** Uma fonte nova, como um braseiro: luz clara de 6 m e penumbra por mais 6 m. */
export function novaFonteDeLuz(id: string, x: number, y: number): FonteDeLuz {
  return { id, x, y, clara: 6, penumbra: 6, cor: COR_DE_CHAMA, tremular: true, ligada: true };
}

/** O maior raio aceito, em metros. */
export const RAIO_MAXIMO_DA_LUZ = 1000;

export function problemaNaLuz(luz: PropriedadesDaLuz): string | null {
  const raioValido = (r: number) => Number.isFinite(r) && r >= 0 && r <= RAIO_MAXIMO_DA_LUZ;
  if (!raioValido(luz.clara) || !raioValido(luz.penumbra)) {
    return `Os raios da luz precisam ficar entre 0 e ${RAIO_MAXIMO_DA_LUZ} m.`;
  }
  if (!Number.isInteger(luz.cor) || luz.cor < 0 || luz.cor > 0xffffff) {
    return 'A cor da luz não é válida.';
  }
  return null;
}

export function problemaNaFonte(fonte: FonteDeLuz): string | null {
  if (fonte.id === '') {
    return 'A luz está sem id.';
  }
  if (!Number.isFinite(fonte.x) || !Number.isFinite(fonte.y)) {
    return 'A posição da luz não é válida.';
  }
  return problemaNaLuz(fonte);
}

/**
 * A luz do dia pela hora do relógio do mundo (minutos desde a meia-noite do Dia 1):
 * clara das 7h às 18h, penumbra no amanhecer (5h às 7h) e no anoitecer (18h às 20h), escuridão à noite.
 */
export function luzPeloRelogio(relogio: number): NivelDeLuz {
  const hora = (((relogio / 60) % 24) + 24) % 24;
  if (hora >= 7 && hora < 18) {
    return 'clara';
  }
  if ((hora >= 5 && hora < 7) || (hora >= 18 && hora < 20)) {
    return 'penumbra';
  }
  return 'escuridao';
}

/** O nível da luz do ambiente agora. */
export function nivelDoAmbiente(luz: LuzDoAmbiente, relogio: number): NivelDeLuz {
  return luz === 'relogio' ? luzPeloRelogio(relogio) : luz;
}

export const ROTULO_DA_LUZ_DO_AMBIENTE: Readonly<Record<LuzDoAmbiente, string>> = {
  clara: 'Luz clara',
  penumbra: 'Penumbra',
  escuridao: 'Escuridão',
  relogio: 'Pelo relógio do mundo',
};

export const ROTULO_DO_MODO_DE_VISAO: Readonly<Record<ModoDeVisao, string>> = {
  livre: 'Desligada (os jogadores veem tudo)',
  escurecer: 'Escurecer fora da visão',
  masmorra: 'Névoa de masmorra',
};

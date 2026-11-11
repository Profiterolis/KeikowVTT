import { describe, expect, it } from 'vitest';
import { diarioEmTexto, diarioPorDias, resumoDoDia, rotuloDoHex, type NomesDoDiario } from './diarioDeViagem';
import { aplicarAcaoGrupo, GRUPO_INICIAL, type AcaoGrupo, type ContextoDoGrupo, type EstadoGrupo } from './grupo';
import { aplicarAcao, criarMapaVazio } from './mapa';
import { REGRAS_DE_VIAGEM_PADRAO as VIAGEM } from './viagem';

const A = { q: 0, r: 0 };
const B = { q: 1, r: 0 };
const C = { q: 2, r: 0 };

const MAPA = [
  [A, 'hexPlains00'],
  [B, 'hexForestBroadleaf00'],
  [C, 'hexPlains00'],
].reduce((mapa, [coord, terreno]) => aplicarAcao(mapa, { tipo: 'ColocarTile', coord: coord as typeof A, terreno: terreno as string }), criarMapaVazio());

const contexto: ContextoDoGrupo = {
  obterMapa: () => MAPA,
  obterViagem: () => VIAGEM,
  obterDonoDaFicha: () => null,
  obterMembroNaViagem: () => null,
};

const nomes: NomesDoDiario = {
  nomeDoHex: (c) => (c.q === 1 ? 'Bosque Velho' : ''),
  nomeDoAutor: (id) => (id === 'mestre' ? 'Mestre' : 'Ana'),
  viagem: VIAGEM,
};

function viajar(...acoes: AcaoGrupo[]): EstadoGrupo {
  return acoes.reduce<EstadoGrupo>((estado, acao) => {
    const r = aplicarAcaoGrupo(estado, acao, 'mestre', contexto);
    if (!r.ok) {
      throw new Error(r.motivo);
    }
    return r.estado;
  }, GRUPO_INICIAL);
}

const viagem = viajar(
  { tipo: 'PosicionarGrupo', coord: A },
  { tipo: 'MoverGrupo', para: B },
  { tipo: 'MoverGrupo', para: C },
  { tipo: 'AnotarNaViagem', texto: 'Emboscada de goblins' },
  { tipo: 'Descansar', descanso: 'longo', lugar: 'abrigo', nomeDoLugar: 'Estalagem do Javali' },
  { tipo: 'AvancarTempo', minutos: 60 },
);

describe('diário de viagem', () => {
  it('agrupa por dia, do mais recente ao mais antigo, com as linhas na ordem dos acontecimentos', () => {
    const dias = diarioPorDias(viagem.historico, nomes);
    expect(dias.map((d) => d.dia)).toEqual([2, 1]);
    expect(dias[1].linhas.map((l) => l.icone)).toEqual(['📌', '🥾', '🥾', '📝', '💤']);
    expect(dias[0].linhas.map((l) => l.texto)).toEqual(['Tempo avançado: +1 h']);
  });

  it('escreve o passo com os nomes dos hexes, o tempo, o ritmo e as tags da origem', () => {
    const [, primeiro] = diarioPorDias(viagem.historico, nomes);
    const saindoDaFloresta = primeiro.linhas[2];
    expect(saindoDaFloresta.texto).toBe('Andou de Bosque Velho (1, 0) para (2, 0)');
    expect(saindoDaFloresta.hora).toBe('10:00 → 14:00');
    expect(saindoDaFloresta.detalhe).toBe('4 h · ritmo normal · Floresta ×2');
    expect(saindoDaFloresta.coord).toEqual(C);
    expect(saindoDaFloresta.autor).toBe('Mestre');
    // Tags que não mudam o tempo (Campo ×1) ficam de fora.
    expect(primeiro.linhas[1].detalhe).toBe('2 h · ritmo normal');
  });

  it('o descanso que vira o dia mostra o dia em que termina', () => {
    const descanso = diarioPorDias(viagem.historico, nomes)[1].linhas[4];
    expect(descanso.texto).toBe('Descanso longo no abrigo "Estalagem do Javali"');
    expect(descanso.hora).toBe('14:00 → Dia 2, 08:00');
    expect(descanso.coord).toEqual(C);
  });

  it('o resumo conta o dia todo, mesmo com o filtro escondendo linhas', () => {
    const [dia1] = diarioPorDias(viagem.historico, nomes, new Set(['anotacoes']));
    expect(dia1.dia).toBe(1);
    expect(dia1.linhas).toHaveLength(1);
    expect(resumoDoDia(dia1)).toBe('6 h de viagem · 2 hexes · 1 descanso');
    expect(diarioPorDias(viagem.historico, nomes, new Set(['descansos'])).map((d) => d.dia)).toEqual([1]);
  });

  it('o texto para copiar vai do primeiro dia ao último', () => {
    const texto = diarioEmTexto(viagem.historico, nomes);
    expect(texto.indexOf('Dia 1 (')).toBeLessThan(texto.indexOf('Dia 2'));
    expect(texto).toContain('10:00 → 14:00  Andou de Bosque Velho (1, 0) para (2, 0) (4 h · ritmo normal · Floresta ×2) [Mestre]');
  });

  it('um hex sem nome aparece só com a posição', () => {
    expect(rotuloDoHex({ q: 3, r: -2 }, '  ')).toBe('(3, -2)');
  });
});

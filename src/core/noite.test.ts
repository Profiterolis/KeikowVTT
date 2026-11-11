import { describe, expect, it } from 'vitest';
import { aplicarAcaoCompendio, criarCompendioVazio } from './compendio';
import { criarEntrada, type Entrada } from './entradas';
import { comItem, criarFicha, type Ficha } from './fichas';
import {
  aplicarAcaoGrupo,
  ESCOLHA_SECRETA,
  formatarRelogio,
  GRUPO_INICIAL,
  grupoVistoPor,
  permissaoNoGrupo,
  type AcaoGrupo,
  type ContextoDoGrupo,
  type EstadoGrupo,
} from './grupo';
import { aplicarAcao, criarMapaVazio, type EstadoMapa } from './mapa';
import { resolverTurno, temVeiculoFechado } from './noite';
import { REGRAS_PADRAO } from './regrasPadrao';

const R = REGRAS_PADRAO;
const CAMPO = { q: 0, r: 0 };
const VILA = { q: 1, r: 0 };

function mapaCom(...tiles: [{ q: number; r: number }, string][]): EstadoMapa {
  return tiles.reduce<EstadoMapa>((m, [coord, terreno]) => aplicarAcao(m, { tipo: 'ColocarTile', coord, terreno }), criarMapaVazio());
}
const MAPA = mapaCom([CAMPO, 'hexPlains00'], [VILA, 'hexDirtVillage00']);

const corda = { ...criarEntrada('item', 'corda'), nome: 'Corda' };
const carruagem = { ...criarEntrada('item', 'carruagem'), nome: 'Carruagem', etiquetas: ['Veículo fechado'] };
const bolaDeFogo = { ...criarEntrada('magia', 'fogo'), nome: 'Bola de Fogo' };
const grimorio = { ...criarEntrada('item', 'grimorio'), nome: 'Grimório' };
const compendio = ([corda, carruagem, bolaDeFogo, grimorio] as Entrada[]).reduce(
  (c, entrada) => aplicarAcaoCompendio(c, { tipo: 'AdicionarEntrada', entrada }),
  criarCompendioVazio(),
);

/** Ana tem o Thorin (líder, ágil); Bia tem a Lyra (atenta); o mestre, o NPC Guia. */
const ficha = (id: string, nome: string, dono: string, atributos: Partial<Ficha['atributos']> = {}): Ficha => ({
  ...criarFicha(id === 'guia' ? 'npc' : 'personagem', id, dono),
  nome,
  atributos: { ...criarFicha('personagem', 'x').atributos, ...atributos },
});
const FICHAS: Record<string, Ficha> = {
  thor: ficha('thor', 'Thorin', 'j-ana', { des: 18 }),
  lyra: comItem(ficha('lyra', 'Lyra', 'j-bia', { sab: 10 }), compendio, 'corda', 'pilha-corda', 3),
  guia: ficha('guia', 'Guia', 'mestre', { sab: 20 }),
};

const contexto = (mapa = MAPA, fichas = FICHAS): ContextoDoGrupo => ({
  obterMapa: () => mapa,
  obterViagem: () => R.viagem,
  obterDonoDaFicha: (id) => fichas[id]?.donoId ?? null,
  obterMembroNaViagem: () => null,
  obterNoite: () => R.noite,
});

const noCampo: EstadoGrupo = { ...GRUPO_INICIAL, posicao: CAMPO, membros: ['thor', 'lyra', 'guia'], liderId: 'thor', relogio: 20 * 60 };

function aplicar(estado: EstadoGrupo, acao: AcaoGrupo, autorId = 'mestre', ctx = contexto()): EstadoGrupo {
  const permissao = permissaoNoGrupo(estado, acao, autorId, ctx);
  if (!permissao.ok) {
    throw new Error(permissao.motivo);
  }
  const r = aplicarAcaoGrupo(estado, acao, autorId, ctx);
  if (!r.ok) {
    throw new Error(r.motivo);
  }
  return r.estado;
}

/** Números em sequência, para o d20 (×20) e o d100 (×100) saírem como se quer. */
const sequencia = (...valores: number[]) => {
  let i = 0;
  return () => valores[i++ % valores.length];
};
const d20 = (face: number) => (face - 1) / 20 + 0.001;
const SEM_ENCONTRO = 0.99;

describe('a noite no grupo', () => {
  it('o líder começa a noite; outro jogador não; com o bloqueio do mestre, ninguém além dele', () => {
    expect(aplicar(noCampo, { tipo: 'ComecarNoite', lugar: 'acampamento' }, 'j-ana').noite).toMatchObject({ turno: 1, lugar: 'acampamento' });
    expect(() => aplicar(noCampo, { tipo: 'ComecarNoite', lugar: 'acampamento' }, 'j-bia')).toThrow('líder');
    const bloqueado = aplicar(noCampo, { tipo: 'BloquearNoite', bloqueado: true });
    expect(() => aplicar(bloqueado, { tipo: 'ComecarNoite', lugar: 'acampamento' }, 'j-ana')).toThrow('bloqueou');
    expect(aplicar(bloqueado, { tipo: 'ComecarNoite', lugar: 'acampamento' }).noite).not.toBeNull();
    expect(() => aplicar(noCampo, { tipo: 'ComecarNoite', lugar: 'abrigo' }, 'j-ana')).toThrow('povoado');
  });

  it('cada dono escolhe a ação dos próprios personagens; o bloqueio impede as escolhas', () => {
    const noite = aplicar(noCampo, { tipo: 'ComecarNoite', lugar: 'acampamento' });
    const vigiar = { tipo: 'EscolherNoturna', fichaId: 'lyra', escolha: { acaoId: 'vigiar' } } as const;
    expect(aplicar(noite, vigiar, 'j-bia').noite?.escolhas.lyra).toEqual({ acaoId: 'vigiar' });
    expect(() => aplicar(noite, vigiar, 'j-ana')).toThrow('dono da ficha');
    expect(() => aplicar(noite, { tipo: 'EscolherNoturna', fichaId: 'thor', escolha: { acaoId: 'furtar' } }, 'j-ana')).toThrow('outro personagem');
    expect(() => aplicar(noite, { tipo: 'EscolherNoturna', fichaId: 'thor', escolha: { acaoId: 'estudar' } }, 'j-ana')).toThrow('idioma');
    const bloqueada = aplicar(noite, { tipo: 'BloquearNoite', bloqueado: true });
    expect(() => aplicar(bloqueada, vigiar, 'j-bia')).toThrow('bloqueou');
  });

  it('no abrigo não há vigia', () => {
    const naVila = aplicar({ ...noCampo, posicao: VILA }, { tipo: 'ComecarNoite', lugar: 'abrigo', nomeDoLugar: 'Javali' }, 'j-ana');
    expect(() => aplicar(naVila, { tipo: 'EscolherNoturna', fichaId: 'lyra', escolha: { acaoId: 'vigiar' } }, 'j-bia')).toThrow('não existe');
  });

  it('os jogadores veem as próprias escolhas e só que os outros já escolheram; o resumo é do mestre', () => {
    let e = aplicar(noCampo, { tipo: 'ComecarNoite', lugar: 'acampamento' });
    e = aplicar(e, { tipo: 'EscolherNoturna', fichaId: 'lyra', escolha: { acaoId: 'vigiar' } }, 'j-bia');
    e = aplicar(e, { tipo: 'EscolherNoturna', fichaId: 'thor', escolha: { acaoId: 'furtar', alvoId: 'lyra' } }, 'j-ana');
    e = aplicar(e, { tipo: 'ResolverTurno', resultado: { turno: 1, linhas: ['x'], descansaram: [] } });
    e = aplicar(e, { tipo: 'EscolherNoturna', fichaId: 'thor', escolha: { acaoId: 'furtar', alvoId: 'lyra' } }, 'j-ana');
    e = aplicar(e, { tipo: 'EscolherNoturna', fichaId: 'lyra', escolha: { acaoId: 'vigiar' } }, 'j-bia');
    const daBia = grupoVistoPor(e, 'j-bia', (id) => FICHAS[id]?.donoId ?? null);
    expect(daBia.noite?.escolhas).toEqual({ thor: ESCOLHA_SECRETA, lyra: { acaoId: 'vigiar' } });
    expect(daBia.noite?.turnos).toEqual([]);
    expect(grupoVistoPor(e, 'mestre').noite?.turnos).toHaveLength(1);
  });

  it('o último turno encerra a noite: manhã, descansos conquistados e uma linha no diário; desfazer volta', () => {
    let e = aplicar(noCampo, { tipo: 'ComecarNoite', lugar: 'acampamento' });
    const turno = (n: number, descansaram: string[]) => ({ tipo: 'ResolverTurno', resultado: { turno: n, linhas: [`t${n}`], descansaram } }) as const;
    expect(() => aplicar(e, turno(1, []), 'j-ana')).toThrow('Só o mestre');
    e = aplicar(e, turno(1, ['thor', 'lyra']));
    e = aplicar(e, turno(2, ['thor']));
    expect(() => aplicar(e, turno(2, []))).toThrow('já foi resolvido');
    e = aplicar(e, turno(3, []));
    expect(e.noite).toBeNull();
    expect(formatarRelogio(e.relogio)).toBe('Dia 2, 08:00');
    expect(e.descansosPendentes).toEqual({ thor: 'longo', lyra: 'curto' });
    expect(e.historico.at(-1)?.acontecimento).toMatchObject({ tipo: 'noite', turnos: [{ turno: 1 }, { turno: 2 }, { turno: 3 }] });
    const desfeito = aplicar(e, { tipo: 'DesfazerViagem' });
    expect(desfeito.relogio).toBe(noCampo.relogio);
    expect(desfeito.descansosPendentes).toEqual({});
  });

  it('no abrigo, um turno descansando já é descanso longo', () => {
    let e = aplicar({ ...noCampo, posicao: VILA }, { tipo: 'ComecarNoite', lugar: 'abrigo' });
    for (const n of [1, 2, 3]) {
      e = aplicar(e, { tipo: 'ResolverTurno', resultado: { turno: n, linhas: [], descansaram: n === 1 ? ['lyra'] : [] } });
    }
    expect(e.descansosPendentes).toEqual({ lyra: 'longo' });
  });
});

describe('resolver um turno', () => {
  const comNoite = (escolhas: Record<string, object>, lugar: 'acampamento' | 'abrigo' = 'acampamento', base = noCampo): EstadoGrupo => ({
    ...base,
    noite: { lugar, nomeDoLugar: '', turno: 1, escolhas: escolhas as never, turnos: [] },
  });
  const resolver = (estado: EstadoGrupo, aleatorio: () => number, fichas = FICHAS, mapa = MAPA) =>
    resolverTurno({ estado, contexto: contexto(mapa, fichas), regras: R, fichas, compendio, aleatorio, criarId: () => 'novo' })!;

  it('quem não escolheu descansa', () => {
    const r = resolver(comNoite({}), sequencia(SEM_ENCONTRO));
    expect(r.turno.descansaram).toEqual(['thor', 'lyra', 'guia']);
    expect(r.turno.linhas).toContain('Thorin descansou');
  });

  it('furto bem-sucedido: um item passa ao ladrão, só ele é avisado; com a vítima dormindo, rola com vantagem', () => {
    // Lyra dorme: vantagem. Os dois d20 dão 15 e 10; Prestidigitação +4 (DES 18). Percepção passiva da Lyra: 10.
    const r = resolver(comNoite({ thor: { acaoId: 'furtar', alvoId: 'lyra' } }), sequencia(d20(15), d20(10), 0, SEM_ENCONTRO));
    const [lyra, thor] = [r.fichas.find((f) => f.id === 'lyra')!, r.fichas.find((f) => f.id === 'thor')!];
    expect(lyra.itens[0].quantidade).toBe(2);
    expect(thor.itens.map((p) => [p.entradaId, p.quantidade])).toEqual([['corda', 1]]);
    expect(r.rolagens[0]).toMatchObject({ rotulo: 'Furto em Lyra (vantagem)', total: 19, visibilidade: { tipo: 'mestre' } });
    expect(r.notificacoes.map((n) => n.texto)).toEqual(['Você furtou Corda de Lyra. (Thorin)']);
    expect(r.notificacoes[0].visibilidade).toEqual({ tipo: 'jogadores', ids: ['j-ana'] });
  });

  it('furto que falha avisa a vítima; um vigia atento deixa o furto mais difícil', () => {
    // Lyra e o Guia (SAB 20, passiva 15) vigiam: 10 + 4 = 14 contra 15. Empatar já seria sucesso.
    const r = resolver(comNoite({ thor: { acaoId: 'furtar', alvoId: 'lyra' }, lyra: { acaoId: 'vigiar' }, guia: { acaoId: 'vigiar' } }), sequencia(d20(10), SEM_ENCONTRO));
    expect(r.fichas).toEqual([]);
    expect(r.turno.linhas).toContain('Thorin tentou furtar Lyra: 14 contra 15, falhou');
    expect(r.notificacoes.find((n) => n.icone === '⚠️')).toMatchObject({ texto: 'Thorin tentou te furtar! (Lyra)', visibilidade: { tipo: 'jogadores', ids: ['j-bia'] } });
  });

  it('encontros: com vigia, sem vigia (surpresa) e com veículo fechado; na estalagem, nenhum', () => {
    const encontro = sequencia(0); // d100 = 1: sempre há encontro (o campo tem 5%)
    expect(resolver(comNoite({ lyra: { acaoId: 'vigiar' } }), encontro).notificacoes[0].texto).toContain('Vigiavam: Lyra');
    expect(resolver(comNoite({}), encontro).notificacoes[0].texto).toContain('surpreendido');
    const comCarruagem = { ...FICHAS, guia: comItem(FICHAS.guia, compendio, 'carruagem', 'p-carruagem') };
    // Sem lugares no veículo (nenhum efeito), a carruagem não protege.
    expect(temVeiculoFechado(Object.values(comCarruagem), R)).toBe(false);
    const naVila = comNoite({}, 'abrigo', { ...noCampo, posicao: VILA });
    expect(resolver(naVila, encontro).notificacoes).toEqual([]);
  });

  it('estudar é um teste contra a CD do tema: sucesso soma progresso; com tudo junto, aprende sozinho', () => {
    // Élfico: CD 12, 6 sucessos, História (INT 10, +0). d20 = 15: sucesso.
    const r = resolver(comNoite({ lyra: { acaoId: 'estudar', temaId: 'elfico' } }), sequencia(d20(15), SEM_ENCONTRO));
    const lyra = r.fichas[0];
    expect(lyra.estudos).toEqual([{ id: 'novo', tipo: 'idioma', temaId: 'elfico', magiaId: null, alvo: 'Élfico', assunto: 'Élfico', progresso: 1 }]);
    expect(r.turno.linhas).toContain('Lyra estudou Élfico: 15 contra 12, sucesso (1/6)');
    expect(r.rolagens[0]).toMatchObject({ rotulo: 'Estudo: Élfico (CD 12)', visibilidade: { tipo: 'jogadores', ids: ['j-bia'] } });
    const falhou = resolver(comNoite({ lyra: { acaoId: 'estudar', temaId: 'elfico' } }), sequencia(d20(5), SEM_ENCONTRO));
    expect(falhou.fichas[0].estudos[0].progresso).toBe(0);

    const semLivro = resolver(comNoite({ thor: { acaoId: 'estudar', magiaId: 'fogo', fontePilhaId: 'nada' } }), sequencia(SEM_ENCONTRO));
    expect(semLivro.turno.linhas).toContain('Thorin quis estudar Bola de Fogo, mas está sem o livro ou pergaminho');
    // A magia de teste é um truque: CD 10 e 1 sucesso. Aprende no mesmo turno.
    const comLivro = { ...FICHAS, thor: comItem(FICHAS.thor, compendio, 'grimorio', 'p-grimorio') };
    const estudou = resolver(comNoite({ thor: { acaoId: 'estudar', magiaId: 'fogo', fontePilhaId: 'p-grimorio' } }), sequencia(d20(15), SEM_ENCONTRO), comLivro);
    const thor = estudou.fichas[0];
    expect(thor.estudos).toEqual([]);
    expect(thor.extras).toEqual(['fogo']);
    expect(estudou.notificacoes[0]).toMatchObject({ icone: '🎓', texto: 'Thorin aprendeu Bola de Fogo!' });
  });

  it('treinar usa Força ou Destreza; ao completar, a proficiência entra na ficha', () => {
    // Armas simples: CD 12, 6 sucessos, Força 10. Com 5 sucessos guardados, um 20 natural completa.
    const quase = { ...FICHAS, thor: { ...FICHAS.thor, estudos: [{ id: 'e', tipo: 'proficiencia' as const, temaId: 'armas_simples', magiaId: null, alvo: 'Simple Weapons', assunto: 'Armas simples', progresso: 5 }] } };
    const r = resolver(comNoite({ thor: { acaoId: 'treinar', temaId: 'armas_simples' } }), sequencia(d20(20), SEM_ENCONTRO), quase);
    expect(r.fichas[0]).toMatchObject({ estudos: [], proficienciasExtras: ['Simple Weapons'] });
    expect(r.turno.linhas).toContain('🎓 Thorin aprendeu Armas simples!');
  });

  it('no último turno, cada dono fica sabendo do descanso que ganhou', () => {
    const ultimo: EstadoGrupo = {
      ...noCampo,
      noite: { lugar: 'acampamento', nomeDoLugar: '', turno: 3, escolhas: {}, turnos: [{ turno: 1, linhas: [], descansaram: ['thor'] }, { turno: 2, linhas: [], descansaram: [] }] },
    };
    const textos = resolver(ultimo, sequencia(SEM_ENCONTRO)).notificacoes.map((n) => n.texto);
    expect(textos).toContain('A noite acabou. Thorin: descanso longo (aplique no painel do grupo).');
    expect(textos).toContain('A noite acabou. Lyra: descanso curto (aplique no painel do grupo).');
  });
});

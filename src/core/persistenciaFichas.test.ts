import { describe, expect, it } from 'vitest';
import { criarCampanhaInicial } from './campanha';
import { aplicarAcaoCompendio, criarCompendioVazio } from './compendio';
import { criarEntrada, type EntradaDe } from './entradas';
import {
  comClasse,
  comItemAvulso,
  comMoeda,
  comNivel,
  comNota,
  comSecao,
  criarFicha,
  fichaDeMonstro,
  SECOES_PADRAO,
  type EstadoFichas,
  type Ficha,
} from './fichas';
import { comCartaMovida } from './organizacaoDaFicha';
import { GRUPO_SEM_POSICAO } from './grupo';
import { criarMapaVazio } from './mapa';
import { serializarArquivoCompleto } from './persistenciaCampanha';
import { paraJogadores } from './visibilidade';
import { desserializarFichas, fichasParaObjeto, lerFichasDoArquivo, serializarFichas } from './persistenciaFichas';

const classe: EntradaDe<'classe'> = { ...criarEntrada('classe', 'guerreiro'), nome: 'Fighter' };
const compendio = aplicarAcaoCompendio(criarCompendioVazio(), { tipo: 'AdicionarEntrada', entrada: classe });

function exemplo(): EstadoFichas {
  const heroi: Ficha = {
    ...comNivel(comClasse({ ...criarFicha('personagem', 'h1', 'jogador-1'), nome: 'Ana' }, compendio, 'guerreiro'), 'guerreiro', 3),
    proficiencias: { atletismo: 1, furtividade: 2, historia: 0.5 },
    pvPorNivel: [null, 8],
    pvAtuais: 12,
    pvTemporarios: 3,
    visibilidade: paraJogadores(['jogador-2']),
    edicaoLiberada: true,
    emCriacao: true,
    niveisLiberados: 2,
    rascunho: { metodo: 'rolagem', rolados: [15, 14, 12, 11, 10, 9], kitId: null, itens: [] },
  };
  const comInventario = comSecao(
    comNota(
      comMoeda(comItemAvulso(heroi, 'corda', 'p1', 'Corda'), 'po', 15),
      { id: 'n1', titulo: 'Medos', texto: 'Tem medo de aranhas.' },
    ),
    'cinto',
    'Cinto',
  );
  const goblin = fichaDeMonstro({ ...criarEntrada('monstro', 'goblin'), nome: 'Goblin' }, 'm1');
  return { fichas: { h1: comCartaMovida(comInventario, 'item:p1', 'cinto', 0), m1: goblin } };
}

const comoTexto = (valor: unknown) => JSON.stringify(valor);

describe('salvar e ler fichas', () => {
  it('lê de volta o que foi gravado', () => {
    const estado = exemplo();
    expect(desserializarFichas(serializarFichas(estado))).toEqual({ ok: true, estado });
  });

  it('guarda o retrato e o token, e recusa uma imagem com id estranho', () => {
    const estado = exemplo();
    const comImagens: EstadoFichas = {
      fichas: { ...estado.fichas, h1: { ...estado.fichas.h1, retrato: `img-${'1'.repeat(64)}`, token: `img-${'2'.repeat(64)}` } },
    };
    expect(desserializarFichas(serializarFichas(comImagens))).toEqual({ ok: true, estado: comImagens });
    const estranha = serializarFichas(comImagens).replace(`img-${'1'.repeat(64)}`, '../segredo.png');
    expect(desserializarFichas(estranha)).toMatchObject({ ok: false });
  });

  it('o arquivo do botão Salvar traz as fichas; arquivos antigos não têm', () => {
    const estado = exemplo();
    const conteudo = { campanha: criarCampanhaInicial(), registro: [] };
    const comFichas = serializarArquivoCompleto(criarMapaVazio(), GRUPO_SEM_POSICAO, conteudo, undefined, estado);
    expect(lerFichasDoArquivo(comFichas)).toEqual({ ok: true, estado });
    const semFichas = serializarArquivoCompleto(criarMapaVazio(), GRUPO_SEM_POSICAO, conteudo);
    expect(lerFichasDoArquivo(semFichas)).toEqual({ ok: true, estado: null });
  });

  it('converte cópias de entradas de versões antigas do compêndio', () => {
    const objeto = fichasParaObjeto(exemplo());
    const antiga = {
      ...objeto,
      versaoEntradas: 2,
      fichas: objeto.fichas.map((f) => ({
        ...f,
        // Na versão 2, as classes ainda não tinham a tabela.
        entradas: f.entradas.map((e) => (e.tipo === 'classe' ? { ...e, dados: { ...e.dados, tabela: undefined } } : e)),
      })),
    };
    const lido = desserializarFichas(comoTexto(antiga));
    expect(lido.ok && lido.estado.fichas.h1.entradas.guerreiro).toEqual(classe);
  });

  it('fichas da versão 1 ganham inventário e seções, e a nota antiga vira uma carta', () => {
    const objeto = fichasParaObjeto(exemplo());
    const { itens: _i, extras: _e, moedas: _m, secoes: _s, ...antiga } = objeto.fichas[0];
    const v1 = { ...objeto, versao: 1, fichas: [{ ...antiga, notas: 'Tem medo de aranhas.' }] };
    const lido = desserializarFichas(comoTexto(v1));
    expect(lido.ok && lido.estado.fichas.h1).toMatchObject({
      itens: [],
      extras: [],
      notas: [{ titulo: 'Notas', texto: 'Tem medo de aranhas.' }],
      moedas: { pc: 0, pp: 0, pe: 0, po: 0, pl: 0 },
      secoes: SECOES_PADRAO,
    });
  });

  it('fichas da versão 3 ficam só com o dono e o mestre, sem a edição liberada', () => {
    const objeto = fichasParaObjeto(exemplo());
    const { visibilidade: _v, edicaoLiberada: _e, ...antiga } = objeto.fichas[0];
    const lido = desserializarFichas(comoTexto({ ...objeto, versao: 3, fichas: [antiga] }));
    expect(lido.ok && lido.estado.fichas.h1).toMatchObject({ visibilidade: { tipo: 'mestre' }, edicaoLiberada: false });
  });

  it('fichas da versão 4 não estão em criação nem têm níveis liberados', () => {
    const objeto = fichasParaObjeto(exemplo());
    const { emCriacao: _c, niveisLiberados: _n, ...antiga } = objeto.fichas[0];
    const lido = desserializarFichas(comoTexto({ ...objeto, versao: 4, fichas: [antiga] }));
    expect(lido.ok && lido.estado.fichas.h1).toMatchObject({ emCriacao: false, niveisLiberados: 0 });
  });

  it('fichas da versão 5 não têm rascunho da criação', () => {
    const objeto = fichasParaObjeto(exemplo());
    const { rascunho: _r, ...antiga } = objeto.fichas[0];
    const lido = desserializarFichas(comoTexto({ ...objeto, versao: 5, fichas: [antiga] }));
    expect(lido.ok && lido.estado.fichas.h1.rascunho).toBeNull();
  });

  it('fichas da versão 7 ganham estudos, idiomas e proficiências aprendidas vazios', () => {
    const objeto = fichasParaObjeto(exemplo());
    const { estudos: _e, idiomas: _i, proficienciasExtras: _p, ...antiga } = objeto.fichas[0];
    const lido = desserializarFichas(comoTexto({ ...objeto, versao: 7, fichas: [antiga] }));
    expect(lido.ok && lido.estado.fichas.h1).toMatchObject({ estudos: [], idiomas: [], proficienciasExtras: [] });
  });

  it('estudos da versão 8 viram progresso: cada turno estudado conta como um sucesso', () => {
    const objeto = fichasParaObjeto(exemplo());
    const { proficienciasExtras: _p, ...ficha } = objeto.fichas[0];
    const antiga = { ...ficha, estudos: [{ id: 'e1', tipo: 'idioma', assunto: 'Élfico', magiaId: null, turnos: 3 }] };
    const lido = desserializarFichas(comoTexto({ ...objeto, versao: 8, fichas: [antiga] }));
    expect(lido.ok && lido.estado.fichas.h1.estudos).toEqual([
      { id: 'e1', tipo: 'idioma', temaId: null, magiaId: null, alvo: 'Élfico', assunto: 'Élfico', progresso: 3 },
    ]);
  });

  it('estudos, idiomas e proficiências aprendidas voltam iguais', () => {
    const base = exemplo();
    const h1 = base.fichas.h1;
    const estudos = [{ id: 'e1', tipo: 'pericia' as const, temaId: 'atletismo', magiaId: null, alvo: 'atletismo', assunto: 'Atletismo', progresso: 3 }];
    const estado = { fichas: { ...base.fichas, h1: { ...h1, estudos, idiomas: ['Anão'], proficienciasExtras: ['Martial Weapons'] } } };
    const lido = desserializarFichas(serializarFichas(estado));
    expect(lido.ok && lido.estado.fichas.h1).toMatchObject({ estudos, idiomas: ['Anão'], proficienciasExtras: ['Martial Weapons'] });
  });

  it('rascunhos da versão 6 ganham o kit vazio, e os itens da ficha viram os itens livres', () => {
    const objeto = fichasParaObjeto(exemplo());
    const ficha = objeto.fichas[0] as unknown as Record<string, unknown>;
    const antiga = { ...ficha, rascunho: { metodo: 'padrao', rolados: null } };
    const lido = desserializarFichas(comoTexto({ ...objeto, versao: 6, fichas: [antiga] }));
    const itens = (ficha.itens as { entradaId: string; quantidade: number }[]).map(({ entradaId, quantidade }) => ({ entradaId, quantidade }));
    expect(lido.ok && lido.estado.fichas.h1.rascunho).toEqual({ metodo: 'padrao', rolados: null, kitId: null, itens });
  });

  it.each([
    ['rascunho sem os itens', (f: Record<string, unknown>) => ({ ...f, rascunho: { metodo: 'padrao', rolados: null, kitId: null } }), 'itens escolhidos'],
    ['rascunho com método desconhecido', (f: Record<string, unknown>) => ({ ...f, rascunho: { metodo: 'sorte', rolados: null } }), 'método'],
    ['rascunho com cinco valores rolados', (f: Record<string, unknown>) => ({ ...f, rascunho: { metodo: 'rolagem', rolados: [1, 2, 3, 4, 5] } }), 'rolados'],
    ['níveis liberados negativos', (f: Record<string, unknown>) => ({ ...f, niveisLiberados: -1 }), 'níveis liberados'],
    ['visibilidade desconhecida', (f: Record<string, unknown>) => ({ ...f, visibilidade: { tipo: 'amigos' } }), 'visibilidade inválida'],
    ['lista de jogadores estranha', (f: Record<string, unknown>) => ({ ...f, visibilidade: { tipo: 'jogadores', ids: [3] } }), 'lista de jogadores'],
    ['edição liberada que não é sim ou não', (f: Record<string, unknown>) => ({ ...f, edicaoLiberada: 'talvez' }), 'edicaoLiberada'],
    ['item que não está entre as cópias', (f: Record<string, unknown>) => ({ ...f, itens: [{ id: 'x', entradaId: 'nada', quantidade: 1, equipado: false, sintonizado: false }] }), 'não está entre as cópias'],
    ['ficha sem seções', (f: Record<string, unknown>) => ({ ...f, secoes: [] }), 'ao menos uma seção'],
    ['moedas negativas', (f: Record<string, unknown>) => ({ ...f, moedas: { pc: -1, pp: 0, pe: 0, po: 0, pl: 0 } }), 'moedas'],
    ['classe que não está entre as cópias', (f: Record<string, unknown>) => ({ ...f, classes: [{ entradaId: 'mago', nivel: 1 }] }), 'não está entre as cópias'],
    ['nível acima de 20', (f: Record<string, unknown>) => ({ ...f, classes: [{ entradaId: 'guerreiro', nivel: 21 }] }), 'número inválido'],
    ['atributo fora do limite', (f: Record<string, unknown>) => ({ ...f, atributos: { ...(f.atributos as object), for: 31 } }), 'FOR'],
    ['proficiência estranha', (f: Record<string, unknown>) => ({ ...f, proficiencias: { atletismo: 3 } }), 'proficiência'],
    ['tipo desconhecido', (f: Record<string, unknown>) => ({ ...f, tipo: 'dragao' }), 'tipo é desconhecido'],
  ])('recusa %s', (_nome, estragar, trecho) => {
    const objeto = fichasParaObjeto(exemplo());
    const estragado = { ...objeto, fichas: [estragar(objeto.fichas[0] as unknown as Record<string, unknown>)] };
    const lido = desserializarFichas(comoTexto(estragado));
    expect(lido).toMatchObject({ ok: false, erro: expect.stringContaining(trecho) });
  });

  it('recusa versão desconhecida e texto que não é JSON', () => {
    expect(desserializarFichas(comoTexto({ ...fichasParaObjeto(exemplo()), versao: 10 })).ok).toBe(false);
    expect(desserializarFichas('lixo').ok).toBe(false);
  });
});

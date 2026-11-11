import { describe, expect, it } from 'vitest';
import { aplicarAcaoCompendio, criarCompendioVazio } from './compendio';
import { criarEntrada, TIPOS_ENTRADA, type Entrada, type EntradaDe } from './entradas';
import { ErroDeFormato } from './persistencia';
import {
  desserializarCompendio,
  lerCompendioDoArquivo,
  lerEntrada,
  lerEntradas,
  serializarCompendio,
} from './persistenciaCompendio';
import { serializarArquivoCompleto } from './persistenciaCampanha';
import { criarCampanhaInicial } from './campanha';
import { GRUPO_SEM_POSICAO } from './grupo';
import { criarMapaVazio } from './mapa';
import { desserializarMapa } from './persistencia';

const espadaCompleta: EntradaDe<'item'> = {
  ...criarEntrada('item', 'srd-5.1/item/longsword'),
  nome: 'Longsword',
  descricao: 'Uma espada longa.\nDuas linhas.',
  etiquetas: ['arma', 'marcial'],
  origem: { tipo: 'pacote', pacote: 'srd-5.1' },
  visibilidade: { tipo: 'todos' },
  efeitos: [{ id: 'e1', alvo: 'ataque', operacao: 'somar', valor: '1', quando: 'equipado' }],
  acoes: [
    {
      id: 'a1',
      rotulo: 'Atacar',
      passos: [
        { tipo: 'rolar', formula: '1d20 + mod(FOR)', rotulo: 'Ataque' },
        { tipo: 'consumir', quantidade: 1 },
        { tipo: 'curar', formula: '2d4+2' },
      ],
    },
  ],
  dados: {
    categoria: 'arma',
    peso: 3,
    custo: { quantidade: 15, moeda: 'po' },
    raridade: 'comum',
    requerSintonia: false,
    empilhavel: false,
    arma: {
      dominio: 'marcial',
      alcanceTipo: 'corpo-a-corpo',
      dano: '1d8',
      tipoDano: 'cortante',
      danoVersatil: '1d10',
      alcance: { normal: 5, longo: null },
      propriedades: ['versátil'],
    },
    armadura: null,
  },
};

const malhaCompleta: EntradaDe<'item'> = {
  ...criarEntrada('item', 'malha'),
  nome: 'Cota de Malha',
  dados: {
    ...criarEntrada('item', 'x').dados,
    categoria: 'armadura',
    armadura: {
      peso: 'pesada',
      caBase: 16,
      usaDestreza: false,
      destrezaMaxima: null,
      forcaMinima: 13,
      desvantagemFurtividade: true,
    },
  },
};

const goblin: EntradaDe<'monstro'> = {
  ...criarEntrada('monstro', 'goblin'),
  nome: 'Goblin',
  dados: {
    ...criarEntrada('monstro', 'x').dados,
    atributos: { for: 8, des: 14, con: 10, int: 10, sab: 8, car: 8 },
    salvaguardas: { des: 4 },
    pericias: { furtividade: 6 },
    nivelDesafio: 0.25,
    experiencia: 50,
    tracos: [{ nome: 'Fuga Ágil', descricao: 'Pode recuar ou se esconder.' }],
    acoesDeCombate: [{ nome: 'Cimitarra', descricao: '+4 para acertar.' }],
  },
};

const ida = (entrada: Entrada) => lerEntrada(JSON.parse(JSON.stringify(entrada)), 'teste');

function erroDe(dado: unknown): string {
  try {
    lerEntrada(dado, 'A entrada');
  } catch (erro) {
    if (erro instanceof ErroDeFormato) {
      return erro.message;
    }
    throw erro;
  }
  throw new Error('Era esperado um erro de leitura.');
}

const comDados = (entrada: Entrada, dados: Record<string, unknown>) =>
  JSON.parse(JSON.stringify({ ...entrada, dados: { ...entrada.dados, ...dados } }));

describe('ler e salvar entradas', () => {
  it.each(TIPOS_ENTRADA)('um(a) %s recém-criado(a) volta idêntico(a)', (tipo) => {
    const entrada = criarEntrada(tipo, `id-${tipo}`);
    expect(ida(entrada)).toEqual(entrada);
  });

  it.each([
    ['uma arma completa', espadaCompleta],
    ['uma armadura sem limite de Destreza', malhaCompleta],
    ['um monstro com desafio fracionário', goblin],
    [
      'um kit completo',
      {
        ...criarEntrada('kit', 'kit-x'),
        nome: 'Kit do explorador',
        dados: {
          itens: [{ entradaId: 'corda', quantidade: 2 }],
          moedas: { pc: 0, pp: 0, pe: 0, po: 15, pl: 0 },
          classes: ['guerreiro'],
          extraPorAntecedente: ['acolito'],
          extraPorPericia: ['medicina'],
        },
      } as Entrada,
    ],
  ])('%s volta idêntica', (_, entrada) => {
    expect(ida(entrada)).toEqual(entrada);
  });

  it('o compêndio inteiro volta idêntico', () => {
    const estado = aplicarAcaoCompendio(criarCompendioVazio(), {
      tipo: 'ImportarEntradas',
      entradas: [espadaCompleta, malhaCompleta, goblin],
    });
    expect(desserializarCompendio(serializarCompendio(estado))).toEqual({ ok: true, estado });
  });
});

describe('kits inválidos', () => {
  const kit = () => JSON.parse(JSON.stringify(criarEntrada('kit', 'k')));
  it.each([
    ['quantidade zero', (k: Record<string, any>) => ({ ...k, dados: { ...k.dados, itens: [{ entradaId: 'corda', quantidade: 0 }] } })],
    ['item sem id', (k: Record<string, any>) => ({ ...k, dados: { ...k.dados, itens: [{ entradaId: '', quantidade: 1 }] } })],
    ['moedas negativas', (k: Record<string, any>) => ({ ...k, dados: { ...k.dados, moedas: { ...k.dados.moedas, po: -1 } } })],
  ])('recusa %s', (_, estragar) => {
    expect(() => lerEntrada(estragar(kit()), 'O kit')).toThrow();
  });
});

describe('entradas inválidas', () => {
  const valida = () => JSON.parse(JSON.stringify(espadaCompleta));

  it.each([
    ['tipo desconhecido', { tipo: 'veiculo' }, 'tipo'],
    ['id vazio', { id: '' }, 'id'],
    ['nome que não é texto', { nome: 7 }, 'nome'],
    ['etiquetas fora de lista', { etiquetas: 'arma' }, 'etiquetas'],
    ['origem desconhecida', { origem: { tipo: 'internet' } }, 'origem'],
    ['pacote sem nome', { origem: { tipo: 'pacote', pacote: '' } }, 'pacote'],
    ['sem dados', { dados: undefined }, 'dados'],
  ])('recusa %s', (_, mudanca, trecho) => {
    expect(erroDe({ ...valida(), ...mudanca })).toContain(trecho);
  });

  it('recusa visibilidade desconhecida, para nunca expor um segredo', () => {
    expect(erroDe({ ...valida(), visibilidade: { tipo: 'quase-todos' } })).toContain('visibilidade');
  });

  it.each([
    ['operação desconhecida', { operacao: 'multiplicar' }],
    ['condição desconhecida', { quando: 'às vezes' }],
    ['valor vazio', { valor: '' }],
  ])('recusa efeito com %s', (_, mudanca) => {
    const dado = valida();
    dado.efeitos[0] = { ...dado.efeitos[0], ...mudanca };
    expect(() => lerEntrada(dado, 'A entrada')).toThrow(ErroDeFormato);
  });

  it.each([
    ['passo desconhecido', { tipo: 'explodir' }],
    ['consumir zero', { tipo: 'consumir', quantidade: 0 }],
    ['curar sem fórmula', { tipo: 'curar', formula: '' }],
  ])('recusa ação com %s', (_, passo) => {
    const dado = valida();
    dado.acoes[0].passos = [passo];
    expect(() => lerEntrada(dado, 'A entrada')).toThrow(ErroDeFormato);
  });

  it.each([
    ['categoria desconhecida', { categoria: 'veiculo' }],
    ['peso negativo', { peso: -1 }],
    ['moeda desconhecida', { custo: { quantidade: 1, moeda: 'dólar' } }],
    ['raridade desconhecida', { raridade: 'épica' }],
    ['arma de domínio desconhecido', { arma: { ...espadaCompleta.dados.arma, dominio: 'exótica' } }],
  ])('recusa item com %s', (_, dados) => {
    expect(() => lerEntrada(comDados(espadaCompleta, dados), 'A entrada')).toThrow(ErroDeFormato);
  });

  it('recusa magia acima do 9º nível', () => {
    const magia = criarEntrada('magia', 'm');
    expect(erroDe(comDados(magia, { nivel: 10 }))).toContain('nivel');
  });

  it('recusa escola de magia desconhecida', () => {
    expect(erroDe(comDados(criarEntrada('magia', 'm'), { escola: 'cronomancia' }))).toContain('escola');
  });

  it('recusa monstro sem os seis atributos', () => {
    const { car: _ignorado, ...cinco } = goblin.dados.atributos;
    expect(erroDe(comDados(goblin, { atributos: cinco }))).toContain('seis atributos');
  });

  it('recusa atributo desconhecido', () => {
    expect(erroDe(comDados(goblin, { salvaguardas: { sorte: 2 } }))).toContain('atributo desconhecido');
  });

  it('recusa classe com salvaguarda que não é atributo', () => {
    const classe = criarEntrada('classe', 'c');
    expect(erroDe(comDados(classe, { salvaguardas: ['forca'] }))).toContain('atributo');
  });

  it('lê a escolha de perícias e recusa níveis de aumento repetidos ou fora de 1 a 20', () => {
    const classe = criarEntrada('classe', 'c');
    const comEscolha = comDados(classe, { escolhaPericias: { quantidade: 2, opcoes: ['Atletismo', 'Furtividade'] } });
    expect(desserializarCompendio(serializarCompendio({ entradas: { c: comEscolha } }))).toMatchObject({ ok: true });
    expect(erroDe(comDados(classe, { escolhaPericias: { quantidade: 0, opcoes: [] } }))).toContain('quantidade');
    expect(erroDe(comDados(classe, { niveisDeAumento: [4, 4] }))).toContain('repetidos');
    expect(erroDe(comDados(classe, { niveisDeAumento: [21] }))).toContain('nível de 1 a 20');
  });

  it('recusa habilidade de classe acima do nível 20', () => {
    const classe = criarEntrada('classe', 'c');
    expect(erroDe(comDados(classe, { habilidades: [{ nivel: 21, entradaId: 'h' }] }))).toContain('nivel');
  });
});

describe('listas e arquivos de compêndio', () => {
  it('recusa ids repetidos', () => {
    const lista = [criarEntrada('item', 'a'), criarEntrada('magia', 'a')];
    expect(() => lerEntradas(lista, 'O pacote')).toThrow('repetida');
  });

  it('diz qual entrada da lista tem problema', () => {
    const lista = [criarEntrada('item', 'a'), { ...criarEntrada('item', 'b'), tipo: 'veiculo' }];
    expect(() => lerEntradas(lista, 'O pacote')).toThrow('nº 2');
  });

  it('o compêndio vai e volta dentro do arquivo completo', () => {
    const estado = aplicarAcaoCompendio(criarCompendioVazio(), {
      tipo: 'ImportarEntradas',
      entradas: [espadaCompleta, goblin],
    });
    const texto = serializarArquivoCompleto(
      criarMapaVazio(),
      GRUPO_SEM_POSICAO,
      { campanha: criarCampanhaInicial(), registro: [] },
      estado,
    );
    expect(lerCompendioDoArquivo(texto)).toEqual({ ok: true, estado });
    expect(desserializarMapa(texto).ok).toBe(true);
  });

  it('um arquivo sem compêndio devolve estado vazio de propósito', () => {
    const texto = serializarArquivoCompleto(criarMapaVazio(), GRUPO_SEM_POSICAO, {
      campanha: criarCampanhaInicial(),
      registro: [],
    });
    expect(lerCompendioDoArquivo(texto)).toEqual({ ok: true, estado: null });
  });

  it('um compêndio inválido no arquivo devolve o motivo', () => {
    const texto = JSON.stringify({ compendio: { entradas: [{ tipo: 'veiculo' }] } });
    expect(lerCompendioDoArquivo(texto)).toMatchObject({ ok: false });
  });

  it('converte monstros da versão 1, no salvamento e no arquivo', () => {
    const monstro = criarEntrada('monstro', 'goblin');
    const {
      notaArmadura: _nota,
      vulnerabilidades: _v,
      resistencias: _r,
      imunidades: _i,
      imunidadesCondicao: _c,
      ...dadosAntigos
    } = monstro.dados;
    const antigo = { ...monstro, dados: dadosAntigos };
    const esperado = { ok: true, estado: { entradas: { goblin: monstro } } };

    expect(desserializarCompendio(JSON.stringify({ versao: 1, entradas: [antigo] }))).toEqual(esperado);
    // Arquivos antigos guardavam o compêndio sem número de versão.
    expect(lerCompendioDoArquivo(JSON.stringify({ compendio: { entradas: [antigo] } }))).toEqual(esperado);
    // Na versão atual, os campos novos são obrigatórios.
    expect(desserializarCompendio(JSON.stringify({ versao: 3, entradas: [antigo] }))).toMatchObject({ ok: false });
  });

  it('classes das versões 1 e 2 ganham uma tabela vazia', () => {
    const classe = criarEntrada('classe', 'guerreiro');
    const { tabela: _tabela, ...dadosAntigos } = classe.dados;
    const antiga = { ...classe, dados: dadosAntigos };
    const esperado = { ok: true, estado: { entradas: { guerreiro: classe } } };
    expect(desserializarCompendio(JSON.stringify({ versao: 1, entradas: [antiga] }))).toEqual(esperado);
    expect(desserializarCompendio(JSON.stringify({ versao: 2, entradas: [antiga] }))).toEqual(esperado);
  });

  it('classes da versão 5 ganham a escolha de perícias vazia e os níveis de aumento do 5e', () => {
    const classe = criarEntrada('classe', 'guerreiro');
    const { escolhaPericias: _e, niveisDeAumento: _n, ...dadosAntigos } = classe.dados;
    const lido = desserializarCompendio(JSON.stringify({ versao: 5, entradas: [{ ...classe, dados: dadosAntigos }] }));
    expect(lido.ok && lido.estado.entradas.guerreiro.dados).toMatchObject({ escolhaPericias: null, niveisDeAumento: [4, 8, 12, 16, 19] });
  });

  it('itens das versões 1 a 3 passam de libras para quilos', () => {
    const lanterna = { ...criarEntrada('item', 'lanterna'), dados: { ...criarEntrada('item', 'x').dados, peso: 2 } };
    const lido = desserializarCompendio(JSON.stringify({ versao: 3, entradas: [lanterna] }));
    expect(lido.ok && lido.estado.entradas.lanterna.dados).toMatchObject({ peso: 1 });
    const atual = desserializarCompendio(JSON.stringify({ versao: 4, entradas: [lanterna] }));
    expect(atual.ok && atual.estado.entradas.lanterna.dados).toMatchObject({ peso: 2 });
  });

  it('entradas das versões 1 a 4 passam para o sistema métrico', () => {
    const especie = { ...criarEntrada('especie', 'anao'), dados: { ...criarEntrada('especie', 'x').dados, deslocamento: 25 } };
    const arco = {
      ...criarEntrada('item', 'arco'),
      nome: 'Rope, hempen (50 feet)',
      descricao: 'Range 150/600 ft.',
      dados: {
        ...criarEntrada('item', 'x').dados,
        arma: { dominio: 'marcial', alcanceTipo: 'distancia', dano: '1d8', tipoDano: '', danoVersatil: null, alcance: { normal: 150, longo: 600 }, propriedades: [] },
      },
    };
    const goblin = {
      ...criarEntrada('monstro', 'goblin'),
      dados: { ...criarEntrada('monstro', 'x').dados, deslocamento: '30 ft., climb 30 ft.', sentidos: 'darkvision 60 ft.' },
    };
    const monge = {
      ...criarEntrada('classe', 'monge'),
      dados: {
        ...criarEntrada('classe', 'x').dados,
        tabela: [
          { id: 'movimento_sem_armadura', nome: 'Movimento sem armadura (pés)', valores: ['', ...Array(19).fill('10')] },
          { id: 'pontos_ki', nome: 'Pontos de ki', valores: Array(20).fill('2') },
        ],
      },
    };
    const lido = desserializarCompendio(JSON.stringify({ versao: 4, entradas: [especie, arco, goblin, monge] }));
    if (!lido.ok) {
      throw new Error(lido.erro);
    }
    const e = lido.estado.entradas;
    expect(e.anao.dados).toMatchObject({ deslocamento: 7.5 });
    expect(e.arco).toMatchObject({ nome: 'Rope, hempen (15 m)', descricao: 'Range 45/180 m' });
    expect(e.arco.tipo === 'item' && e.arco.dados.arma?.alcance).toEqual({ normal: 45, longo: 180 });
    expect(e.goblin.dados).toMatchObject({ deslocamento: '9 m, climb 9 m', sentidos: 'darkvision 18 m' });
    const tabela = e.monge.tipo === 'classe' ? e.monge.dados.tabela : [];
    expect(tabela[0]).toMatchObject({ nome: 'Movimento sem armadura (m)', valores: ['', ...Array(19).fill('3')] });
    expect(tabela[1].valores[0]).toBe('2');
  });

  it('confere a tabela da classe', () => {
    const classe = criarEntrada('classe', 'guerreiro');
    const coluna = { id: 'surto_de_acao', nome: 'Surto de ação', valores: Array(20).fill('1') };
    const comTabela = (tabela: unknown) => ({ ...classe, dados: { ...classe.dados, tabela } });
    expect(lerEntrada(comTabela([coluna]), 'x')).toEqual(comTabela([coluna]));
    expect(() => lerEntrada(comTabela([{ ...coluna, valores: ['1'] }]), 'x')).toThrow('do 1 ao 20');
    expect(() => lerEntrada(comTabela([{ ...coluna, id: 'Surto' }]), 'x')).toThrow('letras minúsculas');
    expect(() => lerEntrada(comTabela([coluna, coluna]), 'x')).toThrow('repetida');
  });

  it('recusa versão desconhecida e texto que não é JSON', () => {
    expect(desserializarCompendio(JSON.stringify({ versao: 9, entradas: [] }))).toMatchObject({ ok: false });
    expect(desserializarCompendio('lixo')).toMatchObject({ ok: false });
  });
});

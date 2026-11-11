import { describe, expect, it } from 'vitest';
import {
  criarLojaNotificacoes,
  desserializarNotificacoes,
  LIMITE_NOTIFICACOES,
  naoLidas,
  notificacoesVisiveis,
  serializarNotificacoes,
} from './notificacoes';
import { paraJogadores, SO_MESTRE, VISIVEL_A_TODOS } from './visibilidade';

describe('notificações', () => {
  const montar = () => {
    const loja = criarLojaNotificacoes(undefined, () => 1000);
    loja.notificar({ icone: '🗳️', texto: 'Lyra lidera', visibilidade: VISIVEL_A_TODOS });
    loja.notificar({ icone: '⚠️', texto: 'Thorin tentou te furtar!', visibilidade: paraJogadores(['j-bia']) });
    loja.notificar({ icone: '⚔️', texto: 'Encontro!', visibilidade: SO_MESTRE });
    return loja;
  };

  it('cada um vê só as próprias; o mestre vê todas', () => {
    const { lista } = montar().obterEstado();
    expect(lista.map((n) => n.id)).toEqual([3, 2, 1]);
    expect(notificacoesVisiveis(montar().obterEstado(), 'j-bia').map((n) => n.texto)).toEqual(['Thorin tentou te furtar!', 'Lyra lidera']);
    expect(notificacoesVisiveis(montar().obterEstado(), 'j-ana').map((n) => n.texto)).toEqual(['Lyra lidera']);
    expect(notificacoesVisiveis(montar().obterEstado(), 'mestre')).toHaveLength(3);
  });

  it('as não lidas contam por participante', () => {
    const loja = montar();
    expect(naoLidas(loja.obterEstado(), 'j-bia')).toBe(2);
    loja.marcarLidas('j-bia');
    expect(naoLidas(loja.obterEstado(), 'j-bia')).toBe(0);
    expect(naoLidas(loja.obterEstado(), 'mestre')).toBe(3);
    loja.notificar({ icone: '🗳️', texto: 'Nova eleição', visibilidade: VISIVEL_A_TODOS });
    expect(naoLidas(loja.obterEstado(), 'j-bia')).toBe(1);
  });

  it('guarda só as últimas e volta igual do arquivo', () => {
    const loja = criarLojaNotificacoes();
    for (let i = 0; i < LIMITE_NOTIFICACOES + 5; i++) {
      loja.notificar({ icone: '·', texto: `n${i}`, visibilidade: VISIVEL_A_TODOS });
    }
    expect(loja.obterEstado().lista).toHaveLength(LIMITE_NOTIFICACOES);
    loja.marcarLidas('j-ana');
    const lido = desserializarNotificacoes(serializarNotificacoes(loja.obterEstado()));
    expect(lido).toEqual({ ok: true, estado: loja.obterEstado() });
    expect(desserializarNotificacoes('{"versao":9}').ok).toBe(false);
  });
});

import { hexParaMundo, mundoParaHex, type CoordHex, type PontoMundo } from '../core/hex';
import type { LojaGrupo } from '../core/grupo';
import type { LojaMapa } from '../core/loja';
import { hexEm, temAnotacoes } from '../core/mapa';
import type { Manifesto } from '../core/manifesto';
import { nivelDeVisao } from '../core/visibilidade';
import type { CenaMapa } from '../render/createMapScene';

export type Ferramenta =
  | { readonly tipo: 'nenhuma' }
  | { readonly tipo: 'colocar'; readonly assetId: string }
  | { readonly tipo: 'apagar' }
  | { readonly tipo: 'posicionar' }
  | { readonly tipo: 'revelar' }
  | { readonly tipo: 'ocultar' };

export const SEM_FERRAMENTA: Ferramenta = { tipo: 'nenhuma' };

type CenaControlada = Pick<
  CenaMapa,
  | 'mostrarPrevia'
  | 'mostrarPreviaDecoracao'
  | 'limparPrevia'
  | 'decoracaoEm'
  | 'moverDecoracaoVisual'
  | 'sincronizarDecoracoes'
>;

interface Movimento {
  readonly decoracaoId: string;
  readonly assetId: string;
  readonly origem: CoordHex;
  /** Distância entre o mouse e o centro da decoração, para ela não "pular" ao ser agarrada. */
  readonly agarre: PontoMundo;
  posicao: PontoMundo | null;
}

/** Traduz o que o mouse faz no mapa em ações, de acordo com a ferramenta atual. */
export function criarControlador(
  loja: LojaMapa,
  lojaGrupo: LojaGrupo,
  manifesto: Manifesto,
  obterCena: () => CenaControlada | null,
  aoSelecionarHex: (coord: CoordHex) => void,
  aoAvisar: (texto: string) => void,
) {
  const assets = new Map(manifesto.assets.map((asset) => [asset.id, asset]));
  let ferramenta: Ferramenta = SEM_FERRAMENTA;
  let movimento: Movimento | null = null;
  let apagandoDecoracoes = false;
  let hexesAnotadosApagados = 0;
  // No modo jogador, nada que venha do mouse pode alterar o mapa.
  let somenteLeitura = false;
  // Com o mapa travado, o mestre continua revelando, ocultando e posicionando o grupo,
  // mas não pinta, não apaga e não arrasta decorações sem querer.
  let travado = false;
  // No modo jogador: até onde aquele jogador enxerga, para só abrir hexes ao alcance dele.
  let alcanceDaVisao = 1;
  const ehEdicaoDoMapa = (f: Ferramenta) => f.tipo === 'colocar' || f.tipo === 'apagar';

  const removerHex = (coord: CoordHex) => {
    const hex = hexEm(loja.obterEstado(), coord);
    if (hex && temAnotacoes(hex)) {
      hexesAnotadosApagados += 1;
    }
    loja.despachar({ tipo: 'RemoverTile', coord });
  };

  const aplicarRevelacao = (tipo: 'revelar' | 'ocultar', coord: CoordHex) => {
    loja.despachar({ tipo: tipo === 'revelar' ? 'RevelarHex' : 'OcultarHex', coord });
  };

  const avisarHexesApagados = () => {
    if (hexesAnotadosApagados > 0) {
      aoAvisar(
        hexesAnotadosApagados === 1
          ? 'Um hex com anotações foi apagado. Ctrl+Z traz de volta.'
          : `${hexesAnotadosApagados} hexes com anotações foram apagados. Ctrl+Z traz de volta.`,
      );
      hexesAnotadosApagados = 0;
    }
  };

  const ehTile = (assetId: string) => assets.get(assetId)?.tipo === 'tile';
  const ehSobreposicao = (assetId: string) => assets.get(assetId)?.tipo === 'sobreposicao';

  const temSobreposicao = (coord: CoordHex, assetId: string) =>
    hexEm(loja.obterEstado(), coord)?.decoracoes.some((d) => d.assetId === assetId) ?? false;

  /** Rios encaixam no centro do hex; as demais decorações ficam onde foram soltas. */
  const posicaoFinal = (assetId: string, ponto: PontoMundo): PontoMundo =>
    ehSobreposicao(assetId) ? hexParaMundo(mundoParaHex(ponto)) : ponto;

  const deslocamentoEm = (coord: CoordHex, posicao: PontoMundo): PontoMundo => {
    const centro = hexParaMundo(coord);
    return { x: posicao.x - centro.x, y: posicao.y - centro.y };
  };

  const colocarAsset = (assetId: string, ponto: PontoMundo) => {
    if (somenteLeitura || travado) {
      return;
    }
    const posicao = posicaoFinal(assetId, ponto);
    const coord = mundoParaHex(posicao);
    if (ehTile(assetId)) {
      loja.despachar({ tipo: 'ColocarTile', coord, terreno: assetId });
      return;
    }
    if (ehSobreposicao(assetId) && temSobreposicao(coord, assetId)) {
      return;
    }
    loja.despachar({
      tipo: 'ColocarDecoracao',
      coord,
      decoracao: {
        // O id vai dentro da ação para que repetir as ações produza sempre o mesmo mapa.
        id: crypto.randomUUID(),
        assetId,
        deslocamento: deslocamentoEm(coord, posicao),
      },
    });
  };

  const mostrarPrevia = (assetId: string, ponto: PontoMundo) => {
    if (somenteLeitura) {
      return;
    }
    const cena = obterCena();
    const posicao = posicaoFinal(assetId, ponto);
    const coord = mundoParaHex(posicao);
    if (ehTile(assetId)) {
      cena?.mostrarPrevia(assetId, coord);
    } else if (hexEm(loja.obterEstado(), coord)) {
      cena?.mostrarPreviaDecoracao(assetId, posicao);
    } else {
      // Decorações precisam de um hex com terreno.
      cena?.limparPrevia();
    }
  };

  const apagarDecoracaoEm = (ponto: PontoMundo): boolean => {
    const encontrada = obterCena()?.decoracaoEm(ponto);
    if (encontrada) {
      loja.despachar({
        tipo: 'RemoverDecoracao',
        coord: encontrada.coord,
        decoracaoId: encontrada.decoracaoId,
      });
    }
    return Boolean(encontrada);
  };

  const iniciarMovimento = (ponto: PontoMundo) => {
    const encontrada = obterCena()?.decoracaoEm(ponto);
    if (encontrada) {
      movimento = {
        decoracaoId: encontrada.decoracaoId,
        assetId: encontrada.assetId,
        origem: encontrada.coord,
        agarre: { x: encontrada.posicao.x - ponto.x, y: encontrada.posicao.y - ponto.y },
        posicao: null,
      };
    }
  };

  const concluirMovimento = ({ assetId, decoracaoId, origem, posicao }: Movimento) => {
    if (posicao) {
      const destino = mundoParaHex(posicao);
      const mesmoHex = destino.q === origem.q && destino.r === origem.r;
      if (mesmoHex || !ehSobreposicao(assetId) || !temSobreposicao(destino, assetId)) {
        loja.despachar({
          tipo: 'MoverDecoracao',
          origem,
          decoracaoId,
          destino,
          deslocamento: deslocamentoEm(destino, posicao),
        });
      }
    }
    // Se o movimento foi recusado, a decoração volta para o lugar.
    obterCena()?.sincronizarDecoracoes();
  };

  return {
    definirFerramenta(nova: Ferramenta) {
      ferramenta = travado && ehEdicaoDoMapa(nova) ? SEM_FERRAMENTA : nova;
      obterCena()?.limparPrevia();
    },

    definirAlcanceDaVisao(alcance: number) {
      alcanceDaVisao = alcance;
    },

    /** Ao travar, solta as ferramentas que mudam o mapa e para de arrastar decorações. */
    definirTravado(ativo: boolean) {
      travado = ativo;
      if (ativo) {
        if (ehEdicaoDoMapa(ferramenta)) {
          ferramenta = SEM_FERRAMENTA;
        }
        if (movimento) {
          movimento = null;
          obterCena()?.sincronizarDecoracoes();
        }
        obterCena()?.limparPrevia();
      }
    },

    /** Ao ligar, solta a ferramenta atual e passa a ignorar edições. */
    definirSomenteLeitura(ativo: boolean) {
      somenteLeitura = ativo;
      if (ativo) {
        ferramenta = SEM_FERRAMENTA;
        movimento = null;
        obterCena()?.limparPrevia();
      }
    },

    colocarAsset,
    mostrarPrevia,

    aoMoverPonteiro(ponto: PontoMundo | null) {
      if (ponto && ferramenta.tipo === 'colocar' && !travado) {
        mostrarPrevia(ferramenta.assetId, ponto);
      } else {
        obterCena()?.limparPrevia();
      }
    },

    aoIniciarTraco(ponto: PontoMundo) {
      if (somenteLeitura) {
        return;
      }
      const coord = mundoParaHex(ponto);
      switch (ferramenta.tipo) {
        case 'nenhuma':
          if (!travado) {
            iniciarMovimento(ponto);
          }
          break;
        case 'apagar':
          loja.iniciarTraco();
          apagandoDecoracoes = apagarDecoracaoEm(ponto);
          if (!apagandoDecoracoes) {
            removerHex(coord);
          }
          break;
        case 'colocar':
          if (ehTile(ferramenta.assetId)) {
            loja.iniciarTraco();
          }
          colocarAsset(ferramenta.assetId, ponto);
          break;
        case 'posicionar':
          // O grupo só pode ficar em um hex com terreno.
          if (hexEm(loja.obterEstado(), coord)) {
            lojaGrupo.despachar({ tipo: 'PosicionarGrupo', coord });
          }
          break;
        case 'revelar':
        case 'ocultar':
          loja.iniciarTraco();
          aplicarRevelacao(ferramenta.tipo, coord);
          break;
      }
    },

    aoContinuarTraco(coord: CoordHex) {
      if (somenteLeitura) {
        return;
      }
      if (ferramenta.tipo === 'colocar' && ehTile(ferramenta.assetId)) {
        loja.despachar({ tipo: 'ColocarTile', coord, terreno: ferramenta.assetId });
      } else if (ferramenta.tipo === 'apagar' && !apagandoDecoracoes) {
        removerHex(coord);
      } else if (ferramenta.tipo === 'revelar' || ferramenta.tipo === 'ocultar') {
        aplicarRevelacao(ferramenta.tipo, coord);
      }
    },

    aoMoverDuranteTraco(ponto: PontoMundo) {
      if (somenteLeitura) {
        return;
      }
      if (movimento) {
        movimento.posicao = posicaoFinal(movimento.assetId, {
          x: ponto.x + movimento.agarre.x,
          y: ponto.y + movimento.agarre.y,
        });
        obterCena()?.moverDecoracaoVisual(movimento.decoracaoId, movimento.posicao);
      } else if (ferramenta.tipo === 'apagar' && apagandoDecoracoes) {
        apagarDecoracaoEm(ponto);
      }
    },

    aoTerminarTraco() {
      if (movimento) {
        concluirMovimento(movimento);
        movimento = null;
      }
      apagandoDecoracoes = false;
      loja.terminarTraco();
      avisarHexesApagados();
    },

    aoClicar(ponto: PontoMundo) {
      const coord = mundoParaHex(ponto);
      if (somenteLeitura) {
        // O jogador só consegue abrir o que está ao alcance da visão dele.
        const hex = hexEm(loja.obterEstado(), coord);
        const { posicao } = lojaGrupo.obterEstado();
        if (hex && nivelDeVisao(hex, posicao ? [posicao] : [], alcanceDaVisao) !== 'oculto') {
          aoSelecionarHex(coord);
        }
      } else if (ferramenta.tipo === 'nenhuma') {
        aoSelecionarHex(coord);
      }
    },
  };
}

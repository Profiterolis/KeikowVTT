import { useEffect, useState } from 'react';
import {
  escalaPelaMedida,
  METROS_DO_QUADRADO,
  pixelsEmMetros,
  pixelsPorQuadrado,
  type Instancia,
  type LojaInstancias,
  type MudancasNaInstancia,
} from '../core/instancias';
import type { EstadoMapa } from '../core/mapa';
import { CampoImagem } from './CampoImagem';
import { useBancoDeImagens } from './contextoImagens';
import { textoDoHex } from './PainelInstancias';

/**
 * Número com vírgula, sem casas demais e sem ponto de milhar: "1.400" num campo seria lido
 * como 1,4 ao confirmar.
 */
function numero(valor: number, casas = 2): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: casas, useGrouping: false });
}

/** Lê "1,5" ou "1.5". */
function lerNumero(texto: string): number {
  return Number(texto.trim().replace(',', '.'));
}

/**
 * Um campo de número que só vale ao sair dele (ou com Enter): enquanto se digita, um valor
 * pela metade (vazio, "1," ...) não vira uma mudança, nem enche o desfazer.
 */
function CampoNumero({
  valor,
  aoConfirmar,
  rotulo,
  sufixo,
}: {
  readonly valor: number;
  readonly aoConfirmar: (valor: number) => void;
  readonly rotulo: string;
  readonly sufixo?: string;
}) {
  const [rascunho, setRascunho] = useState<string | null>(null);
  const confirmar = () => {
    if (rascunho !== null) {
      const lido = lerNumero(rascunho);
      if (Number.isFinite(lido) && lido > 0) {
        aoConfirmar(lido);
      }
      setRascunho(null);
    }
  };
  return (
    <label className="painel-instancia-numero">
      <span>{rotulo}</span>
      <input
        type="text"
        inputMode="decimal"
        value={rascunho ?? numero(valor)}
        onChange={(evento) => setRascunho(evento.target.value)}
        onBlur={confirmar}
        onKeyDown={(evento) => {
          if (evento.key === 'Enter') {
            confirmar();
          }
        }}
      />
      {sufixo && <span>{sufixo}</span>}
    </label>
  );
}

function tamanhoDaImagem(endereco: string): Promise<{ largura: number; altura: number } | null> {
  return new Promise((resolver) => {
    const imagem = new Image();
    imagem.onload = () => resolver({ largura: imagem.naturalWidth, altura: imagem.naturalHeight });
    imagem.onerror = () => resolver(null);
    imagem.src = endereco;
  });
}

/**
 * A configuração da instância aberta, só do mestre: nome, descrição, hex, imagem de fundo,
 * tamanho e escala (com a régua para medir na imagem), duplicar e apagar.
 */
export function PainelInstancia({
  instancia,
  lojaInstancias,
  mapa,
  jogadoresDentro,
  medindo,
  medida,
  aoAlternarMedicao,
  aoEsquecerMedida,
  aoAbrir,
  aoApagada,
  aoFechar,
}: {
  readonly instancia: Instancia;
  readonly lojaInstancias: LojaInstancias;
  readonly mapa: EstadoMapa;
  /** Quantos jogadores estão nesta instância agora, para o aviso ao apagar. */
  readonly jogadoresDentro: number;
  readonly medindo: boolean;
  /** A última distância medida com a régua, em pixels. */
  readonly medida: number | null;
  readonly aoAlternarMedicao: () => void;
  readonly aoEsquecerMedida: () => void;
  readonly aoAbrir: (instanciaId: string) => void;
  readonly aoApagada: () => void;
  readonly aoFechar: () => void;
}) {
  const banco = useBancoDeImagens();
  const [metrosDaMedida, setMetrosDaMedida] = useState('1,5');
  const [hexDigitado, setHexDigitado] = useState({ q: instancia.hex?.q ?? 0, r: instancia.hex?.r ?? 0 });

  // Outra instância aberta: os campos do hex recomeçam com o dela.
  useEffect(() => {
    setHexDigitado({ q: instancia.hex?.q ?? 0, r: instancia.hex?.r ?? 0 });
  }, [instancia.id, instancia.hex?.q, instancia.hex?.r]);

  const editar = (mudancas: MudancasNaInstancia, grupo?: string) =>
    lojaInstancias.despachar({ tipo: 'EditarInstancia', instanciaId: instancia.id, mudancas }, grupo);

  const trocarImagem = async (id: string | undefined) => {
    if (!id) {
      editar({ imagem: null });
      return;
    }
    // A instância passa a ter o tamanho da imagem: 1 pixel do mapa = 1 pixel da imagem.
    const endereco = banco ? await banco.endereco(id) : null;
    const tamanho = endereco ? await tamanhoDaImagem(endereco) : null;
    editar(tamanho ? { imagem: id, ...tamanho } : { imagem: id });
  };

  const escalaMedida = medida !== null ? escalaPelaMedida(medida, lerNumero(metrosDaMedida)) : null;

  const apagar = () => {
    const nome = instancia.nome.trim() || 'Sem nome';
    const aviso =
      jogadoresDentro > 0
        ? `\n\n${jogadoresDentro} ${jogadoresDentro === 1 ? 'jogador está' : 'jogadores estão'} nela e ${jogadoresDentro === 1 ? 'volta' : 'voltam'} ao mapa-mundi.`
        : '';
    if (window.confirm(`Apagar a instância "${nome}"?${aviso}\n\nCtrl+Z desfaz.`)) {
      lojaInstancias.despachar({ tipo: 'ApagarInstancia', instanciaId: instancia.id });
      aoApagada();
    }
  };

  const duplicar = () => {
    const novoId = crypto.randomUUID();
    lojaInstancias.despachar({ tipo: 'DuplicarInstancia', instanciaId: instancia.id, novoId });
    aoAbrir(novoId);
  };

  return (
    <aside className="painel-hex painel-grupo painel-instancia" aria-label="Configurar a instância">
      <header>
        <div>
          <h2>⚙️ Configurar</h2>
          <p className="painel-coordenada">Só o mestre vê este painel</p>
        </div>
        <button type="button" aria-label="Fechar painel" onClick={aoFechar}>
          ×
        </button>
      </header>

      <label className="painel-campo">
        Nome
        <input
          type="text"
          value={instancia.nome}
          placeholder="Sem nome"
          onChange={(evento) => editar({ nome: evento.target.value }, `nome:${instancia.id}`)}
        />
      </label>
      <label className="painel-campo">
        Descrição (só o mestre)
        <textarea
          rows={3}
          value={instancia.descricao}
          placeholder="O que há aqui, o que pode acontecer"
          onChange={(evento) => editar({ descricao: evento.target.value }, `descricao:${instancia.id}`)}
        />
      </label>

      <section className="painel-grupo-secao">
        <h3>Onde fica</h3>
        <p className="tela-dica">{textoDoHex(instancia, mapa)}</p>
        <div className="painel-grupo-linha painel-instancia-hex">
          <label>
            q
            <input
              type="number"
              step={1}
              value={hexDigitado.q}
              onChange={(evento) => setHexDigitado({ ...hexDigitado, q: Math.trunc(Number(evento.target.value)) })}
            />
          </label>
          <label>
            r
            <input
              type="number"
              step={1}
              value={hexDigitado.r}
              onChange={(evento) => setHexDigitado({ ...hexDigitado, r: Math.trunc(Number(evento.target.value)) })}
            />
          </label>
          <button type="button" onClick={() => editar({ hex: { ...hexDigitado } })}>
            Ligar a este hex
          </button>
        </div>
        <button
          type="button"
          className="painel-adicionar"
          disabled={instancia.hex === null}
          onClick={() => editar({ hex: null })}
        >
          Tornar universal (serve a qualquer hex)
        </button>
      </section>

      <section className="painel-grupo-secao">
        <CampoImagem
          rotulo="Imagem de fundo"
          valor={instancia.imagem ?? undefined}
          nome={instancia.nome}
          aoMudar={(id) => void trocarImagem(id)}
          dicaSemImagem="Um mapa de batalha (PNG, JPG, WEBP). Sem imagem, a instância é um retângulo liso."
        />
        <div className="painel-grupo-linha">
          <CampoNumero
            rotulo="Largura"
            valor={instancia.largura}
            sufixo="px"
            aoConfirmar={(largura) => editar({ largura: Math.round(largura) })}
          />
          <CampoNumero
            rotulo="Altura"
            valor={instancia.altura}
            sufixo="px"
            aoConfirmar={(altura) => editar({ altura: Math.round(altura) })}
          />
        </div>
        <p className="tela-dica">
          No jogo: {numero(pixelsEmMetros(instancia, instancia.largura), 1)} m ×{' '}
          {numero(pixelsEmMetros(instancia, instancia.altura), 1)} m
        </p>
      </section>

      <section className="painel-grupo-secao">
        <h3>Escala</h3>
        <CampoNumero
          rotulo={`${numero(METROS_DO_QUADRADO)} m =`}
          valor={pixelsPorQuadrado(instancia)}
          sufixo="pixels"
          aoConfirmar={(pixels) => {
            const escala = escalaPelaMedida(pixels, METROS_DO_QUADRADO);
            if (escala !== null) {
              editar({ metrosPorPixel: escala });
            }
          }}
        />
        <p className="tela-dica">Num mapa com quadrados desenhados, é o tamanho de um quadrado em pixels.</p>
        <button type="button" aria-pressed={medindo} onClick={aoAlternarMedicao}>
          {medindo ? '📏 Medindo: clique em dois pontos (Esc cancela)' : '📏 Medir na imagem'}
        </button>
        {medida !== null && (
          <div className="painel-instancia-medida">
            <p>
              Medido: <strong>{numero(medida, 0)} pixels</strong>. Isso vale quantos metros no jogo?
            </p>
            <div className="painel-grupo-linha">
              <input
                type="text"
                inputMode="decimal"
                value={metrosDaMedida}
                aria-label="Metros da medida"
                onChange={(evento) => setMetrosDaMedida(evento.target.value)}
              />
              <span>m</span>
              <button
                type="button"
                disabled={escalaMedida === null}
                onClick={() => {
                  if (escalaMedida !== null) {
                    editar({ metrosPorPixel: escalaMedida });
                    aoEsquecerMedida();
                  }
                }}
              >
                Usar esta escala
              </button>
              <button type="button" onClick={aoEsquecerMedida}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="painel-grupo-secao painel-grupo-linha">
        <button type="button" onClick={duplicar}>
          Duplicar
        </button>
        <button type="button" className="painel-instancia-apagar" onClick={apagar}>
          Apagar
        </button>
      </section>
    </aside>
  );
}

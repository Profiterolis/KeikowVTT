import { useMemo, useState, type ReactNode } from 'react';
import { calcularFicha } from '../core/calculoDaFicha';
import type { Participante } from '../core/campanha';
import { buscarEntradas, type EstadoCompendio } from '../core/compendio';
import {
  concluirCriacao,
  aumentoNaCompra,
  custoDosPontos,
  escolhasDaFicha,
  fichaDaCriacao,
  guiaDeMagias,
  magiasDaClasse,
  pendenciasDaCriacao,
  periciasAutomaticas,
  periciasParaEscolher,
  rolarAtributos,
  type EscolhasDeCriacao,
} from '../core/criacaoDePersonagem';
import { ATRIBUTOS, type Atributo, type Entrada, type EntradaDe } from '../core/entradas';
import type { Ficha } from '../core/fichas';
import { ehMestre } from '../core/permissoes';
import type { RolagemFeita } from '../core/acoesDaFicha';
import type { MetodoAtributos, Regras } from '../core/regras';
import { podeVer } from '../core/visibilidade';
import { useRegras } from './contextoRegras';
import { comSinal } from './ExplicacaoValor';
import { numeroNaTela } from './numeros';
import { ROTULO_ATRIBUTO, ROTULO_ESCOLA, ROTULO_TAMANHO } from './rotulosCompendio';

const PASSOS = [
  ['nome', 'Nome'],
  ['especie', 'Espécie'],
  ['classe', 'Classe'],
  ['antecedente', 'Antecedente'],
  ['atributos', 'Atributos'],
  ['pericias', 'Perícias'],
  ['magias', 'Magias'],
  ['equipamento', 'Equipamento'],
  ['revisao', 'Revisão'],
] as const;
type Passo = (typeof PASSOS)[number][0];

const ROTULO_METODO: Readonly<Record<MetodoAtributos, string>> = {
  pontos: 'Compra de pontos',
  padrao: 'Conjunto padrão',
  rolagem: 'Rolar os dados',
};

interface Props {
  readonly ficha: Ficha;
  readonly compendio: EstadoCompendio;
  readonly autorId: string;
  readonly participantes: readonly Participante[];
  /** Muda a ficha em criação; `campo` agrupa a digitação num passo de desfazer. */
  readonly editar: (nova: Ficha, campo: string) => void;
  /** Registra rolagens (os atributos rolados) no registro da mesa, para todos verem. */
  readonly registrarRolagens: (feitas: readonly RolagemFeita[]) => void;
  readonly aoDesistir: () => void;
}

/** O assistente de criação de personagem: passo a passo, com a ficha calculada ao lado. */
export function AssistenteCriacao({ ficha, compendio, autorId, participantes, editar, registrarRolagens, aoDesistir }: Props) {
  const regras = useRegras();
  const [passo, setPasso] = useState<Passo>('nome');
  const [desistindo, setDesistindo] = useState(false);
  const escolhas = useMemo(() => escolhasDaFicha(ficha, regras), [ficha, regras]);
  const calculo = useMemo(() => calcularFicha(ficha, regras), [ficha, regras]);
  const pendencias = pendenciasDaCriacao(escolhas, compendio, regras);

  /** As entradas de um tipo que quem está criando pode ver. */
  const visiveis = <T extends Entrada['tipo']>(tipo: T) =>
    (buscarEntradas(compendio, { tipos: [tipo] }) as EntradaDe<T>[]).filter((e) => podeVer(e.visibilidade, autorId));

  const mudar = (parcial: Partial<EscolhasDeCriacao>, campo: string) =>
    editar(fichaDaCriacao(ficha, { ...escolhas, ...parcial }, compendio, () => crypto.randomUUID()), campo);
  const unico = (nome: string) => `${nome}-${crypto.randomUUID()}`;

  const especie = escolhas.especieId ? (compendio.entradas[escolhas.especieId] as EntradaDe<'especie'> | undefined) : undefined;
  const classe = escolhas.classeId ? (compendio.entradas[escolhas.classeId] as EntradaDe<'classe'> | undefined) : undefined;
  const antecedente = escolhas.antecedenteId ? (compendio.entradas[escolhas.antecedenteId] as EntradaDe<'antecedente'> | undefined) : undefined;
  const indice = PASSOS.findIndex(([id]) => id === passo);

  const conteudo: Record<Passo, () => ReactNode> = {
    nome: () => (
      <>
        <label className="campo">
          <span>Nome do personagem</span>
          <input
            type="text"
            value={ficha.nome}
            placeholder="Como o personagem se chama?"
            onChange={(e) => editar({ ...ficha, nome: e.target.value }, 'nome')}
          />
        </label>
        {ehMestre(autorId) && (
          <label className="campo">
            <span>Controlada por</span>
            <select value={ficha.donoId} onChange={(e) => editar({ ...ficha, donoId: e.target.value }, unico('dono'))}>
              {participantes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome || 'Sem nome'}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="tela-dica">
          Siga os passos à esquerda, em qualquer ordem. A ficha ao lado se calcula sozinha a cada escolha, e nada é definitivo
          até você concluir na Revisão.
        </p>
      </>
    ),

    especie: () => (
      <Cartas
        opcoes={visiveis('especie')}
        escolhida={escolhas.especieId}
        aoEscolher={(id) => mudar({ especieId: id }, unico('especie'))}
        vazio="Não há espécies no compêndio. Peça ao mestre para importar o SRD."
        detalhes={(e) => (
          <>
            <p>
              {ROTULO_TAMANHO[e.dados.tamanho]} · {numeroNaTela(e.dados.deslocamento)} m de deslocamento
            </p>
            <p>{textoDosAumentos(e.dados.aumentosAtributo, regras) || 'Sem aumentos de atributo fixos.'}</p>
            <p>{nomesDe(e.dados.tracos, compendio)}</p>
          </>
        )}
      />
    ),

    classe: () => (
      <Cartas
        opcoes={visiveis('classe')}
        escolhida={escolhas.classeId}
        // Outra classe tem outras perícias e magias: as escolhas antigas não valem mais.
        aoEscolher={(id) => mudar({ classeId: id, pericias: [], magias: [] }, unico('classe'))}
        vazio="Não há classes no compêndio. Peça ao mestre para importar o SRD."
        detalhes={(c) => (
          <>
            <p>
              Dado de vida d{c.dados.dadoVida} · Salvaguardas: {c.dados.salvaguardas.map((a) => regras.atributos[a]).join(', ') || 'nenhuma'}
              {c.dados.atributoConjuracao && ` · Conjura com ${regras.atributos[c.dados.atributoConjuracao]}`}
            </p>
            {c.dados.escolhaPericias && (
              <p>
                Escolhe {c.dados.escolhaPericias.quantidade} perícia{c.dados.escolhaPericias.quantidade === 1 ? '' : 's'}
              </p>
            )}
            <p>No 1º nível: {nomesDe(c.dados.habilidades.filter((h) => h.nivel === 1).map((h) => h.entradaId), compendio) || '—'}</p>
          </>
        )}
      />
    ),

    antecedente: () => (
      <Cartas
        opcoes={visiveis('antecedente')}
        escolhida={escolhas.antecedenteId}
        permiteNenhum
        // As perícias que o antecedente novo já dá saem da escolha da classe.
        aoEscolher={(id) => {
          const novo = id ? (compendio.entradas[id] as EntradaDe<'antecedente'>) : null;
          const validas = periciasParaEscolher(classe ?? null, novo, regras).opcoes.map((o) => o.id);
          mudar({ antecedenteId: id, pericias: escolhas.pericias.filter((p) => validas.includes(p)) }, unico('antecedente'));
        }}
        vazio="Não há antecedentes no compêndio."
        detalhes={(a) => <p>Perícias: {a.dados.proficiencias.join(', ') || '—'}</p>}
      />
    ),

    atributos: () => (
      <PassoAtributos
        escolhas={escolhas}
        regras={regras}
        especie={especie ?? null}
        valorFinal={(a) => calculo.valor(a)}
        mudar={mudar}
        rolar={() => {
          const feitas = rolarAtributos(regras.criacao);
          registrarRolagens(feitas);
          const rolados = feitas.map((f) => f.rolagem.total);
          mudar(
            { rolados, atributos: Object.fromEntries(ATRIBUTOS.map((a, i) => [a, rolados[i]])) as Record<Atributo, number> },
            unico('rolar'),
          );
        }}
      />
    ),

    pericias: () => {
      const { quantidade, opcoes } = periciasParaEscolher(classe ?? null, antecedente ?? null, regras);
      const automaticas = periciasAutomaticas(ficha, regras).map((id) => regras.pericias.find((p) => p.id === id)?.nome ?? id);
      return (
        <>
          {automaticas.length > 0 && <p className="tela-dica">Já vêm do antecedente: {automaticas.join(', ')}.</p>}
          {!classe && <p className="tela-dica">Escolha a classe primeiro.</p>}
          {classe && quantidade === 0 && <p className="tela-dica">Esta classe não tem perícias para escolher.</p>}
          {quantidade > 0 && (
            <>
              <p>
                Escolha {quantidade} ({escolhas.pericias.length} de {quantidade}):
              </p>
              <div className="assistente-marcas">
                {opcoes.map((o) => {
                  const marcada = escolhas.pericias.includes(o.id);
                  const valor = calculo.valor(o.id);
                  return (
                    <label key={o.id} className="campo-marcar">
                      <input
                        type="checkbox"
                        checked={marcada}
                        disabled={!marcada && escolhas.pericias.length >= quantidade}
                        onChange={(e) =>
                          mudar(
                            { pericias: e.target.checked ? [...escolhas.pericias, o.id] : escolhas.pericias.filter((p) => p !== o.id) },
                            unico('pericia'),
                          )
                        }
                      />
                      {o.nome} {valor.ok && <small>{comSinal(valor.valor)}</small>}
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </>
      );
    },

    magias: () => {
      if (!classe?.dados.atributoConjuracao) {
        return <p className="tela-dica">{classe ? 'Esta classe não conjura magias no 1º nível.' : 'Escolha a classe primeiro.'}</p>;
      }
      const lista = magiasDaClasse(ficha, classe.id, compendio, calculo).filter((m) => podeVer(m.visibilidade, autorId));
      const guia = guiaDeMagias(ficha, classe.id, calculo);
      const escolhidas = lista.filter((m) => escolhas.magias.includes(m.id));
      const truques = escolhidas.filter((m) => m.dados.nivel === 0).length;
      return (
        <>
          <p className="tela-dica">
            {guia.truques !== null && `A tabela da classe indica ${guia.truques} truque${guia.truques === 1 ? '' : 's'}. `}
            {guia.magiasConhecidas !== null && `Magias conhecidas: ${guia.magiasConhecidas}. `}
            Escolhidos: {truques} truque{truques === 1 ? '' : 's'} e {escolhidas.length - truques} magia
            {escolhidas.length - truques === 1 ? '' : 's'}.
          </p>
          {lista.length === 0 && <p className="tela-dica">Não há magias desta classe no compêndio.</p>}
          {[...new Set(lista.map((m) => m.dados.nivel))].map((nivel) => (
            <section key={nivel}>
              <h4>{nivel === 0 ? 'Truques' : `${nivel}º nível`}</h4>
              <div className="assistente-marcas">
                {lista
                  .filter((m) => m.dados.nivel === nivel)
                  .map((m) => (
                    <label key={m.id} className="campo-marcar" title={m.descricao.slice(0, 400)}>
                      <input
                        type="checkbox"
                        checked={escolhas.magias.includes(m.id)}
                        onChange={(e) =>
                          mudar(
                            { magias: e.target.checked ? [...escolhas.magias, m.id] : escolhas.magias.filter((id) => id !== m.id) },
                            unico('magia'),
                          )
                        }
                      />
                      {m.nome} <small>{ROTULO_ESCOLA[m.dados.escola]}</small>
                    </label>
                  ))}
              </div>
            </section>
          ))}
        </>
      );
    },

    equipamento: () => (
      <PassoEquipamento
        classe={classe ?? null}
        compendio={compendio}
        autorId={autorId}
        itens={escolhas.itens}
        mudar={(itens) => mudar({ itens }, unico('equipamento'))}
      />
    ),

    revisao: () => (
      <>
        {pendencias.length > 0 ? (
          <>
            <p>Falta pouco:</p>
            <ul className="assistente-pendencias">
              {pendencias.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mensagem-info">Tudo pronto. Ao concluir, a ficha passa a valer na mesa.</p>
        )}
        <div className="tela-cabecalho-acoes">
          <button
            type="button"
            className="assistente-concluir"
            disabled={pendencias.length > 0}
            onClick={() => editar(concluirCriacao(ficha), unico('concluir'))}
          >
            Concluir personagem
          </button>
          {!desistindo ? (
            <button type="button" onClick={() => setDesistindo(true)}>
              Desistir deste personagem
            </button>
          ) : (
            <span className="regras-apagar">
              Apagar este personagem em criação?
              <button type="button" onClick={aoDesistir}>
                Apagar
              </button>
              <button type="button" onClick={() => setDesistindo(false)}>
                Cancelar
              </button>
            </span>
          )}
        </div>
      </>
    ),
  };

  /** Um passo está feito quando nenhuma pendência dele aparece. */
  const feito = (id: Passo): boolean => {
    switch (id) {
      case 'nome':
        return ficha.nome.trim() !== '';
      case 'especie':
        return !!especie;
      case 'classe':
        return !!classe;
      case 'antecedente':
        return !!antecedente;
      case 'atributos': {
        // Na compra de pontos, só está feito quando todos os pontos foram gastos.
        const custo = custoDosPontos(regras.criacao, escolhas.atributos);
        const sobrou = escolhas.metodo === 'pontos' && (!custo.ok || custo.gastos < regras.criacao.pontos);
        return !sobrou && !pendencias.some((p) => /atribut|pontos|valores|Role/.test(p));
      }
      case 'pericias':
        return !!classe && !pendencias.some((p) => /perícia/.test(p));
      case 'magias':
        return !!classe && (!classe.dados.atributoConjuracao || escolhas.magias.length > 0);
      case 'equipamento':
        return escolhas.itens.length > 0;
      case 'revisao':
        return pendencias.length === 0;
    }
  };

  return (
    <div className="assistente">
      <nav className="assistente-passos" aria-label="Passos da criação">
        <h2>Criar personagem</h2>
        <ol>
          {PASSOS.map(([id, rotulo]) => (
            <li key={id}>
              <button type="button" aria-current={passo === id} onClick={() => setPasso(id)}>
                <span className={feito(id) ? 'assistente-feito' : 'assistente-pendente'}>{feito(id) ? '✓' : '•'}</span> {rotulo}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="assistente-conteudo">
        <h3>{PASSOS[indice][1]}</h3>
        {conteudo[passo]()}
        <div className="assistente-navegar">
          <button type="button" disabled={indice === 0} onClick={() => setPasso(PASSOS[indice - 1][0])}>
            ← Voltar
          </button>
          {indice < PASSOS.length - 1 && (
            <button type="button" onClick={() => setPasso(PASSOS[indice + 1][0])}>
              Próximo →
            </button>
          )}
        </div>
      </section>

      <aside className="assistente-previa" aria-label="Prévia da ficha">
        <h3>{ficha.nome || 'Sem nome'}</h3>
        <p className="tela-dica">
          {[especie?.nome, classe && `${classe.nome} 1`, antecedente?.nome].filter(Boolean).join(' · ') || 'Nada escolhido ainda'}
        </p>
        <div className="assistente-previa-atributos">
          {ATRIBUTOS.map((a) => {
            const valor = calculo.valor(a);
            const mod = calculo.modificador(a);
            return (
              <div key={a}>
                <small>{a.toUpperCase()}</small>
                <strong>{valor.ok ? numeroNaTela(valor.valor) : '—'}</strong>
                <small>{mod.ok ? comSinal(mod.valor) : ''}</small>
              </div>
            );
          })}
        </div>
        <dl>
          {regras.valores
            .filter((v) => !['cd_magia', 'ataque_magico'].includes(v.id) || classe?.dados.atributoConjuracao)
            .map((v) => {
              const calculado = calculo.valor(v.id);
              return (
                <div key={v.id}>
                  <dt>{v.nome}</dt>
                  <dd>{calculado.ok ? numeroNaTela(calculado.valor) : '—'}</dd>
                </div>
              );
            })}
        </dl>
      </aside>
    </div>
  );
}

function textoDosAumentos(aumentos: Readonly<Partial<Record<Atributo, number>>>, regras: Regras): string {
  return Object.entries(aumentos)
    .map(([a, n]) => `${comSinal(n ?? 0)} ${regras.atributos[a as Atributo]}`)
    .join(', ');
}

function nomesDe(ids: readonly string[], compendio: EstadoCompendio): string {
  return ids
    .map((id) => compendio.entradas[id]?.nome)
    .filter(Boolean)
    .join(', ');
}

/** Uma escolha entre entradas do compêndio, como cartas clicáveis com o resumo de cada uma. */
function Cartas<T extends Entrada>({
  opcoes,
  escolhida,
  aoEscolher,
  detalhes,
  vazio,
  permiteNenhum = false,
}: {
  readonly opcoes: readonly T[];
  readonly escolhida: string | null;
  readonly aoEscolher: (id: string | null) => void;
  readonly detalhes: (entrada: T) => ReactNode;
  readonly vazio: string;
  readonly permiteNenhum?: boolean;
}) {
  if (opcoes.length === 0) {
    return <p className="tela-dica">{vazio}</p>;
  }
  return (
    <div className="assistente-cartas">
      {permiteNenhum && (
        <button type="button" className="assistente-carta" aria-pressed={escolhida === null} onClick={() => aoEscolher(null)}>
          <strong>Nenhum</strong>
        </button>
      )}
      {opcoes.map((e) => (
        <div key={e.id} className="assistente-carta" aria-pressed={escolhida === e.id}>
          <button type="button" className="assistente-carta-escolher" onClick={() => aoEscolher(e.id)}>
            <strong>{e.nome || '(sem nome)'}</strong>
            {escolhida === e.id && <span className="assistente-feito"> ✓ escolhida</span>}
          </button>
          <div className="assistente-carta-detalhes">{detalhes(e)}</div>
          {e.descricao && (
            <details>
              <summary>Descrição</summary>
              <p className="painel-texto">{e.descricao}</p>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function PassoAtributos({
  escolhas,
  regras,
  especie,
  valorFinal,
  mudar,
  rolar,
}: {
  readonly escolhas: EscolhasDeCriacao;
  readonly regras: Regras;
  readonly especie: EntradaDe<'especie'> | null;
  readonly valorFinal: (atributo: Atributo) => ReturnType<ReturnType<typeof calcularFicha>['valor']>;
  readonly mudar: (parcial: Partial<EscolhasDeCriacao>, campo: string) => void;
  readonly rolar: () => void;
}) {
  const { criacao } = regras;
  const unico = (nome: string) => `${nome}-${crypto.randomUUID()}`;
  const valoresDoMetodo = escolhas.metodo === 'padrao' ? criacao.conjuntoPadrao : escolhas.metodo === 'rolagem' ? escolhas.rolados : null;
  const custo = custoDosPontos(criacao, escolhas.atributos);
  const valoresPossiveis = criacao.custos.map((c) => c.valor).sort((a, b) => a - b);

  const trocarMetodo = (metodo: MetodoAtributos) => {
    const menor = valoresPossiveis[0];
    const lista = metodo === 'padrao' ? criacao.conjuntoPadrao : metodo === 'rolagem' ? escolhas.rolados : null;
    const atributos = Object.fromEntries(ATRIBUTOS.map((a, i) => [a, lista ? lista[i] : metodo === 'pontos' ? menor : 10])) as Record<Atributo, number>;
    mudar({ metodo, atributos }, unico('metodo'));
  };

  /** No conjunto padrão e na rolagem, escolher um valor já usado troca os dois atributos de lugar. */
  const atribuir = (atributo: Atributo, indiceDoValor: number) => {
    if (!valoresDoMetodo) {
      return;
    }
    const atual = ATRIBUTOS.indexOf(atributo);
    // A posição na lista que cada atributo usa (os valores podem se repetir, como dois 12 rolados).
    const achadas = ATRIBUTOS.map(posicaoDe);
    const posicoes = achadas.includes(-1) ? ATRIBUTOS.map((_, i) => i) : achadas;
    const outro = posicoes.indexOf(indiceDoValor);
    if (outro >= 0) {
      posicoes[outro] = posicoes[atual];
    }
    posicoes[atual] = indiceDoValor;
    mudar(
      { atributos: Object.fromEntries(ATRIBUTOS.map((a, i) => [a, valoresDoMetodo[posicoes[i]]])) as Record<Atributo, number> },
      unico('atribuir'),
    );
  };

  const posicaoDe = (atributo: Atributo): number => {
    if (!valoresDoMetodo) {
      return -1;
    }
    const usados = new Set<number>();
    for (const a of ATRIBUTOS) {
      const pos = valoresDoMetodo.findIndex((v, j) => v === escolhas.atributos[a] && !usados.has(j));
      usados.add(pos);
      if (a === atributo) {
        return pos;
      }
    }
    return -1;
  };

  return (
    <>
      <div className="assistente-metodos" role="tablist">
        {criacao.metodos.map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={escolhas.metodo === m}
            // Depois de rolar, os valores rolados ficam: trocar de método não dá uma nova chance.
            disabled={escolhas.rolados !== null && m !== 'rolagem'}
            title={escolhas.rolados !== null && m !== 'rolagem' ? 'Os atributos já foram rolados.' : undefined}
            onClick={() => trocarMetodo(m)}
          >
            {ROTULO_METODO[m]}
          </button>
        ))}
      </div>
      {escolhas.metodo === 'pontos' && (
        <p className="tela-dica">
          {custo.ok ? `Pontos gastos: ${custo.gastos} de ${criacao.pontos} (sobram ${criacao.pontos - custo.gastos}).` : custo.erro} Cada atributo vai de {valoresPossiveis[0]} a{' '}
          {valoresPossiveis.at(-1)}.
        </p>
      )}
      {escolhas.metodo === 'padrao' && <p className="tela-dica">Distribua {criacao.conjuntoPadrao.join(', ')}, um valor para cada atributo.</p>}
      {escolhas.metodo === 'rolagem' && (
        <div className="tela-cabecalho-acoes">
          <button type="button" disabled={escolhas.rolados !== null} onClick={rolar}>
            {escolhas.rolados ? `Rolados: ${escolhas.rolados.join(', ')}` : `Rolar os atributos (${criacao.rolagem}, seis vezes)`}
          </button>
          <span className="tela-dica">A rolagem aparece no registro para todos, e só pode ser feita uma vez.</span>
        </div>
      )}

      <div className="assistente-atributos">
        {ATRIBUTOS.map((a) => {
          const valor = escolhas.atributos[a];
          const final = valorFinal(a);
          const bonus = especie?.dados.aumentosAtributo[a];
          const aumento = aumentoNaCompra(criacao, escolhas.atributos, a);
          const passo = (delta: number) => {
            const proximo = valoresPossiveis[valoresPossiveis.indexOf(valor) + delta];
            if (proximo !== undefined) {
              mudar({ atributos: { ...escolhas.atributos, [a]: proximo } }, unico('ponto'));
            }
          };
          return (
            <div key={a} className="assistente-atributo">
              <span>{regras.atributos[a] || ROTULO_ATRIBUTO[a]}</span>
              {escolhas.metodo === 'pontos' ? (
                <span className="carta-quantidade">
                  <button type="button" title="Menos um" disabled={valor <= valoresPossiveis[0]} onClick={() => passo(-1)}>
                    −
                  </button>
                  <strong>{valor}</strong>
                  <button type="button" title={aumento.ok ? 'Mais um' : aumento.motivo} disabled={!aumento.ok} onClick={() => passo(1)}>
                    +
                  </button>
                </span>
              ) : valoresDoMetodo ? (
                <select aria-label={`Valor de ${regras.atributos[a]}`} value={posicaoDe(a)} onChange={(e) => atribuir(a, Number(e.target.value))}>
                  {valoresDoMetodo.map((v, i) => (
                    <option key={i} value={i}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>—</strong>
              )}
              <small>
                {bonus ? `${comSinal(bonus)} da espécie → ` : ''}
                {final.ok ? numeroNaTela(final.valor) : '—'}
              </small>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** O equipamento inicial: o texto da classe como guia e a busca de itens no compêndio. */
function PassoEquipamento({
  classe,
  compendio,
  autorId,
  itens,
  mudar,
}: {
  readonly classe: EntradaDe<'classe'> | null;
  readonly compendio: EstadoCompendio;
  readonly autorId: string;
  readonly itens: EscolhasDeCriacao['itens'];
  readonly mudar: (itens: EscolhasDeCriacao['itens']) => void;
}) {
  const [busca, setBusca] = useState('');
  const encontrados = useMemo(
    () =>
      busca.trim().length < 2
        ? []
        : buscarEntradas(compendio, { texto: busca, tipos: ['item'] })
            .filter((e) => podeVer(e.visibilidade, autorId))
            .slice(0, 12),
    [busca, compendio, autorId],
  );
  const guia = classe?.descricao.match(/Starting equipment:[^\n]*/)?.[0];
  const acrescentar = (id: string) => {
    const existente = itens.find((i) => i.entradaId === id);
    mudar(existente ? itens.map((i) => (i === existente ? { ...i, quantidade: i.quantidade + 1 } : i)) : [...itens, { entradaId: id, quantidade: 1 }]);
  };
  return (
    <>
      {guia ? <p className="painel-texto">{guia}</p> : <p className="tela-dica">Escolha a classe para ver o equipamento inicial dela.</p>}
      <input
        type="search"
        className="assistente-busca"
        aria-label="Procurar item no compêndio"
        placeholder="Procurar item no compêndio, como Longsword"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />
      {encontrados.length > 0 && (
        <ul className="organizacao-resultados">
          {encontrados.map((e) => (
            <li key={e.id}>
              <button type="button" onClick={() => acrescentar(e.id)}>
                + {e.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
      <h4>Levando</h4>
      {itens.length === 0 && <p className="tela-dica">Nada ainda.</p>}
      <ul className="assistente-itens">
        {itens.map((item) => (
          <li key={item.entradaId}>
            <span>{compendio.entradas[item.entradaId]?.nome ?? '(item apagado)'}</span>
            <span className="carta-quantidade">
              <button
                type="button"
                title="Menos um"
                onClick={() =>
                  mudar(
                    item.quantidade <= 1
                      ? itens.filter((i) => i !== item)
                      : itens.map((i) => (i === item ? { ...i, quantidade: i.quantidade - 1 } : i)),
                  )
                }
              >
                −
              </button>
              <span>{item.quantidade}</span>
              <button type="button" title="Mais um" onClick={() => acrescentar(item.entradaId)}>
                +
              </button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

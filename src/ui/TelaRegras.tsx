import { useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Calculo } from '../core/calculadora';
import { calcularFicha } from '../core/calculoDaFicha';
import type { LojaCompendio } from '../core/compendio';
import { ATRIBUTOS, type Atributo } from '../core/entradas';
import type { LojaFichas } from '../core/fichas';
import { ehMestre, fichasVisiveis } from '../core/permissoes';
import {
  conferirRegras,
  idSalvaguarda,
  METODOS_ATRIBUTOS,
  type DefinicaoPericia,
  type DefinicaoValor,
  type MetodoAtributos,
  type Regras,
  type RegrasDeCriacao,
} from '../core/regras';
import { novoIdDeRegra, usosDoNome, type LojaRegras } from '../core/regrasDaCampanha';
import { REGRAS_PADRAO } from '../core/regrasPadrao';
import { CampoFormula, CampoLinhas, CampoNumero, CampoTexto } from './camposFormulario';
import { comSinal, ExplicacaoValor, type Explicando } from './ExplicacaoValor';
import { numeroNaTela } from './numeros';
import type { Manifesto } from '../core/manifesto';
import { SecaoViagemRegras } from './SecaoViagemRegras';

interface TelaRegrasProps {
  readonly lojaRegras: LojaRegras;
  readonly lojaFichas: LojaFichas;
  readonly lojaCompendio: LojaCompendio;
  readonly agindoComoId: string;
  readonly seletorAgindoComo: ReactNode;
  /** Para a seção Viagem listar os tiles e as tags de cada um. */
  readonly manifesto: Manifesto | null;
  readonly aoFechar: () => void;
}

/** O primeiro problema que as regras teriam com esta mudança, para mostrar no campo. */
function problemaCom(regras: Regras): string | null {
  const [primeiro] = conferirRegras(regras);
  return primeiro ? `${primeiro.onde}: ${primeiro.erro}` : null;
}

/**
 * As regras da campanha: nomes dos atributos, fórmulas, perícias e valores da ficha.
 * Só o mestre muda; os jogadores leem. Uma mudança com problema não chega às fichas.
 */
export function TelaRegras({ lojaRegras, lojaFichas, lojaCompendio, agindoComoId, seletorAgindoComo, manifesto, aoFechar }: TelaRegrasProps) {
  const regras = useSyncExternalStore(lojaRegras.assinar, lojaRegras.obterEstado);
  const fichas = useSyncExternalStore(lojaFichas.assinar, lojaFichas.obterEstado);
  const podeDesfazer = useSyncExternalStore(lojaRegras.assinar, lojaRegras.podeDesfazer);
  const podeRefazer = useSyncExternalStore(lojaRegras.assinar, lojaRegras.podeRefazer);
  const mestre = ehMestre(agindoComoId);
  const [fichaTesteId, setFichaTesteId] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [explicando, setExplicando] = useState<Explicando | null>(null);
  const fecharExplicacao = useCallback(() => setExplicando(null), []);
  // Cada vez que um campo recebe o foco começa um novo passo de desfazer.
  const sessaoDeFoco = useRef(0);

  const visiveis = useMemo(
    () => fichasVisiveis(fichas, agindoComoId).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [fichas, agindoComoId],
  );
  const fichaTeste = visiveis.find((f) => f.id === fichaTesteId);
  const calculo = useMemo(() => (fichaTeste ? calcularFicha(fichaTeste, regras) : null), [fichaTeste, regras]);

  /**
   * Aplica a nova versão, ou explica por que não dá. Os campos de fórmula já mostram o problema
   * embaixo deles enquanto se digita, então não repetem o aviso.
   */
  const editar = (nova: Regras, campo: string, avisar = true) => {
    const problema = problemaCom(nova);
    if (problema) {
      if (avisar) {
        setAviso(problema);
      }
      return;
    }
    setAviso(null);
    lojaRegras.despachar({ tipo: 'EditarRegras', regras: nova }, `${campo}:${sessaoDeFoco.current}`);
  };
  const unico = (nome: string) => `${nome}-${crypto.randomUUID()}`;

  const mudarPericia = (id: string, mudancas: Partial<DefinicaoPericia>, campo: string) =>
    editar({ ...regras, pericias: regras.pericias.map((p) => (p.id === id ? { ...p, ...mudancas } : p)) }, `pericia-${id}-${campo}`);
  const mudarValor = (id: string, mudancas: Partial<DefinicaoValor>, campo: string) =>
    editar({ ...regras, valores: regras.valores.map((v) => (v.id === id ? { ...v, ...mudancas } : v)) }, `valor-${id}-${campo}`);
  const comFormulaDoValor = (id: string, formula: string): Regras => ({
    ...regras,
    valores: regras.valores.map((v) => (v.id === id ? { ...v, formula } : v)),
  });

  // O nome interno sai do nome escrito na hora de criar, e depois fica fixo.
  const novaPericia = (nome: string) => {
    const id = novoIdDeRegra(regras, nome);
    editar({ ...regras, pericias: [...regras.pericias, { id, nome, atributo: 'for' }] }, unico('pericia'));
  };
  const novoValor = (nome: string) => {
    const id = novoIdDeRegra(regras, nome);
    editar({ ...regras, valores: [...regras.valores, { id, nome, formula: '0', descricao: '' }] }, unico('valor'));
  };
  const moverValor = (indice: number, destino: number) => {
    const valores = [...regras.valores];
    const [valor] = valores.splice(indice, 1);
    valores.splice(destino, 0, valor);
    editar({ ...regras, valores }, unico('ordem'));
  };
  const semONome = (id: string): Regras => ({
    ...regras,
    pericias: regras.pericias.filter((p) => p.id !== id),
    valores: regras.valores.filter((v) => v.id !== id),
  });
  const apagar = (id: string) => {
    setApagando(null);
    editar(semONome(id), unico('apagar'));
  };

  /** O resultado na ficha de teste, que explica de onde vem ao ser clicado. */
  const resultado = (rotulo: string, obter: (c: Calculo) => ReturnType<Calculo['valor']>, sinal = false) => {
    if (!calculo) {
      return null;
    }
    const calculado = obter(calculo);
    return (
      <button
        type="button"
        className="ficha-valor regras-resultado"
        title={calculado.ok ? 'De onde vem este número?' : calculado.erro}
        onClick={(e) => {
          const caixa = e.currentTarget.getBoundingClientRect();
          setExplicando({ rotulo, calculado, x: caixa.left, y: caixa.bottom });
        }}
      >
        {calculado.ok ? (sinal ? comSinal(calculado.valor) : numeroNaTela(calculado.valor)) : '—'}
      </button>
    );
  };

  const confirmacaoDeApagar = (id: string, nome: string) => {
    if (apagando !== id) {
      return (
        <button type="button" onClick={() => setApagando(id)}>
          Apagar
        </button>
      );
    }
    // Se as próprias regras usam o nome, apagar deixaria uma fórmula quebrada: não dá.
    const [problema] = conferirRegras(semONome(id));
    if (problema) {
      const motivo = problema.erro.startsWith('Nome desconhecido') ? `${problema.onde} usa este nome.` : `${problema.onde}: ${problema.erro}`;
      return (
        <div className="regras-apagar" role="alert">
          <span>Não dá para apagar: {motivo}</span>
          <button type="button" onClick={() => setApagando(null)}>
            Ok
          </button>
        </div>
      );
    }
    const usos = usosDoNome(id, lojaCompendio.obterEstado(), fichas);
    const partes = [
      usos.fichas > 0 && `${usos.fichas} ficha${usos.fichas === 1 ? '' : 's'}`,
      usos.entradas > 0 && `${usos.entradas} entrada${usos.entradas === 1 ? '' : 's'} do compêndio`,
    ].filter(Boolean);
    return (
      <div className="regras-apagar" role="alert">
        <span>
          Apagar {nome || id}?{' '}
          {partes.length > 0 ? `Usado em ${partes.join(' e ')}: lá o número vai mostrar "—".` : 'Nada usa este nome.'}
        </span>
        <button type="button" onClick={() => apagar(id)}>
          Apagar mesmo
        </button>
        <button type="button" onClick={() => setApagando(null)}>
          Cancelar
        </button>
      </div>
    );
  };

  return (
    <div className="tela-sobreposta" role="dialog" aria-label="Regras">
      <header className="tela-cabecalho">
        <h1>Regras</h1>
        {mestre ? (
          <div className="tela-cabecalho-acoes">
            <button type="button" disabled={!podeDesfazer} onClick={lojaRegras.desfazer} title="Ctrl+Z">
              Desfazer
            </button>
            <button type="button" disabled={!podeRefazer} onClick={lojaRegras.refazer} title="Ctrl+Y">
              Refazer
            </button>
            <button
              type="button"
              title="Volta às regras que acompanham o programa (Ctrl+Z desfaz)"
              onClick={() => editar(REGRAS_PADRAO, unico('padrao'))}
            >
              Restaurar regras padrão
            </button>
          </div>
        ) : (
          <p className="tela-dica">Só para leitura: as regras são do mestre.</p>
        )}
        {seletorAgindoComo}
        <button type="button" className="tela-fechar" onClick={aoFechar}>
          Voltar ao mapa
        </button>
      </header>

      <main
        className="compendio-editor regras-corpo"
        onFocus={() => {
          sessaoDeFoco.current += 1;
        }}
      >
        <div className="regras-teste">
          <label className="campo">
            <span>Testar com a ficha</span>
            <select value={fichaTesteId} onChange={(e) => setFichaTesteId(e.target.value)}>
              <option value="">{visiveis.length > 0 ? 'Nenhuma' : 'Nenhuma ficha'}</option>
              {visiveis.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome || '(sem nome)'}
                </option>
              ))}
            </select>
          </label>
          <p className="tela-dica">
            {fichaTeste
              ? 'Cada número mostra o resultado nesta ficha; clique nele para ver de onde vem.'
              : 'Escolha uma ficha para ver o resultado de cada fórmula enquanto edita.'}
          </p>
        </div>
        {aviso && (
          <p className="mensagem-erro" role="alert">
            Não foi aplicado: {aviso}
          </p>
        )}

        {/* Um fieldset desativado desativa todos os campos de dentro: o jogador lê, mas não muda. */}
        <fieldset className="regras-campos" disabled={!mestre}>
          <section className="ficha-secao">
            <h3>Geral</h3>
            <div className="formulario">
              <CampoTexto rotulo="Nome das regras" valor={regras.nome} aoMudar={(nome) => editar({ ...regras, nome }, 'nome')} />
              <CampoNumero
                rotulo="Peso de cada moeda (kg)"
                minimo={0}
                valor={regras.pesoPorMoeda}
                aoMudar={(v) => v !== null && editar({ ...regras, pesoPorMoeda: v }, 'moeda')}
              />
            </div>
          </section>

          <SecaoCriacao regras={regras} editar={editar} mestre={mestre} />

          <SecaoViagemRegras regras={regras} editar={editar} mestre={mestre} manifesto={manifesto} />

          <section className="ficha-secao">
            <h3>Atributos</h3>
            <div className="formulario">
              {ATRIBUTOS.map((a: Atributo) => (
                <div key={a} className="regras-com-resultado">
                  <CampoTexto
                    rotulo={`Nome de ${a.toUpperCase()}`}
                    valor={regras.atributos[a]}
                    aoMudar={(nome) => editar({ ...regras, atributos: { ...regras.atributos, [a]: nome } }, `atributo-${a}`)}
                  />
                  {resultado(`Modificador de ${regras.atributos[a]}`, (c) => c.modificador(a), true)}
                </div>
              ))}
              <CampoFormula
                rotulo="Modificador (valor é o valor do atributo)"
                largo
                valor={regras.modificador}
                conferir={(texto) => problemaCom({ ...regras, modificador: texto })}
                aoMudar={(modificador) => editar({ ...regras, modificador }, 'modificador', false)}
              />
            </div>
          </section>

          <section className="ficha-secao">
            <h3>Perícias e salvaguardas</h3>
            <p className="tela-dica">
              Nas duas fórmulas, atributo é o valor do atributo e proficiencia é o multiplicador (0, ½, 1 ou 2).
            </p>
            <div className="formulario">
              <div className="regras-com-resultado campo-largo">
                <CampoFormula
                  rotulo="Fórmula das salvaguardas"
                  largo
                  valor={regras.formulaSalvaguarda}
                  conferir={(texto) => problemaCom({ ...regras, formulaSalvaguarda: texto })}
                  aoMudar={(formulaSalvaguarda) => editar({ ...regras, formulaSalvaguarda }, 'salvaguarda', false)}
                />
                {resultado(`Salvaguarda de ${regras.atributos.for}`, (c) => c.valor(idSalvaguarda('for')), true)}
              </div>
              <CampoFormula
                rotulo="Fórmula das perícias"
                largo
                valor={regras.formulaPericia}
                conferir={(texto) => problemaCom({ ...regras, formulaPericia: texto })}
                aoMudar={(formulaPericia) => editar({ ...regras, formulaPericia }, 'pericia', false)}
              />
            </div>
            <div className="editor-lista regras-lista">
              {regras.pericias.map((p) => (
                <div key={p.id} className="editor-lista-item">
                  <div className="editor-lista-campos">
                    <CampoTexto rotulo="Nome" valor={p.nome} aoMudar={(nome) => mudarPericia(p.id, { nome }, 'nome')} />
                    <label className="campo">
                      <span>Atributo</span>
                      <select value={p.atributo} onChange={(e) => mudarPericia(p.id, { atributo: e.target.value as Atributo }, 'atributo')}>
                        {ATRIBUTOS.map((a) => (
                          <option key={a} value={a}>
                            {regras.atributos[a]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <CampoLinhas
                      rotulo="Outros nomes (um por linha)"
                      valores={p.apelidos ?? []}
                      aoMudar={(apelidos) => mudarPericia(p.id, { apelidos }, 'apelidos')}
                    />
                    <p className="regras-id">
                      Nas fórmulas: <code>{p.id}</code> {resultado(p.nome, (c) => c.valor(p.id), true)}
                    </p>
                  </div>
                  {mestre && confirmacaoDeApagar(p.id, p.nome)}
                </div>
              ))}
              {mestre && <CriarNovo rotulo="+ Perícia" dica="Nome da nova perícia" aoCriar={novaPericia} />}
            </div>
          </section>

          <section className="ficha-secao">
            <h3>Valores da ficha</h3>
            <p className="tela-dica">
              Aparecem na ficha nesta ordem. Uma fórmula pode citar atributos (FOR, DES…), outros valores pelo nome
              interno, perícias e o que vem da ficha: nivel, pv_dos_dados, deslocamento_base, conjuracao e o
              equipamento (usando_armadura, armadura_base…).
            </p>
            <div className="editor-lista regras-lista">
              {regras.valores.map((v, i) => (
                <div key={v.id} className="editor-lista-item">
                  <div className="editor-lista-campos">
                    <CampoTexto rotulo="Nome" valor={v.nome} aoMudar={(nome) => mudarValor(v.id, { nome }, 'nome')} />
                    <CampoFormula
                      rotulo="Fórmula"
                      largo
                      valor={v.formula}
                      conferir={(texto) => problemaCom(comFormulaDoValor(v.id, texto))}
                      aoMudar={(formula) => editar(comFormulaDoValor(v.id, formula), `valor-${v.id}-formula`, false)}
                    />
                    <CampoTexto
                      rotulo="Descrição"
                      largo
                      valor={v.descricao}
                      aoMudar={(descricao) => mudarValor(v.id, { descricao }, 'descricao')}
                    />
                    <p className="regras-id">
                      Nas fórmulas: <code>{v.id}</code> {resultado(v.nome, (c) => c.valor(v.id))}
                    </p>
                  </div>
                  {mestre && (
                    <div className="regras-acoes">
                      <button type="button" title="Subir" disabled={i === 0} onClick={() => moverValor(i, i - 1)}>
                        ↑
                      </button>
                      <button type="button" title="Descer" disabled={i === regras.valores.length - 1} onClick={() => moverValor(i, i + 1)}>
                        ↓
                      </button>
                      {confirmacaoDeApagar(v.id, v.nome)}
                    </div>
                  )}
                </div>
              ))}
              {mestre && <CriarNovo rotulo="+ Valor" dica="Nome do novo valor, como Sanidade" aoCriar={novoValor} />}
            </div>
          </section>
        </fieldset>
      </main>
      {explicando && <ExplicacaoValor explicando={explicando} aoFechar={fecharExplicacao} />}
    </div>
  );
}

/** Um campo para o nome e o botão de criar: o nome interno sai deste nome. */
export function CriarNovo({ rotulo, dica, aoCriar }: { readonly rotulo: string; readonly dica: string; readonly aoCriar: (nome: string) => void }) {
  const [nome, setNome] = useState('');
  return (
    <form
      className="compendio-novo regras-novo"
      onSubmit={(e) => {
        e.preventDefault();
        if (nome.trim()) {
          aoCriar(nome.trim());
          setNome('');
        }
      }}
    >
      <input type="text" aria-label={dica} placeholder={dica} value={nome} onChange={(e) => setNome(e.target.value)} />
      <button type="submit" disabled={!nome.trim()}>
        {rotulo}
      </button>
    </form>
  );
}

const ROTULO_METODO: Readonly<Record<MetodoAtributos, string>> = {
  pontos: 'Compra de pontos',
  padrao: 'Conjunto padrão',
  rolagem: 'Rolar os dados',
};

/** Como os personagens são criados nesta campanha: quem cria e como os atributos são escolhidos. */
function SecaoCriacao({
  regras,
  editar,
  mestre,
}: {
  readonly regras: Regras;
  readonly editar: (nova: Regras, campo: string, avisar?: boolean) => void;
  readonly mestre: boolean;
}) {
  const { criacao } = regras;
  const mudar = (mudancas: Partial<RegrasDeCriacao>, campo: string, avisar = true) =>
    editar({ ...regras, criacao: { ...criacao, ...mudancas } }, `criacao-${campo}`, avisar);
  const custos = [...criacao.custos].sort((a, b) => a.valor - b.valor);
  const unico = (nome: string) => `${nome}-${crypto.randomUUID()}`;

  return (
    <section className="ficha-secao">
      <h3>Criação de personagem</h3>
      <label className="campo-marcar">
        <input type="checkbox" checked={criacao.jogadoresCriam} onChange={(e) => mudar({ jogadoresCriam: e.target.checked }, unico('jogadores'))} />
        Jogadores criam os próprios personagens pelo assistente
      </label>
      <div className="regras-metodos">
        <span className="tela-dica">Métodos de atributos que valem:</span>
        {METODOS_ATRIBUTOS.map((m) => (
          <label key={m} className="campo-marcar">
            <input
              type="checkbox"
              checked={criacao.metodos.includes(m)}
              onChange={(e) =>
                mudar(
                  { metodos: METODOS_ATRIBUTOS.filter((x) => (x === m ? e.target.checked : criacao.metodos.includes(x))) },
                  unico('metodos'),
                )
              }
            />
            {ROTULO_METODO[m]}
          </label>
        ))}
      </div>

      <div className="formulario">
        <CampoNumero
          rotulo="Pontos para gastar"
          inteiro
          minimo={0}
          valor={criacao.pontos}
          aoMudar={(v) => v !== null && mudar({ pontos: v }, 'pontos')}
        />
        <CampoNumero
          rotulo="Máximo de um atributo ao subir de nível"
          inteiro
          minimo={1}
          maximo={30}
          valor={criacao.maximoAtributo}
          aoMudar={(v) => v !== null && mudar({ maximoAtributo: v }, 'maximo')}
        />
        <CampoFormula
          rotulo="Rolagem de cada atributo"
          valor={criacao.rolagem}
          conferir={(texto) => {
            const [problema] = conferirRegras({ ...regras, criacao: { ...criacao, rolagem: texto } });
            return problema ? problema.erro : null;
          }}
          aoMudar={(rolagem) => mudar({ rolagem }, 'rolagem', false)}
        />
      </div>

      <h4 className="regras-subtitulo">Conjunto padrão (um valor para cada atributo)</h4>
      <div className="regras-linha-numeros">
        {criacao.conjuntoPadrao.map((v, i) => (
          <CampoNumero
            key={i}
            rotulo={`${i + 1}º`}
            inteiro
            minimo={1}
            maximo={30}
            valor={v}
            aoMudar={(n) => n !== null && mudar({ conjuntoPadrao: criacao.conjuntoPadrao.map((x, j) => (j === i ? n : x)) }, `conjunto-${i}`)}
          />
        ))}
      </div>

      <h4 className="regras-subtitulo">Custos da compra de pontos</h4>
      <p className="tela-dica">Só os valores desta tabela podem ser comprados; o menor costuma custar zero.</p>
      <div className="regras-custos">
        {custos.map((c) => (
          <div key={c.valor} className="regras-custo">
            <span>Valor {c.valor}</span>
            <CampoNumero
              rotulo="Custo"
              inteiro
              minimo={0}
              valor={c.custo}
              aoMudar={(n) =>
                n !== null && mudar({ custos: criacao.custos.map((x) => (x.valor === c.valor ? { ...x, custo: n } : x)) }, `custo-${c.valor}`)
              }
            />
            {mestre && (
              <button
                type="button"
                title="Tirar este valor da compra de pontos"
                disabled={custos.length <= 1}
                onClick={() => mudar({ custos: criacao.custos.filter((x) => x.valor !== c.valor) }, unico('tirar-custo'))}
              >
                Tirar
              </button>
            )}
          </div>
        ))}
      </div>
      {mestre && (
        <div className="tela-cabecalho-acoes regras-custos-acoes">
          <button
            type="button"
            disabled={(custos[0]?.valor ?? 1) <= 1}
            onClick={() => mudar({ custos: [{ valor: custos[0].valor - 1, custo: 0 }, ...criacao.custos] }, unico('custo-abaixo'))}
          >
            + Valor abaixo de {custos[0]?.valor}
          </button>
          <button
            type="button"
            disabled={(custos.at(-1)?.valor ?? 30) >= 30}
            onClick={() => {
              const ultimo = custos.at(-1)!;
              mudar({ custos: [...criacao.custos, { valor: ultimo.valor + 1, custo: ultimo.custo + 2 }] }, unico('custo-acima'));
            }}
          >
            + Valor acima de {custos.at(-1)?.valor}
          </button>
        </div>
      )}
    </section>
  );
}

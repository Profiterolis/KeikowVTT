import { normalizarNome } from '../core/formulas';
import type { Regras } from '../core/regras';
import { ROTULO_TIPO_ACAO_NOTURNA, TIPOS_ACAO_NOTURNA, type AcaoNoturna, type RegrasDaNoite, type TipoAcaoNoturna } from '../core/regrasDaNoite';
import { CampoNumero, CampoOpcoes, CampoTexto } from './camposFormulario';
import { CriarNovo } from './TelaRegras';

interface Props {
  readonly regras: Regras;
  readonly editar: (nova: Regras, campo: string, avisar?: boolean) => void;
  readonly mestre: boolean;
}

const ROTULOS_TIPO = Object.fromEntries(TIPOS_ACAO_NOTURNA.map((t) => [t, ROTULO_TIPO_ACAO_NOTURNA[t]])) as Record<TipoAcaoNoturna, string>;

/** Um nome interno novo, tirado do nome mostrado, sem repetir. */
function novoId(nome: string, usados: readonly string[]): string {
  const base = normalizarNome(nome).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'acao';
  let id = base;
  for (let n = 2; usados.includes(id); n++) {
    id = `${base}_${n}`;
  }
  return id;
}

/**
 * As regras da noite no acampamento: turnos, quanto descanso cada turno vale, as ações que os
 * jogadores escolhem, a chance de encontros por tag de terreno e a etiqueta dos veículos fechados.
 */
export function SecaoNoiteRegras({ regras, editar, mestre }: Props) {
  const { noite } = regras;
  const mudar = (mudancas: Partial<RegrasDaNoite>, campo: string) => editar({ ...regras, noite: { ...noite, ...mudancas } }, `noite-${campo}`);
  const unico = (nome: string) => `${nome}-${crypto.randomUUID()}`;
  const mudarAcao = (id: string, mudancas: Partial<AcaoNoturna>, campo: string) =>
    mudar({ acoes: noite.acoes.map((a) => (a.id === id ? { ...a, ...mudancas } : a)) }, `acao-${id}-${campo}`);
  const tagsComChance = regras.viagem.tags.filter((t) => !t.intransponivel);

  return (
    <section className="ficha-secao">
      <h3>Noite no acampamento</h3>
      <p className="tela-dica">
        Ao passar a noite, cada jogador escolhe em segredo uma ação por turno. Quem não escolher descansa. No fim, o grupo acorda
        na hora da partida, com o descanso que cada um conquistou.
      </p>
      <div className="formulario">
        <CampoNumero rotulo="Turnos da noite" inteiro minimo={1} maximo={12} valor={noite.turnos} aoMudar={(v) => v !== null && mudar({ turnos: v }, 'turnos')} />
        <CampoNumero
          rotulo="Turnos descansando para o descanso curto"
          inteiro
          minimo={1}
          valor={noite.turnosParaCurto}
          aoMudar={(v) => v !== null && mudar({ turnosParaCurto: v }, 'curto')}
        />
        <CampoNumero
          rotulo="Turnos descansando para o descanso longo"
          inteiro
          minimo={1}
          valor={noite.turnosParaLongo}
          aoMudar={(v) => v !== null && mudar({ turnosParaLongo: v }, 'longo')}
        />
        <CampoNumero
          rotulo="No abrigo (estalagem), turnos para o longo"
          inteiro
          minimo={1}
          valor={noite.turnosParaLongoNoAbrigo}
          aoMudar={(v) => v !== null && mudar({ turnosParaLongoNoAbrigo: v }, 'longo-abrigo')}
        />
        <CampoTexto
          rotulo="Etiqueta dos veículos fechados (no compêndio)"
          valor={noite.etiquetaVeiculoFechado}
          dica="Um item com esta etiqueta, onde caibam todos, impede que o grupo seja surpreendido à noite."
          aoMudar={(etiquetaVeiculoFechado) => mudar({ etiquetaVeiculoFechado }, 'etiqueta')}
        />
      </div>

      <h4 className="regras-subtitulo">Chance de encontro por turno (%)</h4>
      <p className="tela-dica">Vale a maior entre as tags do hex onde o grupo está. No abrigo, nunca há encontro.</p>
      <div className="formulario">
        {tagsComChance.map((t) => (
          <CampoNumero
            key={t.id}
            rotulo={t.nome}
            minimo={0}
            maximo={100}
            vazioPermitido
            valor={noite.chanceDeEncontro[t.id] ?? null}
            aoMudar={(v) => {
              const chances = { ...noite.chanceDeEncontro };
              if (v === null) {
                delete chances[t.id];
              } else {
                chances[t.id] = v;
              }
              mudar({ chanceDeEncontro: chances }, `chance-${t.id}`);
            }}
          />
        ))}
        <CampoNumero
          rotulo="Hex sem nenhuma dessas tags"
          minimo={0}
          maximo={100}
          valor={noite.chancePadrao}
          aoMudar={(v) => v !== null && mudar({ chancePadrao: v }, 'chance-padrao')}
        />
      </div>

      <h4 className="regras-subtitulo">Ações da noite</h4>
      <p className="tela-dica">No abrigo, as ações de vigiar não aparecem. Craftar entra quando existir o crafting.</p>
      <div className="editor-lista regras-lista">
        {noite.acoes.map((a) => (
          <div key={a.id} className="editor-lista-item">
            <div className="editor-lista-campos">
              <CampoTexto rotulo="Nome" valor={a.nome} aoMudar={(nome) => mudarAcao(a.id, { nome }, 'nome')} />
              <CampoOpcoes rotulo="O que faz" valor={a.tipo} rotulos={ROTULOS_TIPO} aoMudar={(tipo) => tipo && mudarAcao(a.id, { tipo }, 'tipo')} />
              <CampoTexto rotulo="Descrição" largo valor={a.descricao} aoMudar={(descricao) => mudarAcao(a.id, { descricao }, 'descricao')} />
            </div>
            {mestre && (
              <div className="regras-acoes">
                <button type="button" title="Tirar esta ação" onClick={() => mudar({ acoes: noite.acoes.filter((x) => x.id !== a.id) }, unico('tirar-acao'))}>
                  Tirar
                </button>
              </div>
            )}
          </div>
        ))}
        {mestre && (
          <CriarNovo
            rotulo="+ Ação"
            dica="Nome da nova ação, como Rezar"
            aoCriar={(nome) =>
              mudar(
                { acoes: [...noite.acoes, { id: novoId(nome, noite.acoes.map((a) => a.id)), nome, descricao: '', tipo: 'livre' }] },
                unico('nova-acao'),
              )
            }
          />
        )}
      </div>
    </section>
  );
}

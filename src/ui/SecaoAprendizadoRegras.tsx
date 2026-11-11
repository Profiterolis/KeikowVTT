import { ATRIBUTOS, type Atributo } from '../core/entradas';
import { normalizarNome } from '../core/formulas';
import type { Regras } from '../core/regras';
import type { RegrasDoAprendizado, TemaDeAprendizado, TipoTema } from '../core/regrasDoAprendizado';
import { CampoLinhas, CampoNumero, CampoOpcoes, CampoTexto } from './camposFormulario';
import { ROTULO_ATRIBUTO } from './rotulosCompendio';
import { CriarNovo } from './TelaRegras';

interface Props {
  readonly regras: Regras;
  readonly editar: (nova: Regras, campo: string, avisar?: boolean) => void;
  readonly mestre: boolean;
}

const ROTULO_TIPO: Readonly<Record<TipoTema, string>> = {
  idioma: 'Idioma (estudo)',
  pericia: 'Perícia (treino: fica proficiente)',
  proficiencia: 'Proficiência com arma ou armadura (treino)',
};
const ROTULO_ATRIBUTOS = Object.fromEntries(ATRIBUTOS.map((a) => [a, ROTULO_ATRIBUTO[a]])) as Record<Atributo, string>;

function novoId(nome: string, usados: readonly string[]): string {
  const base = normalizarNome(nome).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'tema';
  let id = base;
  for (let n = 2; usados.includes(id); n++) {
    id = `${base}_${n}`;
  }
  return id;
}

/**
 * O que se aprende estudando e treinando: cada tema com a CD de cada teste, os sucessos que
 * precisa juntar e o que o teste soma; e a dificuldade das magias, que vem do nível delas.
 */
export function SecaoAprendizadoRegras({ regras, editar, mestre }: Props) {
  const { aprendizado } = regras;
  const mudar = (mudancas: Partial<RegrasDoAprendizado>, campo: string) =>
    editar({ ...regras, aprendizado: { ...aprendizado, ...mudancas } }, `aprendizado-${campo}`);
  const mudarTema = (id: string, mudancas: Partial<TemaDeAprendizado>, campo: string) =>
    mudar({ temas: aprendizado.temas.map((t) => (t.id === id ? { ...t, ...mudancas } : t)) }, `tema-${id}-${campo}`);
  const unico = (nome: string) => `${nome}-${crypto.randomUUID()}`;
  const pericias = Object.fromEntries(regras.pericias.map((p) => [p.id, p.nome])) as Record<string, string>;

  return (
    <section className="ficha-secao">
      <h3>Estudo e treino</h3>
      <p className="tela-dica">
        Cada turno de estudo ou treino é um teste: d20 + a perícia ligada (ou o atributo) + a aptidão do personagem, contra a CD
        do tema. Um sucesso soma 1 (um 20 natural, 2); ao juntar os sucessos, o personagem aprende sozinho. As aptidões (idiomas,
        magia, física) mudam por efeitos de classes, espécies, talentos e itens.
      </p>

      <h4 className="regras-subtitulo">Magias (estudadas de um livro ou pergaminho)</h4>
      <div className="formulario">
        <CampoOpcoes
          rotulo="Perícia do teste"
          valor={aprendizado.magia.periciaLigada}
          rotulos={pericias}
          aoMudar={(v) => v && mudar({ magia: { ...aprendizado.magia, periciaLigada: v } }, 'magia-pericia')}
        />
        <CampoNumero rotulo="CD base" inteiro minimo={0} valor={aprendizado.magia.cdBase} aoMudar={(v) => v !== null && mudar({ magia: { ...aprendizado.magia, cdBase: v } }, 'magia-cd')} />
        <CampoNumero rotulo="CD a mais por nível" inteiro minimo={0} valor={aprendizado.magia.cdPorNivel} aoMudar={(v) => v !== null && mudar({ magia: { ...aprendizado.magia, cdPorNivel: v } }, 'magia-cd-nivel')} />
        <CampoNumero rotulo="Sucessos de um truque" inteiro minimo={1} valor={aprendizado.magia.sucessosBase} aoMudar={(v) => v !== null && mudar({ magia: { ...aprendizado.magia, sucessosBase: v } }, 'magia-sucessos')} />
        <CampoNumero
          rotulo="Sucessos a mais por nível"
          inteiro
          minimo={0}
          valor={aprendizado.magia.sucessosPorNivel}
          aoMudar={(v) => v !== null && mudar({ magia: { ...aprendizado.magia, sucessosPorNivel: v } }, 'magia-sucessos-nivel')}
        />
      </div>

      <h4 className="regras-subtitulo">Temas</h4>
      <div className="editor-lista regras-lista">
        {aprendizado.temas.map((t) => (
          <div key={t.id} className="editor-lista-item">
            <div className="editor-lista-campos">
              <CampoTexto rotulo="Nome" valor={t.nome} aoMudar={(nome) => mudarTema(t.id, { nome }, 'nome')} />
              <CampoOpcoes
                rotulo="O que ensina"
                valor={t.tipo}
                rotulos={ROTULO_TIPO}
                aoMudar={(tipo) =>
                  tipo &&
                  mudarTema(
                    t.id,
                    { tipo, modo: tipo === 'idioma' ? 'estudo' : 'treino', periciaLigada: tipo === 'pericia' ? (regras.pericias[0]?.id ?? null) : t.periciaLigada, alvo: tipo === 'pericia' ? (regras.pericias[0]?.id ?? '') : t.alvo },
                    'tipo',
                  )
                }
              />
              {t.tipo === 'pericia' ? (
                <CampoOpcoes rotulo="Perícia" valor={t.alvo} rotulos={pericias} aoMudar={(v) => v && mudarTema(t.id, { alvo: v, periciaLigada: v }, 'alvo')} />
              ) : (
                <CampoTexto
                  rotulo={t.tipo === 'idioma' ? 'Idioma que entra na ficha' : 'Proficiência que entra na ficha (como as classes escrevem)'}
                  valor={t.alvo}
                  aoMudar={(alvo) => mudarTema(t.id, { alvo }, 'alvo')}
                />
              )}
              {t.tipo !== 'pericia' && (
                <>
                  <CampoOpcoes
                    rotulo="Perícia do teste (vazio: só o atributo)"
                    valor={t.periciaLigada}
                    rotulos={pericias}
                    nenhum="Nenhuma"
                    aoMudar={(v) => mudarTema(t.id, { periciaLigada: v }, 'pericia')}
                  />
                  <CampoOpcoes rotulo="Atributo" valor={t.atributo} rotulos={ROTULO_ATRIBUTOS} aoMudar={(v) => v && mudarTema(t.id, { atributo: v }, 'atributo')} />
                </>
              )}
              <CampoNumero rotulo="CD de cada teste" inteiro minimo={1} valor={t.cd} aoMudar={(v) => v !== null && mudarTema(t.id, { cd: v }, 'cd')} />
              <CampoNumero rotulo="Sucessos para aprender" inteiro minimo={1} valor={t.sucessos} aoMudar={(v) => v !== null && mudarTema(t.id, { sucessos: v }, 'sucessos')} />
              <CampoLinhas rotulo="Outros nomes que contam como já saber" valores={t.apelidos} aoMudar={(apelidos) => mudarTema(t.id, { apelidos }, 'apelidos')} />
            </div>
            {mestre && (
              <div className="regras-acoes">
                <button type="button" title="Tirar este tema" onClick={() => mudar({ temas: aprendizado.temas.filter((x) => x.id !== t.id) }, unico('tirar-tema'))}>
                  Tirar
                </button>
              </div>
            )}
          </div>
        ))}
        {mestre && (
          <CriarNovo
            rotulo="+ Idioma"
            dica="Nome do novo idioma, como Druídico"
            aoCriar={(nome) =>
              mudar(
                {
                  temas: [
                    ...aprendizado.temas,
                    {
                      id: novoId(nome, aprendizado.temas.map((t) => t.id)),
                      nome,
                      modo: 'estudo',
                      tipo: 'idioma',
                      alvo: nome,
                      apelidos: [],
                      atributo: 'int',
                      periciaLigada: regras.pericias.some((p) => p.id === 'historia') ? 'historia' : null,
                      cd: 12,
                      sucessos: 6,
                    },
                  ],
                },
                unico('novo-tema'),
              )
            }
          />
        )}
        {mestre && (
          <CriarNovo
            rotulo="+ Treino"
            dica="Nome da nova proficiência, como Arco longo"
            aoCriar={(nome) =>
              mudar(
                {
                  temas: [
                    ...aprendizado.temas,
                    { id: novoId(nome, aprendizado.temas.map((t) => t.id)), nome, modo: 'treino', tipo: 'proficiencia', alvo: nome, apelidos: [], atributo: 'for', periciaLigada: null, cd: 13, sucessos: 8 },
                  ],
                },
                unico('novo-treino'),
              )
            }
          />
        )}
      </div>
    </section>
  );
}

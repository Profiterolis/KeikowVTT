import { normalizarNome } from '../core/formulas';
import type { Manifesto } from '../core/manifesto';
import type { Regras } from '../core/regras';
import {
  multiplicadorDasTags,
  tagsDoTile,
  type RegrasDeViagem,
  type RitmoDeViagem,
  type TagDeTerreno,
} from '../core/viagem';
import { CampoLinhas, CampoNumero, CampoTexto } from './camposFormulario';
import { nomeAmigavel } from './nomeAmigavel';
import { numeroNaTela } from './numeros';
import { CriarNovo } from './TelaRegras';

interface SecaoViagemProps {
  readonly regras: Regras;
  readonly editar: (nova: Regras, campo: string, avisar?: boolean) => void;
  readonly mestre: boolean;
  /** Para listar todos os tiles e as tags que cada um recebe. */
  readonly manifesto: Manifesto | null;
}

/** Um nome interno novo, tirado do nome mostrado, sem repetir: "Pântano salgado" vira `pantano_salgado`. */
function novoId(nome: string, usados: readonly string[]): string {
  const base =
    normalizarNome(nome)
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(?=\d)/, 'n_') || 'novo';
  let id = base;
  for (let n = 2; usados.includes(id); n++) {
    id = `${base}_${n}`;
  }
  return id;
}

/**
 * As regras da viagem no hexcrawl: tamanho do hex, horas, ritmos, tags de terreno e as tags
 * de cada tile. Mudança com problema não vale, como no resto da tela.
 */
export function SecaoViagemRegras({ regras, editar, mestre, manifesto }: SecaoViagemProps) {
  const { viagem } = regras;
  const mudar = (mudancas: Partial<RegrasDeViagem>, campo: string, avisar = true) =>
    editar({ ...regras, viagem: { ...viagem, ...mudancas } }, `viagem-${campo}`, avisar);
  const unico = (nome: string) => `${nome}-${crypto.randomUUID()}`;

  const mudarRitmo = (id: string, mudancas: Partial<RitmoDeViagem>, campo: string) =>
    mudar({ ritmos: viagem.ritmos.map((r) => (r.id === id ? { ...r, ...mudancas } : r)) }, `ritmo-${id}-${campo}`);
  const mudarTag = (id: string, mudancas: Partial<TagDeTerreno>, campo: string) =>
    mudar({ tags: viagem.tags.map((t) => (t.id === id ? { ...t, ...mudancas } : t)) }, `tag-${id}-${campo}`);

  /** Tirar uma tag também a tira das exceções dos tiles, para elas não citarem uma tag que não existe. */
  const tirarTag = (id: string) =>
    mudar(
      {
        tags: viagem.tags.filter((t) => t.id !== id),
        tagsPorTile: Object.fromEntries(
          Object.entries(viagem.tagsPorTile).map(([tile, tags]) => [tile, tags.filter((t) => t !== id)]),
        ),
      },
      unico('tirar-tag'),
    );

  const tiles = manifesto ? manifesto.assets.filter((a) => a.tipo === 'tile').map((a) => a.id) : [];

  const escolherTags = (tile: string, tags: readonly string[] | null) => {
    const tagsPorTile = { ...viagem.tagsPorTile };
    if (tags === null) {
      delete tagsPorTile[tile];
    } else {
      tagsPorTile[tile] = tags;
    }
    mudar({ tagsPorTile }, unico(`tile-${tile}`));
  };

  return (
    <section className="ficha-secao">
      <h3>Viagem no mapa</h3>
      <p className="tela-dica">
        O tempo de um passo é o tamanho do hex dividido pela velocidade do ritmo, multiplicado pelas tags do hex de onde o
        grupo sai. As tags de um hex se multiplicam (montanha ×2 com neve ×1,5 dá ×3).
      </p>
      <div className="formulario">
        <CampoNumero rotulo="Tamanho do hex (km)" minimo={0} valor={viagem.kmPorHex} aoMudar={(v) => v !== null && mudar({ kmPorHex: v }, 'km')} />
        <CampoNumero
          rotulo="Horas de viagem por dia (depois, marcha forçada)"
          minimo={0}
          maximo={24}
          valor={viagem.horasPorDia}
          aoMudar={(v) => v !== null && mudar({ horasPorDia: v }, 'horas-dia')}
        />
        <CampoNumero
          rotulo="Hora da partida pela manhã"
          minimo={0}
          maximo={23}
          valor={viagem.horaDaPartida}
          aoMudar={(v) => v !== null && mudar({ horaDaPartida: v }, 'partida')}
        />
        <CampoNumero
          rotulo="Horas mínimas do descanso longo"
          minimo={0}
          maximo={24}
          valor={viagem.horasDeDescanso}
          aoMudar={(v) => v !== null && mudar({ horasDeDescanso: v }, 'descanso-longo')}
        />
        <CampoNumero
          rotulo="Horas do descanso curto"
          minimo={0}
          maximo={24}
          valor={viagem.horasDeDescansoCurto}
          aoMudar={(v) => v !== null && mudar({ horasDeDescansoCurto: v }, 'descanso-curto')}
        />
      </div>

      <h4 className="regras-subtitulo">Ritmos</h4>
      <div className="editor-lista regras-lista">
        {viagem.ritmos.map((r) => (
          <div key={r.id} className="editor-lista-item">
            <div className="editor-lista-campos">
              <CampoTexto rotulo="Nome" valor={r.nome} aoMudar={(nome) => mudarRitmo(r.id, { nome }, 'nome')} />
              <CampoNumero rotulo="Velocidade (km/h)" minimo={0} valor={r.kmPorHora} aoMudar={(v) => v !== null && mudarRitmo(r.id, { kmPorHora: v }, 'km')} />
              <CampoTexto rotulo="O que muda na mesa" largo valor={r.nota} aoMudar={(nota) => mudarRitmo(r.id, { nota }, 'nota')} />
              <p className="regras-id">
                Um hex leva {numeroNaTela(Math.round((viagem.kmPorHex / r.kmPorHora) * 100) / 100)} h em terreno aberto.
              </p>
            </div>
            {mestre && (
              <div className="regras-acoes">
                <button
                  type="button"
                  disabled={viagem.ritmos.length <= 1}
                  title="Tirar este ritmo (um grupo que o usava passa ao normal)"
                  onClick={() => mudar({ ritmos: viagem.ritmos.filter((x) => x.id !== r.id) }, unico('tirar-ritmo'))}
                >
                  Tirar
                </button>
              </div>
            )}
          </div>
        ))}
        {mestre && (
          <CriarNovo
            rotulo="+ Ritmo"
            dica="Nome do novo ritmo, como Marcha"
            aoCriar={(nome) =>
              mudar(
                { ritmos: [...viagem.ritmos, { id: novoId(nome, viagem.ritmos.map((r) => r.id)), nome, kmPorHora: 4.5, nota: '' }] },
                unico('novo-ritmo'),
              )
            }
          />
        )}
      </div>

      <h4 className="regras-subtitulo">Tags de terreno</h4>
      <p className="tela-dica">
        Cada tile recebe as tags cujas palavras aparecem no nome do arquivo dele (sem diferenciar maiúsculas). Um guia
        tira a penalidade da tag; tirar uma tag desfaz os efeitos de guia dela nas fichas.
      </p>
      <div className="editor-lista regras-lista">
        {viagem.tags.map((t) => (
          <div key={t.id} className="editor-lista-item">
            <div className="editor-lista-campos">
              <CampoTexto rotulo="Nome" valor={t.nome} aoMudar={(nome) => mudarTag(t.id, { nome }, 'nome')} />
              <CampoNumero
                rotulo="Multiplica o tempo por"
                minimo={0}
                valor={t.multiplicador}
                aoMudar={(v) => v !== null && mudarTag(t.id, { multiplicador: v }, 'multiplicador')}
              />
              <label className="campo-marcar">
                <input
                  type="checkbox"
                  checked={t.intransponivel}
                  onChange={(e) => mudarTag(t.id, { intransponivel: e.target.checked }, unico('intransponivel'))}
                />
                Ninguém entra (intransponível)
              </label>
              <label className="campo-marcar">
                <input type="checkbox" checked={t.navegavel} onChange={(e) => mudarTag(t.id, { navegavel: e.target.checked }, unico('navegavel'))} />
                Barcos entram e andam (navegável)
              </label>
              <CampoLinhas
                rotulo="Palavras do nome do arquivo (uma por linha)"
                valores={t.palavras}
                aoMudar={(palavras) => mudarTag(t.id, { palavras }, 'palavras')}
              />
              <p className="regras-id">
                Nome interno: <code>{t.id}</code>
                {!t.intransponivel && (
                  <>
                    {' '}
                    · guia nas fichas: <code>guia_{t.id}</code>
                  </>
                )}
              </p>
            </div>
            {mestre && (
              <div className="regras-acoes">
                <button type="button" title="Tirar esta tag" onClick={() => tirarTag(t.id)}>
                  Tirar
                </button>
              </div>
            )}
          </div>
        ))}
        {mestre && (
          <CriarNovo
            rotulo="+ Tag"
            dica="Nome da nova tag, como Estrada"
            aoCriar={(nome) =>
              mudar(
                {
                  tags: [
                    ...viagem.tags,
                    {
                      id: novoId(nome, viagem.tags.map((t) => t.id)),
                      nome,
                      multiplicador: 1,
                      intransponivel: false,
                      navegavel: false,
                      palavras: [],
                    },
                  ],
                },
                unico('nova-tag'),
              )
            }
          />
        )}
      </div>

      <h4 className="regras-subtitulo">Tags de cada tile</h4>
      <p className="tela-dica">
        O que cada tile recebe pelo nome do arquivo. Se algum estiver errado, escolha as tags dele à mão.
      </p>
      {tiles.length === 0 && <p className="tela-dica">Carregando os tiles…</p>}
      <div className="regras-tiles">
        {tiles.map((tile) => {
          const escolhidas = viagem.tagsPorTile[tile];
          const tags = tagsDoTile(viagem, tile);
          const bloqueia = tags.some((t) => t.intransponivel);
          return (
            <div key={tile} className="regras-tile">
              <div className="regras-tile-cabecalho">
                <strong title={tile}>{nomeAmigavel(tile)}</strong>
                <span className="regras-tile-total">
                  {bloqueia ? 'não dá para entrar' : `tempo ×${numeroNaTela(multiplicadorDasTags(tags))}`}
                </span>
              </div>
              {escolhidas ? (
                <div className="regras-tile-escolha">
                  {viagem.tags.map((t) => (
                    <label key={t.id} className="campo-marcar">
                      <input
                        type="checkbox"
                        checked={escolhidas.includes(t.id)}
                        onChange={(e) =>
                          escolherTags(
                            tile,
                            viagem.tags.filter((x) => (x.id === t.id ? e.target.checked : escolhidas.includes(x.id))).map((x) => x.id),
                          )
                        }
                      />
                      {t.nome}
                    </label>
                  ))}
                  <span className="regras-tile-mao">(escolhido à mão)</span>
                  {mestre && (
                    <button type="button" onClick={() => escolherTags(tile, null)}>
                      Voltar ao automático
                    </button>
                  )}
                </div>
              ) : (
                <div className="regras-tile-escolha">
                  <span>{tags.length > 0 ? tags.map((t) => t.nome).join(' + ') : 'sem tags (terreno aberto)'}</span>
                  {mestre && (
                    <button type="button" onClick={() => escolherTags(tile, tags.map((t) => t.id))}>
                      Escolher à mão
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

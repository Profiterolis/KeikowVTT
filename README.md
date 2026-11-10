# KeikowVTT

Um Virtual Tabletop pessoal para jogar RPG de mesa com amigos. O projeto começa com regras parecidas com D&D 5e e tem como objetivo oferecer, especialmente nas cenas táticas, uma experiência 2D inspirada em CRPGs: movimentação medida, ações com custos e feedback visual.

## O que já está no projeto

- Editor local de mapas hexagonais, com terrenos, decorações, zoom e câmera.
- Salvamento automático no navegador e importação/exportação de mapas.
- Informações por hex, incluindo notas com visibilidade configurável.
- Fog of war e modo de visualização para jogadores.
- Campanhas com compêndio, regras próprias e permissões.
- Fichas de personagens, NPCs e monstros, com inventário, itens, efeitos, rolagens e ações.
- Pacote importável do SRD 5.1 em português.
- Assistente de criação de personagem e subida de nível em desenvolvimento.

O armazenamento é local nesta etapa. Contas, sincronização online, chat e combate tático com movimento medido fazem parte dos planos futuros, não das funcionalidades atuais.

## Tecnologias

- React, TypeScript e Vite
- PixiJS v8 e `pixi-viewport`
- Vitest
- IndexedDB para armazenamento local

## Começar

Instale as dependências:

```bash
npm install
```

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Abra no navegador o endereço informado pelo Vite no terminal.

## Comandos disponíveis

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Inicia o app em modo de desenvolvimento. |
| `npm test` | Executa os testes. |
| `npm run build` | Verifica os tipos TypeScript e gera a versão de produção. |
| `npm run preview` | Abre localmente uma prévia da versão de produção. |
| `npm run assets` | Gera os assets de `public/assets/` a partir de `Hex Samples/`. |
| `npm run srd` | Gera os pacotes de conteúdo do SRD e atualiza `CREDITOS.md`. |

## Organização do código

O código é dividido em camadas para separar as regras da interface e da apresentação visual:

- `src/core/` — estado e regras do jogo, em TypeScript puro.
- `src/render/` — desenho e animação da cena com PixiJS.
- `src/ui/` — interface e telas em React.
- `src/net/` — persistência local e base para futuras integrações de rede.
- `scripts/` — ferramentas para gerar assets e pacotes de conteúdo.

## Princípios do projeto

- A lógica do jogo não depende de React nem de PixiJS.
- Os dados do mapa são separados das imagens que os representam.
- Hexes usam coordenadas axiais `(q, r)`, não pixels, como identidade.
- Ações alteram o estado do jogo, facilitando histórico e futura sincronização.
- Regras, itens e habilidades são representados como dados sempre que possível.
- A visibilidade de informações é explícita, incluindo notas públicas e privadas.
- Assets são carregados de pastas e manifestos, em vez de ficarem embutidos no código.

## Roadmap

O plano geral inclui instâncias táticas separadas, token de grupo no hexcrawl, sincronização online, contas e campanhas compartilhadas, chat com rolagens e uma camada de combate com movimento, ações e efeitos visuais. Essas etapas serão desenvolvidas gradualmente.

Para acompanhar o status detalhado e as decisões do projeto, consulte [`CLAUDE.md`](CLAUDE.md). Ideias futuras estão em [`IDEIAS.md`](IDEIAS.md).

## Créditos e conteúdo

O conteúdo do SRD 5.1 incluído no projeto é disponibilizado sob a licença CC BY 4.0. Consulte [`CREDITOS.md`](CREDITOS.md) para os créditos e atribuições exigidos.

O repositório não declara uma licença geral para o código do projeto. Consulte o responsável antes de reutilizar ou distribuir esse código ou outros materiais do repositório.
```****
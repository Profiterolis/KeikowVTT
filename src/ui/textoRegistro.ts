import type { Participante } from '../core/campanha';
import type { EntradaRegistro, TipoEvento } from '../core/registro';

const umOuVarios =
  (um: string, varios: (n: number) => string) =>
  (n: number): string =>
    n === 1 ? um : varios(n);

const fixo = (texto: string) => () => texto;

/** Escrito para cada tipo de ação: o compilador avisa se faltar uma ação nova aqui. */
const DESCRICOES: Readonly<Record<TipoEvento, (quantidade: number) => string>> = {
  ColocarTile: umOuVarios('pintou um hex', (n) => `pintou ${n} hexes`),
  RemoverTile: umOuVarios('apagou um hex', (n) => `apagou ${n} hexes`),
  ColocarDecoracao: fixo('colocou uma decoração'),
  MoverDecoracao: fixo('moveu uma decoração'),
  RemoverDecoracao: umOuVarios('apagou uma decoração', (n) => `apagou ${n} decorações`),
  CarregarMapa: fixo('abriu ou criou um mapa'),
  EditarInformacaoHex: fixo('editou o nome ou a descrição de um hex'),
  AdicionarNota: fixo('adicionou uma nota'),
  EditarNota: fixo('editou uma nota'),
  DefinirVisibilidadeNota: fixo('mudou quem vê uma nota'),
  RemoverNota: fixo('apagou uma nota'),
  RevelarHex: umOuVarios('revelou um hex', (n) => `revelou ${n} hexes`),
  OcultarHex: umOuVarios('ocultou um hex', (n) => `ocultou ${n} hexes`),
  DefinirAparenciaOculta: fixo('mudou a aparência dos hexes não vistos'),
  PosicionarGrupo: fixo('posicionou o grupo'),
  MoverGrupo: umOuVarios('moveu o grupo um hex', (n) => `moveu o grupo ${n} hexes`),
  AdicionarMembro: fixo('pôs uma ficha no grupo'),
  RemoverMembro: fixo('tirou uma ficha do grupo'),
  DefinirLider: fixo('mudou o líder do grupo'),
  DefinirRitmo: fixo('mudou o ritmo do grupo'),
  DefinirVisaoExtra: fixo('mudou a visão extra de um membro do grupo'),
  TravarMovimento: fixo('travou ou destravou o movimento do grupo'),
  Descansar: fixo('fez o grupo descansar'),
  ConcluirDescanso: fixo('aplicou um descanso numa ficha'),
  AvancarTempo: fixo('avançou o tempo'),
  AvancarAteAManha: fixo('avançou o tempo até a manhã'),
  AcertarRelogio: fixo('acertou o relógio'),
  AnotarNaViagem: fixo('anotou no diário de viagem'),
  ComecarNoite: fixo('começou a noite do grupo'),
  EscolherNoturna: fixo('escolheu uma ação noturna'),
  ResolverTurno: fixo('resolveu um turno da noite'),
  CancelarNoite: fixo('cancelou a noite do grupo'),
  BloquearNoite: fixo('bloqueou ou liberou as ações noturnas'),
  PedirEleicao: fixo('pediu uma eleição do líder'),
  Votar: fixo('votou na eleição do líder'),
  EncerrarEleicao: fixo('encerrou a eleição do líder'),
  CancelarEleicao: fixo('cancelou a eleição do líder'),
  DesempatarEleicao: fixo('desempatou a eleição do líder'),
  DesfazerViagem: fixo('desfez o último acontecimento da viagem'),
  CarregarGrupo: fixo('abriu o grupo de um arquivo'),
  RenomearCampanha: fixo('renomeou a campanha'),
  AdicionarParticipante: fixo('adicionou um jogador'),
  RenomearParticipante: fixo('renomeou um participante'),
  RemoverParticipante: fixo('removeu um jogador'),
  CarregarCampanha: fixo('abriu uma campanha de um arquivo'),
  EditarRegras: fixo('mudou as regras'),
  CarregarRegras: fixo('abriu regras de um arquivo'),
  DesfazerRegras: fixo('desfez uma mudança nas regras'),
  RefazerRegras: fixo('refez uma mudança nas regras'),
  AdicionarEntrada: fixo('criou uma entrada no compêndio'),
  EditarEntrada: fixo('editou uma entrada do compêndio'),
  DuplicarEntrada: fixo('duplicou uma entrada do compêndio'),
  RemoverEntrada: fixo('apagou uma entrada do compêndio'),
  ImportarEntradas: fixo('importou entradas para o compêndio'),
  CarregarCompendio: fixo('abriu um compêndio de um arquivo'),
  Desfazer: fixo('desfez uma edição do mapa'),
  Refazer: fixo('refez uma edição do mapa'),
  DesfazerCompendio: fixo('desfez uma edição do compêndio'),
  RefazerCompendio: fixo('refez uma edição do compêndio'),
  CriarFicha: fixo('criou uma ficha'),
  EditarFicha: fixo('editou uma ficha'),
  RemoverFicha: fixo('apagou uma ficha'),
  EditarFichas: fixo('passou itens entre fichas'),
  CarregarFichas: fixo('abriu fichas de um arquivo'),
  DesfazerFichas: fixo('desfez uma edição de ficha'),
  RefazerFichas: fixo('refez uma edição de ficha'),
  CriarInstancia: fixo('criou uma instância'),
  EditarInstancia: fixo('editou uma instância'),
  DuplicarInstancia: fixo('duplicou uma instância'),
  ApagarInstancia: fixo('apagou uma instância'),
  LevarParaCena: fixo('levou jogadores a outra cena'),
  DefinirCenaInicial: fixo('mudou a cena inicial da campanha'),
  CarregarInstancias: fixo('abriu instâncias de um arquivo'),
  DesfazerInstancias: fixo('desfez uma edição de instância'),
  RefazerInstancias: fixo('refez uma edição de instância'),
};

export function nomeDoAutor(autorId: string, participantes: readonly Participante[]): string {
  const participante = participantes.find((p) => p.id === autorId);
  if (!participante) {
    return 'Participante removido';
  }
  return participante.nome.trim() || 'Sem nome';
}

export function textoDaEntrada(
  entrada: EntradaRegistro,
  participantes: readonly Participante[],
): string {
  // Um salvamento pode trazer um tipo de ação que esta versão ainda não conhece.
  const descrever = DESCRICOES[entrada.tipo] ?? fixo('fez uma ação');
  const local =
    entrada.coord && entrada.quantidade === 1
      ? ` (q ${entrada.coord.q}, r ${entrada.coord.r})`
      : '';
  return `${nomeDoAutor(entrada.autorId, participantes)} ${descrever(entrada.quantidade)}${local}`;
}

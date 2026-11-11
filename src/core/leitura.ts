/**
 * Peças comuns para ler dados guardados. Ficam num arquivo próprio, sem dependências,
 * para que qualquer parte do `core/` possa usá-las sem criar importações circulares.
 */
export class ErroDeFormato extends Error {}

export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export function exigir(condicao: boolean, mensagem: string): asserts condicao {
  if (!condicao) {
    throw new ErroDeFormato(mensagem);
  }
}

/**
 * Guarda as imagens da campanha no navegador (IndexedDB), pelo id que sai do conteúdo.
 * No online (Fase 7), o mesmo papel passa para o Storage do servidor.
 */
import { calcularIdDaImagem, problemaNaImagem } from '../core/imagens';
import { abrirBanco, COLECAO_IMAGENS } from './armazenamentoLocal';

export interface BancoDeImagens {
  /** Guarda um arquivo escolhido pelo usuário e devolve o id. Lança um `Error` com o motivo se não der. */
  guardar(arquivo: Blob): Promise<string>;
  /** Guarda bytes vindos do arquivo da campanha, já com o id conferido. */
  guardarBytes(id: string, tipo: string, bytes: Uint8Array): Promise<void>;
  obter(id: string): Promise<Blob | null>;
  /** Um endereço para mostrar a imagem na tela (`<img src>` ou textura), ou `null` se ela não está guardada. */
  endereco(id: string): Promise<string | null>;
}

function pedir<T>(pedido: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rejeitar) => {
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

export function criarBancoDeImagens(): BancoDeImagens {
  let conexao: Promise<IDBDatabase> | null = null;
  // Um endereço por imagem enquanto a página estiver aberta: criar um a cada desenho gastaria memória.
  const enderecos = new Map<string, Promise<string | null>>();

  const obterConexao = () => {
    conexao ??= abrirBanco().catch((erro: unknown) => {
      conexao = null;
      throw erro;
    });
    return conexao;
  };

  const gravar = async (id: string, blob: Blob) => {
    const banco = await obterConexao();
    await new Promise<void>((resolver, rejeitar) => {
      const transacao = banco.transaction(COLECAO_IMAGENS, 'readwrite');
      transacao.objectStore(COLECAO_IMAGENS).put(blob, id);
      transacao.oncomplete = () => resolver();
      transacao.onerror = () => rejeitar(transacao.error);
      transacao.onabort = () => rejeitar(transacao.error ?? new Error('Sem espaço para guardar a imagem.'));
    });
    // Uma imagem que faltava agora existe: o endereço antigo (nulo) não vale mais.
    enderecos.delete(id);
  };

  const obter = async (id: string) => {
    const banco = await obterConexao();
    const valor = await pedir(banco.transaction(COLECAO_IMAGENS).objectStore(COLECAO_IMAGENS).get(id));
    return valor instanceof Blob ? valor : null;
  };

  return {
    async guardar(arquivo) {
      const problema = problemaNaImagem(arquivo.type, arquivo.size);
      if (problema) {
        throw new Error(problema);
      }
      const id = await calcularIdDaImagem(await arquivo.arrayBuffer());
      if (!(await obter(id))) {
        await gravar(id, arquivo);
      }
      return id;
    },

    async guardarBytes(id, tipo, bytes) {
      if (!(await obter(id))) {
        await gravar(id, new Blob([bytes.slice()], { type: tipo }));
      }
    },

    obter,

    endereco(id) {
      let endereco = enderecos.get(id);
      if (!endereco) {
        endereco = obter(id)
          .then((blob) => (blob ? URL.createObjectURL(blob) : null))
          .catch(() => null);
        enderecos.set(id, endereco);
      }
      return endereco;
    },
  };
}

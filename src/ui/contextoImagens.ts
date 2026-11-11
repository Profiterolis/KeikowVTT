import { createContext, useContext, useEffect, useState } from 'react';
import type { BancoDeImagens } from '../net/imagens';

/** O banco de imagens da campanha, para qualquer tela que mostre ou escolha imagens. */
export const ContextoImagens = createContext<BancoDeImagens | null>(null);

export function useBancoDeImagens(): BancoDeImagens | null {
  return useContext(ContextoImagens);
}

/** O endereço de uma imagem para o `<img src>`, ou `null` enquanto carrega (ou se ela não existe). */
export function useEnderecoDaImagem(id: string | null | undefined): string | null {
  const banco = useBancoDeImagens();
  const [carregado, setCarregado] = useState<{ id: string; endereco: string | null } | null>(null);
  useEffect(() => {
    if (!id || !banco) {
      return;
    }
    let ativo = true;
    void banco.endereco(id).then((endereco) => {
      if (ativo) {
        setCarregado({ id, endereco });
      }
    });
    return () => {
      ativo = false;
    };
  }, [id, banco]);
  return id && carregado?.id === id ? carregado.endereco : null;
}

import { useRef, useState, type DragEvent } from 'react';
import { useBancoDeImagens, useEnderecoDaImagem } from './contextoImagens';

/** Uma imagem pequena; sem imagem, mostra a inicial (como as cabeças do estandarte). */
export function MiniaturaImagem({
  id,
  nome,
  redonda = false,
  tamanho = 64,
}: {
  readonly id: string | null | undefined;
  readonly nome: string;
  readonly redonda?: boolean;
  readonly tamanho?: number;
}) {
  const endereco = useEnderecoDaImagem(id);
  const classe = `miniatura-imagem${redonda ? ' miniatura-redonda' : ''}`;
  return (
    <span className={classe} style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.45 }}>
      {endereco ? <img src={endereco} alt="" /> : (nome.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}

/**
 * Escolher, trocar ou tirar uma imagem: pelo botão ou arrastando um arquivo para a miniatura.
 * `substituta` aparece apagada quando não há imagem própria (o token sem imagem usa o retrato).
 */
export function CampoImagem({
  rotulo,
  valor,
  aoMudar,
  nome,
  redonda = false,
  substituta,
  dicaSemImagem,
  desativado = false,
  motivo,
}: {
  readonly rotulo: string;
  readonly valor: string | undefined;
  readonly aoMudar: (id: string | undefined) => void;
  /** Para a inicial, quando não há imagem nenhuma. */
  readonly nome: string;
  readonly redonda?: boolean;
  readonly substituta?: string;
  readonly dicaSemImagem?: string;
  readonly desativado?: boolean;
  readonly motivo?: string | null;
}) {
  const banco = useBancoDeImagens();
  const seletor = useRef<HTMLInputElement>(null);
  const [problema, setProblema] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const bloqueado = desativado || !banco || guardando;

  const usarArquivo = async (arquivo: File | undefined) => {
    if (!arquivo || !banco) {
      return;
    }
    setProblema(null);
    setGuardando(true);
    try {
      aoMudar(await banco.guardar(arquivo));
    } catch (erro) {
      setProblema(erro instanceof Error ? erro.message : 'Não foi possível guardar a imagem.');
    } finally {
      setGuardando(false);
    }
  };

  const aoSoltar = (evento: DragEvent) => {
    evento.preventDefault();
    if (!bloqueado) {
      void usarArquivo(evento.dataTransfer.files[0]);
    }
  };

  return (
    <div className="campo campo-imagem" title={desativado ? (motivo ?? undefined) : undefined}>
      <span>{rotulo}</span>
      <div className="campo-imagem-corpo">
        <span
          className={valor ? undefined : 'campo-imagem-substituta'}
          onDragOver={(evento) => evento.preventDefault()}
          onDrop={aoSoltar}
        >
          <MiniaturaImagem id={valor ?? substituta} nome={nome} redonda={redonda} />
        </span>
        <div className="campo-imagem-acoes">
          <button type="button" disabled={bloqueado} onClick={() => seletor.current?.click()}>
            {guardando ? 'Guardando…' : valor ? 'Trocar' : 'Escolher imagem'}
          </button>
          {valor && (
            <button type="button" disabled={bloqueado} onClick={() => aoMudar(undefined)}>
              Tirar
            </button>
          )}
          {!valor && dicaSemImagem && <small className="tela-dica">{dicaSemImagem}</small>}
          {problema && <small className="campo-erro">{problema}</small>}
        </div>
      </div>
      <input
        ref={seletor}
        className="seletor-arquivo"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(evento) => {
          const arquivo = evento.currentTarget.files?.[0];
          // Sem isso, escolher o mesmo arquivo de novo não dispararia este evento.
          evento.currentTarget.value = '';
          void usarArquivo(arquivo);
        }}
      />
    </div>
  );
}

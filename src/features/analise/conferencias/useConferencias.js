/**
 * As medicoes do relatorio: carga, face (ativas x arquivadas), o cadastro
 * de maquinas que da' o grupo, e as ACOES que mudam dado no servidor.
 *
 * Toda acao segue o mesmo contrato: marca quem esta' ocupado (para travar
 * o botao certo), limpa o erro anterior, chama o servidor, avisa que
 * concluiu (e' ai' que a janela que pediu se fecha) e recarrega a lista.
 * Falha vira `erro` — e a tela e' quem decide ONDE mostra-lo, porque foi
 * erro guardado e nunca renderizado que fez "o arquivar nao funciona".
 *
 * A ordem "fechar a janela, depois recarregar" e' de proposito: a janela
 * nao pode ficar aberta dizendo "Gravando..." enquanto a lista atras dela
 * ja' esta' mudando.
 */
import { useEffect, useState } from 'react';
import { nomeChave } from '../../../domain/cronoanalise.js';
import {
  arquivarConferencia, arquivarConferencias, excluirConferencia, listarCadastroMaquinas,
  listarConferenciasServidor, renomearPecaConferencia, renomearPecaConferencias,
  salvarParadasConferencia,
} from '../../../lib/api.js';

export function useConferencias() {
  const [linhas, setLinhas] = useState([]);
  const [outras, setOutras] = useState(0);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  const [verArquivadas, setVerArquivadas] = useState(false);
  const [ocupado, setOcupado] = useState(null);

  useEffect(() => { carregar(verArquivadas); }, [verArquivadas]);

  /**
   * O GRUPO da maquina (0002 · FURADEIRA) vem do cadastro, ligado pelo
   * nome — a medicao grava texto, e a ligacao usa a mesma chave
   * normalizada do agrupamento. Falha de carga nao derruba o relatorio:
   * sem cadastro, as maquinas simplesmente aparecem sem grupo.
   */
  const [mapaGrupos, setMapaGrupos] = useState(() => new Map());
  useEffect(() => {
    listarCadastroMaquinas()
      .then(({ maquinas }) => {
        const mapa = new Map();
        for (const m of maquinas) {
          if (m.grupo_codigo) mapa.set(nomeChave(m.nome), `${m.grupo_codigo} · ${m.grupo_nome}`);
        }
        setMapaGrupos(mapa);
      })
      .catch(() => {});
  }, []);
  const grupoDe = (maquina) => mapaGrupos.get(nomeChave(maquina)) || null;

  async function carregar(arquivadas = verArquivadas) {
    setEstado('carregando');
    try {
      const r = await listarConferenciasServidor({ arquivadas });
      setLinhas(r.conferencias || []);
      setOutras(r.outras || 0);
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }

  /** O contrato de toda acao. Devolve se concluiu, para quem quiser saber. */
  async function executar(marca, acao, aoConcluir) {
    setOcupado(marca);
    setErro(null);
    let concluiu = false;
    try {
      await acao();
      concluiu = true;
      aoConcluir?.();
      await carregar();
    } catch (e) { setErro(e.message); }
    setOcupado(null);
    return concluiu;
  }

  const alternarArquivo = (c, aoConcluir) =>
    executar(c.id, () => arquivarConferencia(c.id, !c.arquivada), aoConcluir);

  /**
   * ARQUIVAR POR MAQUINA — o pedido de quem usa: a medicao chega uma a uma,
   * mas sai por posto ("a FURADEIRA 16 ja' foi analisada, tira ela do
   * relatorio"). Arquivar de linha em linha exigia um clique por medicao e
   * nao dava para saber quando tinha acabado.
   *
   * O lote e' exatamente o que esta' na tela sob aquele nome: os mesmos ids
   * das linhas visiveis. Assim o que se arquiva e' o que se ve — a mesma
   * regra do "imprime o que esta' na tela".
   */
  const alternarArquivoDaMaquina = (lote, aoConcluir) =>
    executar('lote', () => arquivarConferencias(lote.ids, lote.arquivada), aoConcluir);

  /**
   * RENOMEAR A PECA — o nome vem digitado do aparelho, e o mesmo produto
   * chega com grafias diferentes conforme quem mediu. No Ritmo por peca
   * isso vira duas linhas com metade das medicoes cada, e nenhuma delas
   * descreve a peca. Corrigir o texto e' o que junta as medicoes de novo.
   *
   * `tambemAsOutras` e' o coracao da correcao: renomear so' a linha aberta
   * deixaria as outras medicoes com a grafia velha — o problema continuaria
   * de pe'. Por isso o padrao e' corrigir todas as que tem o mesmo nome.
   */
  const gravarNomeDaPeca = ({ conferencia, nome, tambemAsOutras, irmas }, aoConcluir) =>
    executar(conferencia.id, () => (
      tambemAsOutras && irmas.length > 1
        ? renomearPecaConferencias(irmas, nome)
        : renomearPecaConferencia(conferencia.id, nome)
    ), aoConcluir);

  const gravarParadas = (c, paradas, aoConcluir) =>
    executar(c.id, () => salvarParadasConferencia(c.id, paradas), aoConcluir);

  const excluir = (c, aoConcluir) =>
    executar(c.id, () => excluirConferencia(c.id), aoConcluir);

  return {
    linhas, outras, estado, erro, ocupado, verArquivadas, mapaGrupos, grupoDe,
    limparErro: () => setErro(null),
    alternarArquivadas: () => setVerArquivadas((v) => !v),
    carregar,
    alternarArquivo, alternarArquivoDaMaquina, gravarNomeDaPeca, gravarParadas, excluir,
  };
}

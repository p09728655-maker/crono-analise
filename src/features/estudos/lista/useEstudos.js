/**
 * OS DADOS DA LISTA: os estudos ativos e os arquivados, numa ida so', e —
 * no PC — o cadastro de analistas e quem esta' neste computador.
 *
 * As duas listas vem juntas para a contagem de arquivados existir antes
 * do clique: o botao "Arquivados" so' aparece quando ha' o que restaurar.
 *
 * O tablet so' lista o que esta' EM COLETA. Estudo concluido e' assunto de
 * analise: aparecer no chao de fabrica so' convida toque errado — e
 * restaurar um arquivado no PC nao pode reabri-lo para coleta.
 */
import { useCallback, useEffect, useState } from 'react';
import { listarArquivados, listarEstudos, listarUsuarios, quemSouEu } from '../../../lib/api.js';

export function useEstudos({ analise }) {
  const [estudos, setEstudos] = useState([]);
  const [arquivados, setArquivados] = useState([]);
  const [estado, setEstado] = useState('carregando');
  const [erro, setErro] = useState(null);
  // Cadastro de analistas e quem esta neste PC. So' no modo Analise: no
  // tablet nao ha ninguem para identificar nem estudo para criar.
  const [analistas, setAnalistas] = useState([]);
  const [eu, setEu] = useState(null);

  useEffect(() => { carregar(); }, []);

  const carregarIdentificacao = useCallback(() => {
    if (!analise) return;
    // Falha em silencio: cadastro de analista nao pode impedir de ver estudo.
    // Tablet pareado (papel coletor) mora na mesma tabela mas nao e' gente:
    // nao pode aparecer como opcao de analista.
    listarUsuarios()
      .then((lista) => setAnalistas(lista.filter((u) => u.ativo && u.papel !== 'coletor')))
      .catch(() => {});
    quemSouEu().then(setEu).catch(() => {});
  }, [analise]);

  useEffect(() => { carregarIdentificacao(); }, [carregarIdentificacao]);

  async function carregar() {
    setEstado('carregando');
    try {
      const [r, a] = await Promise.all([listarEstudos(), listarArquivados()]);
      const lista = r.estudos || [];
      setEstudos(analise ? lista : lista.filter((e) => e.status !== 'concluido'));
      setArquivados(a.estudos || []);
      setEstado('pronto');
    } catch (e) {
      setErro(e.message);
      setEstado('erro');
    }
  }

  return { estudos, arquivados, estado, erro, carregar, analistas, eu, setEu, carregarIdentificacao };
}

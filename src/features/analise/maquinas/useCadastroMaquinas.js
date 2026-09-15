/**
 * O CADASTRO no servidor: maquinas, grupos e toda acao que os altera.
 *
 * Toda acao passa por `aplicar`: trava os botoes, limpa o erro anterior,
 * executa, RECARREGA o cadastro inteiro e reavisa o resto do app
 * (`adotarMaquinas`) — o celular oferece essa lista, e ela nao pode ficar
 * velha porque alguem renomeou uma maquina no PC. Devolve se deu certo,
 * para quem chamou saber se pode fechar o formulario.
 *
 * Falha de carga deixa `maquinas` em null: "nenhuma cadastrada" e "nao deu
 * para saber" sao afirmacoes diferentes (mesma decisao do cadastro de
 * motivos).
 */
import { useEffect, useState } from 'react';
import { listarCadastroMaquinas } from '../../../lib/api.js';
import { adotarMaquinas } from '../../../lib/maquinas.js';

export function useCadastroMaquinas() {
  const [maquinas, setMaquinas] = useState(null);
  const [grupos, setGrupos] = useState([]);
  const [erro, setErro] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    listarCadastroMaquinas()
      .then((c) => { setMaquinas(c.maquinas); setGrupos(c.grupos); })
      .catch((e) => setErro(e.message));
  }, []);

  async function aplicar(fn) {
    setOcupado(true);
    setErro(null);
    let ok = true;
    try {
      await fn();
      const c = await listarCadastroMaquinas();
      setMaquinas(c.maquinas);
      setGrupos(c.grupos);
      adotarMaquinas(c);
    } catch (e) { setErro(e.message); ok = false; }
    setOcupado(false);
    return ok;
  }

  const recarregar = () => aplicar(() => Promise.resolve());

  return { maquinas, grupos, erro, ocupado, aplicar, recarregar };
}

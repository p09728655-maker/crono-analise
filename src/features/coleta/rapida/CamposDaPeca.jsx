import SeletorMaquina from '../../../components/SeletorMaquina.jsx';
import { vibrar } from '../../../lib/hooks.js';
import { est } from './estilos.js';

/**
 * O campo da maquina desta tela — a regra mora em SeletorMaquina, que o
 * Novo estudo tambem usa; aqui vao so' os estilos da coleta (tema escuro,
 * alvo de dedo) e a vibracao que confirma a escolha sem olhar.
 */
export function CampoMaquina({ valor, aoTrocar }) {
  return (
    <SeletorMaquina
      valor={valor}
      aoTrocar={aoTrocar}
      aria="Máquina"
      ariaTexto="Nome da máquina"
      estilos={{ input: est.inputTexto, select: est.selectMaquina, link: est.linkCadastro }}
      aoEscolher={() => vibrar(30)}
    />
  );
}

/**
 * Ciclos de furacao da peca — quantos acionamentos do motor por peca.
 *
 * Na furadeira isso e' dado de processo, nao detalhe: uma lateral fura num
 * ciclo; ha' pecas em que o motor sobe e depois desce (2) e chega a 3.
 * Sem registrar, a mesma maquina parece lenta na peca de 3 ciclos — quando
 * o que mudou foi a peca, nao o posto. Tres botoes grandes, sem digitacao:
 * e' escolha de um toque, de luva, e 3 e' o maximo que o processo tem.
 */
export function CiclosFuracao({ valor, aoTrocar, compacto }) {
  return (
    <div style={est.blocoCiclos}>
      <span style={est.rotuloCampo}>ACIONAMENTOS DO MOTOR POR PEÇA</span>
      <div style={est.linhaCiclos} role="radiogroup" aria-label="Ciclos de furação por peça">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valor === n}
            style={{ ...est.botaoCiclo, ...(valor === n ? est.botaoCicloAtivo : {}) }}
            onClick={() => { aoTrocar(n); vibrar(30); }}
          >
            {n} {n === 1 ? 'ciclo' : 'ciclos'}
          </button>
        ))}
      </div>
      {/* No resultado do ao vivo o espaco vertical e' curto e o conceito
          ja' foi lido no formulario: a explicacao fica so' la'. */}
      {!compacto && (
        <span style={est.dicaParada}>
          Quantas vezes o motor é acionado para furar uma peça. Com 2 ou 3, o
          resultado mostra também o ciclo do motor — comparável entre peças.
        </span>
      )}
    </div>
  );
}


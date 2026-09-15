/**
 * O DENOMINADOR DO TAKT: jornada, setup e o que sobra para produzir.
 *
 * Os quatro campos vivem como TEXTO — campo vazio precisa ser distinguivel
 * de zero ("nao sei" nao e' "nao tem"), e e' o vazio que apaga o valor no
 * cadastro. A conta e' refeita a cada tecla, antes de salvar, para a pessoa
 * ver o efeito do numero que esta' digitando.
 *
 * HORAS DISPONIVEIS nao tem padrao. Jornada e' decisao de turno; assumir
 * 44 h daria veredito sobre um turno que talvez nao exista.
 */
import { useEffect, useState } from 'react';
import { contaDasHoras, horasDeSetup } from '../../../domain/demandaSemanal.js';

const comoTexto = (v) => (v != null ? String(v) : '');
/** Vazio e' `null` (nao sei), nao zero. Virgula de teclado brasileiro vale. */
const numero = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')));

export function useTempoDisponivel(grupo, maquinasDoGrupo) {
  const [horas, setHoras] = useState('');
  const [diasSemana, setDiasSemana] = useState('');
  const [setupsDia, setSetupsDia] = useState('');
  const [setupMin, setSetupMin] = useState('');

  useEffect(() => {
    setHoras(comoTexto(grupo?.horas_semana));
    setDiasSemana(comoTexto(grupo?.dias_semana));
    setSetupsDia(comoTexto(grupo?.setups_dia));
    setSetupMin(comoTexto(grupo?.setup_min));
  }, [grupo?.id, grupo?.horas_semana, grupo?.dias_semana, grupo?.setups_dia, grupo?.setup_min]);

  const horasNum = Number(String(horas).replace(',', '.')) || 0;
  const setupHoras = horasDeSetup({
    setupsDia: numero(setupsDia), dias: numero(diasSemana), minutos: numero(setupMin),
  });
  // Numeros DERIVADOS um do outro (dominio): setup do grupo = por maquina
  // exibido x maquinas; produtivas = jornada exibida − setup exibido. E' a
  // unica regra em que "264 − 50 = 214" fecha em toda combinacao.
  const conta = contaDasHoras({ horas: horasNum, setupHoras, maquinas: maquinasDoGrupo });
  const setupComeTudo = setupHoras != null && horasNum > 0 && setupHoras >= horasNum;

  /** O que sobe para o cadastro — e o que a formula na tela exibe. */
  const valores = {
    horasSemana: numero(horas),
    diasSemana: numero(diasSemana),
    setupsDia: numero(setupsDia),
    setupMin: numero(setupMin),
  };

  const houveMudanca = [
    [horas, grupo?.horas_semana], [diasSemana, grupo?.dias_semana],
    [setupsDia, grupo?.setups_dia], [setupMin, grupo?.setup_min],
  ].some(([campo, salvo]) => numero(campo) !== (salvo == null ? null : Number(salvo)));

  return {
    horas, setHoras, diasSemana, setDiasSemana, setupsDia, setSetupsDia, setupMin, setSetupMin,
    horasNum, setupHoras, conta, setupComeTudo, valores, houveMudanca,
  };
}

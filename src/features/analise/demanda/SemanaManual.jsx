/**
 * UMA SEMANA DIGITADA — para a semana reprogramada ou quando a planilha
 * nao esta' a' mao.
 *
 * Lida pelas MESMAS regras da colagem: "S38" ou "038-26", data
 * dd/mm/aaaa, pecas com ponto de milhar. Inicio e' obrigatorio aqui de
 * proposito — na colagem ele e' tolerado por causa de planilha antiga;
 * digitando uma semana, nao ha' desculpa para o casamento por numero, que
 * erra em toda semana com feriado.
 *
 * A previa mostra o que vai ser gravado, e o que ja' esta' gravado no
 * lugar: substituir sem ver o valor antigo e' como se apaga um numero
 * certo sem perceber.
 */
import { useState } from 'react';
import {
  chaveSemana, comoDia, dataIso, emUtc, lerCodigoSemana, lerDataPtBr, numeroPtBr,
} from '../../../domain/demandaSemanal.js';
import { est } from './estilos.js';

const VAZIO = { semana: '', inicio: '', pecas: '' };

export default function SemanaManual({ semanas, ocupado, aoIncluir }) {
  const [manual, setManual] = useState(VAZIO);

  const inicio = lerDataPtBr(manual.inicio);
  const semana = lerCodigoSemana(manual.semana, {
    ano: inicio?.getUTCFullYear() ?? new Date().getFullYear(),
  });
  const pecas = numeroPtBr(manual.pecas);

  const preenchido = [manual.semana, manual.inicio, manual.pecas].some((v) => v.trim() !== '');
  const problemas = [
    manual.semana.trim() !== '' && !semana && 'Semana no formato S38 ou 038-26.',
    manual.inicio.trim() !== '' && !inicio && 'Início no formato dd/mm/aaaa.',
    manual.pecas.trim() !== '' && !(pecas > 0) && 'Peças precisa ser um número maior que zero.',
  ].filter(Boolean);
  const pronto = Boolean(semana && inicio && pecas > 0);
  const jaGravada = pronto
    ? (semanas || []).find((s) => s.chave === chaveSemana(semana)) || null
    : null;

  // Limpa so' depois de gravar: falha de rede com os campos ja' vazios
  // devolveria o trabalho de digitar de novo.
  async function incluir() {
    const ok = await aoIncluir([{
      ano: semana.ano, numero: semana.numero, pecas, inicio: dataIso(inicio),
    }]);
    if (ok) setManual(VAZIO);
  }

  return (
    <div style={est.bloco}>
      <div style={est.blocoTitulo}>Incluir uma semana</div>
      <p style={est.blocoTexto}>
        Para uma semana reprogramada ou quando a planilha não está à mão. Semana como
        o PCP escreve (<strong>S38</strong>), início é o primeiro dia de produção dela
        (a data de CORTE MDF da aba), peças é o TOTAL SEMANA. Semana que já existe é
        substituída.
      </p>
      <div style={est.linhaCampos}>
        <label style={est.campoEstreito}>
          <span style={est.rotuloCampo}>Semana</span>
          <input
            type="text" style={est.input} value={manual.semana} disabled={ocupado}
            onChange={(ev) => setManual((m) => ({ ...m, semana: ev.target.value }))}
            placeholder="S38" aria-label="Semana"
          />
        </label>
        <label style={est.campoEstreito}>
          <span style={est.rotuloCampo}>Início</span>
          <input
            type="text" style={est.input} value={manual.inicio} disabled={ocupado}
            onChange={(ev) => setManual((m) => ({ ...m, inicio: ev.target.value }))}
            placeholder="08/09/2026" aria-label="Início" inputMode="numeric"
          />
        </label>
        <label style={est.campoEstreito}>
          <span style={est.rotuloCampo}>Peças</span>
          <input
            type="text" style={est.input} value={manual.pecas} disabled={ocupado}
            onChange={(ev) => setManual((m) => ({ ...m, pecas: ev.target.value }))}
            placeholder="121.900" aria-label="Peças" inputMode="numeric"
          />
        </label>
        <button
          type="button" style={pronto ? est.botaoPrimario : est.botaoSecundario}
          onClick={incluir} disabled={ocupado || !pronto}
        >
          {ocupado ? 'Gravando...' : (jaGravada ? 'Substituir semana' : 'Incluir semana')}
        </button>
      </div>
      {preenchido && (
        <div style={est.previa}>
          {pronto ? (
            <div style={est.previaTitulo}>
              {chaveSemana(semana)} · {comoDia(inicio)} a{' '}
              {comoDia(new Date(inicio.getTime() + (6 * 86400000)), { ano: true })} ·{' '}
              <strong>{pecas.toLocaleString('pt-BR')}</strong> peças
              {jaGravada && (
                <span style={est.previaItem}>
                  {' '}— hoje está com {jaGravada.pecas.toLocaleString('pt-BR')}
                  {jaGravada.inicio ? ` (início ${comoDia(emUtc(jaGravada.inicio))})` : ' (sem data)'}
                </span>
              )}
            </div>
          ) : (
            <div style={est.previaTitulo}>
              {problemas.length ? problemas.join(' ') : 'Preencha semana, início e peças.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

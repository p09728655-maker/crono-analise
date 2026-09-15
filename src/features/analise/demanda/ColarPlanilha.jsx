/**
 * A COLAGEM DA PLANILHA DO PCP — por onde a demanda entra de verdade.
 *
 * Redigitar 36 semanas e' onde nasce o numero trocado que ninguem confere.
 * A previa mostra o que foi reconhecido ANTES de gravar, com a data: e' ali
 * que o PCP percebe se a coluna INICIO da planilha aponta para a celula
 * certa. Depois de gravado, o erro ja' esta' no veredito.
 *
 * Aviso NAO impede gravar: a planilha real tem linha torta, e recusar tudo
 * por causa de uma devolveria o trabalho sem motivo.
 */
import { useMemo, useState } from 'react';
import { comoDia, emUtc, interpretarColagem } from '../../../domain/demandaSemanal.js';
import { est } from './estilos.js';

export default function ColarPlanilha({ ocupado, aoGravar }) {
  const [colagem, setColagem] = useState('');
  const lido = useMemo(() => interpretarColagem(colagem), [colagem]);

  // Limpa so' depois de gravar: falha de rede com a caixa ja' vazia
  // devolveria o trabalho de colar de novo.
  async function gravar() {
    const ok = await aoGravar(lido.semanas.map((s) => ({
      ano: s.ano, numero: s.numero, pecas: s.pecas, inicio: s.inicio,
    })));
    if (ok) setColagem('');
  }

  return (
    <div style={est.bloco}>
      <div style={est.blocoTitulo}>Colar da planilha do PCP</div>
      <p style={est.blocoTexto}>
        Copie as linhas da planilha (com o cabeçalho, se quiser) e cole aqui.
        Entendo as colunas <strong>SEMANA</strong> e <strong>TOTAL SEMANA</strong>,
        ignoro os totalizadores do rodapé e confiro o total contra a soma dos lotes.
        Gravar <strong>mescla</strong>: semana que não veio na colagem fica como está.
      </p>
      <textarea
        style={est.areaColagem} value={colagem} disabled={ocupado}
        onChange={(ev) => setColagem(ev.target.value)}
        placeholder={'SEMANA\tINÍCIO\tLOTE 1\t...\tTOTAL SEMANA\nS02\t08/01/2026\t25.000\t...\t128.250'}
        rows={6}
      />

      {colagem.trim() !== '' && (
        <div style={est.previa}>
          <div style={est.previaTitulo}>
            {lido.semanas.length === 0
              ? 'Nenhuma semana reconhecida nessa colagem'
              : `${lido.semanas.length} semana(s) reconhecida(s): ${lido.semanas[0].chave} a ${lido.semanas[lido.semanas.length - 1].chave}`}
          </div>
          {lido.semanas.length > 0 && (
            <div style={est.previaLinhas}>
              {lido.semanas.slice(0, 4).map((s) => (
                <span key={s.chave} style={est.previaItem}>
                  {s.chave}{s.inicio ? ' ' + comoDia(emUtc(s.inicio)) : ''}:{' '}
                  <strong>{s.pecas.toLocaleString('pt-BR')}</strong>
                </span>
              ))}
              {lido.semanas.length > 4 && (
                <span style={est.previaItem}>e mais {lido.semanas.length - 4}</span>
              )}
            </div>
          )}
          {lido.avisos.map((a) => <div key={a} style={est.aviso}>{a}</div>)}
        </div>
      )}

      <div style={est.acoes}>
        <button
          type="button" style={est.botaoPrimario} onClick={gravar}
          disabled={ocupado || lido.semanas.length === 0}
        >
          {ocupado ? 'Gravando...' : `Gravar ${lido.semanas.length || ''} semana(s)`}
        </button>
        {colagem.trim() !== '' && (
          <button type="button" style={est.botaoTexto} onClick={() => setColagem('')} disabled={ocupado}>
            Limpar colagem
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * CADASTRO DE MAQUINAS IMPRESSO — documento proprio, A4.
 *
 * Sai pelo botao Imprimir da propria tela: cada grupo com seu codigo e
 * suas maquinas, com a situacao — para conferir com o ERP ou fixar no
 * quadro. Vai num PORTAL para o body porque esta tela e' um modal sobre a
 * lista de estudos, que nao tem versao de impressao: enquanto o cadastro
 * esta' aberto, um estilo esconde o resto do app no papel — fechou, tudo
 * volta ao normal.
 */
import { createPortal } from 'react-dom';
import { claro } from '../../../theme/tokensAnalise.js';
import { LOGO_PATRIMAR } from '../../../theme/logo.js';
import { VERSAO } from '../../../versao.js';
import { formatarNominal } from '../../../domain/relatorioConferencias.js';

export default function ImpressaoCadastro({ grupos, maquinas }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const ativas = maquinas.filter((m) => m.ativa).length;
  // A coluna do nominal so' entra se alguma maquina tem: folha de
  // travessoes nao informa nada.
  const temNominal = maquinas.some((m) => m.nominal_ciclos_min != null);
  const nominalDe = (m) => (m.nominal_ciclos_min == null
    ? '—'
    : `${formatarNominal(m.nominal_ciclos_min)} ciclos/min${m.nominal_fonte ? ` (${m.nominal_fonte})` : ''}`);

  return createPortal(
    <div className="somente-impressao" style={impc.folha}>
      <style>{'@media print { #raiz { display: none !important } }'}</style>

      <header style={impc.cabecalho}>
        <div>
          <img src={LOGO_PATRIMAR} alt="Patrimar Móveis" style={impc.logo} />
          <h1 style={impc.titulo}>Cadastro de Máquinas — Grupos e Máquinas</h1>
        </div>
        <div style={impc.emissao}>RitmoPatrimar v{VERSAO} · emitido em {hoje}</div>
      </header>

      <section style={impc.identificacao}>
        {[
          ['Grupos', String(grupos.length)],
          ['Máquinas', String(maquinas.length)],
          ['Ativas', String(ativas)],
          ['Desativadas', String(maquinas.length - ativas)],
        ].map(([k, v]) => (
          <div key={k} style={impc.campo}>
            <span style={impc.campoRotulo}>{k}</span>
            <span style={impc.campoValor}>{v}</span>
          </div>
        ))}
      </section>

      <table style={impc.tabela}>
        <thead>
          <tr>
            <th style={impc.th}>Código</th>
            <th style={impc.th}>Grupo</th>
            <th style={impc.th}>Máquina</th>
            <th style={impc.th}>Situação</th>
            {temNominal && <th style={impc.th}>Nominal do fabricante</th>}
          </tr>
        </thead>
        <tbody>
          {maquinas.map((m) => (
            <tr key={m.id}>
              <td style={impc.tdCodigo}>{m.grupo_codigo || '—'}</td>
              <td style={impc.td}>{m.grupo_nome || 'Sem grupo'}</td>
              <td style={{ ...impc.td, fontWeight: 600 }}>{m.nome}</td>
              <td style={impc.td}>{m.ativa ? 'Ativa' : 'Desativada'}</td>
              {temNominal && <td style={impc.td}>{nominalDe(m)}</td>}
            </tr>
          ))}
          {/* Grupo ainda sem maquina tambem e' informacao: ele existe no
              cadastro e espera as maquinas dele. */}
          {grupos.filter((g) => !maquinas.some((m) => m.grupo_id === g.id)).map((g) => (
            <tr key={g.id}>
              <td style={impc.tdCodigo}>{g.codigo}</td>
              <td style={impc.td}>{g.nome}</td>
              <td style={{ ...impc.td, color: '#777', fontStyle: 'italic' }}>sem máquinas cadastradas</td>
              <td style={impc.td}>—</td>
              {temNominal && <td style={impc.td}>—</td>}
            </tr>
          ))}
        </tbody>
      </table>

      <p style={impc.nota}>
        Desativada: fora da escolha do celular, mas segue nomeando as conferências já
        registradas. Máquina usada só por texto livre (fora do cadastro) não aparece
        nesta folha — traga-a pelo botão "Trazer das conferências".
        {temNominal && ' Nominal do fabricante: ritmo de catálogo em ciclos (acionamentos) por minuto, '
          + 'sem manuseio — referência de teto, não meta.'}
      </p>
    </div>,
    document.body,
  );
}

/* Estilos do papel — o mesmo padrao A4 das folhas do relatorio. */
const impc = {
  folha: { background: '#fff', color: '#000', fontSize: 10.5, lineHeight: 1.45,
           fontFamily: "'Calibri', 'Carlito', 'Segoe UI', sans-serif" },
  cabecalho: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
    borderBottom: `2.5px solid ${claro.vermelho}`, paddingBottom: 8, marginBottom: 14,
  },
  logo: { height: 26, width: 'auto', display: 'block', marginBottom: 4 },
  titulo: { margin: '2px 0 0', fontSize: 16, fontWeight: 700 },
  emissao: { fontSize: 9, color: '#555', textAlign: 'right' },
  identificacao: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 14px', marginBottom: 14 },
  campo: { display: 'flex', flexDirection: 'column', borderBottom: '1px solid #ddd', paddingBottom: 3 },
  campoRotulo: { fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 0.6, color: '#666' },
  campoValor: { fontSize: 10.5, fontWeight: 600 },
  tabela: { width: '100%', borderCollapse: 'collapse', fontSize: 9.5 },
  th: { textAlign: 'left', padding: '4px 5px', fontWeight: 700, borderBottom: '1.5px solid #000', whiteSpace: 'nowrap' },
  td: { padding: '3px 5px', borderBottom: '1px solid #DDD', verticalAlign: 'top' },
  tdCodigo: { padding: '3px 5px', borderBottom: '1px solid #DDD', fontFamily: "'Roboto Mono', 'Consolas', monospace", whiteSpace: 'nowrap' },
  nota: { margin: '10px 0 0', fontSize: 9, color: '#555', lineHeight: 1.5 },
};

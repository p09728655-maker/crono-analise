import { useMemo, useState } from 'react';
import { faixaHoraria, nomeChave } from '../../../domain/cronoanalise.js';
import { est } from './estilos.js';

/**
 * CORRIGIR O NOME DA PECA de uma medicao — no PC.
 *
 * O nome nao vem de cadastro: e' digitado no aparelho, medicao a medicao,
 * por quem esta' no corredor. O mesmo produto chega escrito de tres jeitos
 * conforme o dia e a pessoa, e o Ritmo por peca — que agrupa por esse texto
 * — passa a mostrar tres pecas com um terco das medicoes cada. Nenhuma das
 * tres descreve a peca de verdade.
 *
 * Por isso a janela renomeia AS OUTRAS junto, por padrao: corrigir so' a
 * linha aberta deixaria as demais com a grafia velha e o Ritmo por peca
 * continuaria partido. Quem quiser corrigir uma medicao so' (a peca ali era
 * mesmo outra) desmarca a caixa.
 *
 * A correcao alcanca a lista que esta' carregada — ativas ou arquivadas,
 * conforme a face aberta. E' o que a janela diz, com o numero na frente.
 */
export default function RenomearPeca({ conferencia, linhas, erro, ocupado, aoFechar, aoGravar }) {
  const nomeAtual = String(conferencia.peca || '').trim();
  const [nome, setNome] = useState(nomeAtual);
  const [tambemAsOutras, setTambemAsOutras] = useState(true);

  /* As medicoes que carregam a MESMA grafia — a mesma chave normalizada do
     agrupamento, entao o que a janela promete corrigir e' exatamente o que
     estava junto no Ritmo por peca. Medicao SEM nome nao arrasta ninguem:
     "sem nome" nao e' uma grafia, e' a ausencia de uma. */
  const irmas = useMemo(() => (nomeAtual
    ? linhas.filter((c) => nomeChave(c.peca) === nomeChave(nomeAtual)).map((c) => c.id)
    : [conferencia.id]),
  [linhas, nomeAtual, conferencia.id]);

  /* Os nomes que JA' existem no relatorio, para escolher em vez de
     redigitar: e' redigitando que nasce a terceira grafia. */
  const nomesConhecidos = useMemo(() => {
    const vistos = new Map();
    for (const c of linhas) {
      const n = String(c.peca || '').trim();
      if (n && !vistos.has(nomeChave(n))) vistos.set(nomeChave(n), n);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [linhas]);

  const limpo = nome.trim();
  // Nome VAZIO nao renomeia: apagar nao e' corrigir. Sem esta trava, limpar
  // o campo e clicar apagava o nome de ate 500 medicoes de uma vez, sem
  // volta — a grafia antiga nao fica guardada em lugar nenhum.
  const mudou = Boolean(limpo) && limpo !== nomeAtual;
  const emLote = tambemAsOutras && irmas.length > 1;
  const outras = irmas.length - 1;

  return (
    <div style={est.modal} role="dialog" aria-label="Nome da peça">
      <div style={est.caixaModal}>
        <h2 style={est.tituloModal}>Nome da peça</h2>
        <p style={est.textoModal}>
          {[conferencia.maquina, faixaHoraria(conferencia)].filter(Boolean).join(' · ') || 'Medição'}
          {' · '}{conferencia.pecas} pç
        </p>

        <label style={est.rotuloCampo} htmlFor="nome-da-peca">Peça</label>
        <input
          id="nome-da-peca"
          style={est.inputNome}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          autoFocus
          list="pecas-ja-medidas"
          placeholder="Ex.: Sleep base 380x330x15"
          aria-label="Nome da peça"
        />
        {/* A lista das pecas ja' medidas: escolher a grafia que existe e'
            o que junta as medicoes. Redigitar e' de onde vem a divergencia
            — e o teclado do PC nao corrige nome de peca. */}
        <datalist id="pecas-ja-medidas">
          {nomesConhecidos.map((n) => <option key={n} value={n} />)}
        </datalist>

        {/* DE -> PARA, escrito: renomear em lote reescreve dado historico e
            nao tem volta. Ver as duas grafias lado a lado antes de clicar e'
            o que separa juntar a peca de inventar uma referencia que nunca
            existiu. */}
        {mudou && (
          <p style={est.textoModal}>
            {emLote
              ? <>As <strong>{irmas.length} medições</strong> que hoje se chamam «{nomeAtual}» passam
                a se chamar <strong>«{limpo}»</strong>.</>
              : <>Esta medição passa de «{nomeAtual || 'sem nome'}» para <strong>«{limpo}»</strong>.</>}
            {' '}Não há como desfazer.
          </p>
        )}

        {irmas.length > 1 && (
          <label style={est.rotuloPapel}>
            <input
              type="checkbox"
              style={est.caixaPapel}
              checked={tambemAsOutras}
              onChange={() => setTambemAsOutras((v) => !v)}
              aria-label="Corrigir também as outras medições com este nome"
            />
            <span>
              {outras === 1
                ? 'Corrigir também a outra medição com este mesmo nome'
                : `Corrigir também as outras ${outras} medições com este mesmo nome`}
              {' '}— é o que junta a peça numa linha só no Ritmo por peça.
            </span>
          </label>
        )}
        {erro && <div style={est.faixaErro} role="alert">{erro}</div>}

        <div style={est.acoesModal}>
          <button type="button" style={est.botaoLinha} onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </button>
          <button
            type="button"
            style={est.botaoImprimir}
            onClick={() => aoGravar({ nome: limpo, tambemAsOutras, irmas })}
            disabled={ocupado || !mudou}
          >
            {ocupado
              ? 'Gravando...'
              : (emLote ? `Renomear as ${irmas.length} medições` : 'Renomear')}
          </button>
        </div>
      </div>
    </div>
  );
}

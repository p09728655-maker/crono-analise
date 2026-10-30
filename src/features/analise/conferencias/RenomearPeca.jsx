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
 *
 * A MESMA JANELA corrige o PRODUTO na Embalagem Takt Time (v2.97.0): o que
 * muda e' a palavra (`termos`) e a lista de nomes, que traz primeiro os do
 * CADASTRO de produtos do grupo (`nomesDoCadastro`, so' os ativos) — e'
 * escolhendo o nome do cadastro que a medicao volta a casar com a lista do
 * tablet. Quando a grafia velha tambem e' a do cadastro, a janela avisa:
 * renomear as medicoes nao muda o que o tablet oferece.
 */
const TERMOS_PECA = {
  titulo: 'Nome da peça',
  campo: 'Peça',
  aria: 'Nome da peça',
  exemplo: 'Ex.: Sleep base 380x330x15',
  unidade: ['pç', 'pç'],
  juntaOnde: 'é o que junta a peça numa linha só no Ritmo por peça',
  cadastro: null,
};
export const TERMOS_PRODUTO_EMBALAGEM = {
  titulo: 'Produto da medição',
  campo: 'Produto',
  aria: 'Nome do produto',
  exemplo: 'Ex.: Rack Sirius 1.6',
  unidade: ['volume', 'volumes'],
  juntaOnde: 'é o que deixa juntar as medições do mesmo produto',
  cadastro: 'Produtos da embalagem',
};

export default function RenomearPeca({
  conferencia, linhas, erro, ocupado, aoFechar, aoGravar, termos = TERMOS_PECA, nomesDoCadastro = [],
}) {
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
     redigitar: e' redigitando que nasce a terceira grafia. Os do cadastro
     vem primeiro e ganham a grafia: sao os que o tablet oferece. */
  const nomesConhecidos = useMemo(() => {
    const vistos = new Map();
    for (const n of [...nomesDoCadastro, ...linhas.map((c) => c.peca)]) {
      const limpo = String(n || '').trim();
      if (limpo && !vistos.has(nomeChave(limpo))) vistos.set(nomeChave(limpo), limpo);
    }
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [linhas, nomesDoCadastro]);
  const noCadastro = useMemo(() => new Set(nomesDoCadastro.map(nomeChave)), [nomesDoCadastro]);

  const limpo = nome.trim();
  // Nome VAZIO nao renomeia: apagar nao e' corrigir. Sem esta trava, limpar
  // o campo e clicar apagava o nome de ate 500 medicoes de uma vez, sem
  // volta — a grafia antiga nao fica guardada em lugar nenhum.
  const mudou = Boolean(limpo) && limpo !== nomeAtual;
  const emLote = tambemAsOutras && irmas.length > 1;
  const outras = irmas.length - 1;
  /* O nome velho e' o do CADASTRO: a correcao aqui nao chega ao tablet.
     So' quando a correcao TROCA de produto: "penteadeira princesa" ->
     "Penteadeira Princesa" e' o mesmo produto do cadastro, e o aviso
     mandaria desativar justamente o certo. */
  const trocouDeProduto = mudou && nomeChave(nomeAtual) !== nomeChave(limpo);
  const antigoNoCadastro = trocouDeProduto && termos.cadastro && noCadastro.has(nomeChave(nomeAtual));
  const novoNoCadastro = noCadastro.has(nomeChave(limpo));

  return (
    <div style={est.modal} role="dialog" aria-label={termos.titulo}>
      <div style={est.caixaModal}>
        <h2 style={est.tituloModal}>{termos.titulo}</h2>
        <p style={est.textoModal}>
          {[conferencia.maquina, faixaHoraria(conferencia)].filter(Boolean).join(' · ') || 'Medição'}
          {' · '}{conferencia.pecas} {termos.unidade[Number(conferencia.pecas) === 1 ? 0 : 1]}
        </p>

        <label style={est.rotuloCampo} htmlFor="nome-da-peca">{termos.campo}</label>
        <input
          id="nome-da-peca"
          style={est.inputNome}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          autoFocus
          list="pecas-ja-medidas"
          placeholder={termos.exemplo}
          aria-label={termos.aria}
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
        {antigoNoCadastro && (
          <p style={est.textoModal} role="note">
            {/* Condicional de proposito: a medicao pode so' ter recebido o
                produto errado da lista, e ai' o cadastro esta' certo. */}
            {novoNoCadastro
              ? <>«{nomeAtual}» e «{limpo}» estão os dois no cadastro de produtos. Se forem o mesmo
                produto, desative «{nomeAtual}» em {termos.cadastro}: senão o tablet continua
                oferecendo os dois.</>
              : <>«{nomeAtual}» também está no cadastro de produtos. Se o nome lá estiver errado,
                corrija em {termos.cadastro}: renomear as medições não muda o que o tablet oferece.</>}
          </p>
        )}

        {irmas.length > 1 && (
          <label style={est.rotuloCaixaJanela}>
            <input
              type="checkbox"
              style={est.caixaJanela}
              checked={tambemAsOutras}
              onChange={() => setTambemAsOutras((v) => !v)}
              aria-label="Corrigir também as outras medições com este nome"
            />
            <span>
              {outras === 1
                ? 'Corrigir também a outra medição com este mesmo nome'
                : `Corrigir também as outras ${outras} medições com este mesmo nome`}
              {' '}— {termos.juntaOnde}.
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

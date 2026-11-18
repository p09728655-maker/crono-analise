import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { VERSAO } from '../../../versao.js';
import {
  conferenciaRapida, formatarDuracao, formatarSegundos, leituraPecaAPeca, periodoPorPeca, unidadeDoPosto,
} from '../../../domain/cronoanalise.js';
import { diasProgramados, taktDaMedicao } from '../../../domain/demandaSemanal.js';
import {
  conferirAutomatica, desfazerUltimo, emRelogio, encerrarParadaNoVideo, iniciarParadaNoVideo, inicioSugerido,
  lacunasDoVideo, marcacaoDasEntradas, marcacaoVazia, marcarToque, marcasEmPalavras, marcasGuardadas, medicaoDoVideo,
  removerParada, removerVolume, semMarcas,
} from '../../../domain/medicaoPorVideo.js';
import {
  CORRELACAO_MINIMA, PISO_PERMANENCIA_MS, TESTE_MS, areaDaImagem, avaliarTeste, detectarVolumes, ehPapelao,
  esteiraPelasLinhas, intervalosLongos, linhaBDaLeitura, linhaBValida,
  pontoNaImagem, retanguloEntre, retanguloValido, saidasDosVolumes, trechoDoTeste,
} from '../../../domain/deteccaoVolumes.js';
import {
  ALTURA_MEDIDA, LARGURA_MEDIDA, VELOCIDADE, analisarVideo, criarMedidor,
} from '../../../lib/analisarVideo.js';
import {
  ErroApi, arquivarConferencia, enviarMedicaoPorVideo, lerDemanda, listarCadastroMaquinas,
} from '../../../lib/api.js';
import { produtosDoGrupo } from '../../../lib/maquinas.js';
import { carregarMotivos, useMotivosDoGrupo } from '../../../lib/motivosParada.js';
import { rotuloMotivo } from '../../../domain/crono/paradas.js';
import MenuLateral from '../../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../../components/HistoricoVersoes.jsx';
import EstadoVazio from '../../../components/EstadoVazio.jsx';
import SeletorProduto from '../../../components/SeletorProduto.jsx';
import { motivoSemTakt } from '../../coleta/embalagem/motivoSemTakt.js';
import { useTemposAlvo } from '../../../lib/temposAlvo.js';
import {
  descontaSetup, explicacaoDoAlvo, fraseDaSemana, semAlvo,
} from '../../../domain/tempoAlvo.js';
import { GraficoIntervalos } from '../graficos/Intervalos.jsx';
import { ESTILO_TAKT, PainelTakt } from '../../coleta/rapida/CronometroAoVivo.jsx';
import { est } from '../conferencias/estilos.js';
import { ev } from './estilos.js';

const VOLUME = unidadeDoPosto('EMBALAGEM');
const ehEmbalagem = (grupo) => unidadeDoPosto(grupo?.nome).singular === 'volume';
/** Um quadro, para o , e o . — o video do celular e' de 30 quadros por segundo. */
const QUADRO_S = 1 / 30;
const ESTILO_GRADE = '@media (max-width: 1099px) { .video-grade { grid-template-columns: minmax(0, 1fr) !important; } }';

/**
 * A MARCACAO EM ANDAMENTO fica guardada NESTE PC, pelo arquivo (nome,
 * tamanho e data): uma hora de video marcada nao pode se perder num F5 ou
 * numa aba fechada. O video nao fica — o navegador nao guarda arquivo —,
 * entao continuar e' escolher o mesmo arquivo de novo.
 *
 * UMA POR VIDEO (v2.99.1): com uma vaga so', comecar outro video apagava
 * sem aviso a marcacao guardada do anterior. Guarda as 10 mais recentes.
 * E os videos JA' SALVOS ficam anotados, para avisar antes de salvar o
 * mesmo video de novo (o takt e a junção contariam os volumes duas vezes).
 */
const CHAVE_RASCUNHOS = 'ritmopatrimar.video.rascunhos';
const CHAVE_SALVOS = 'ritmopatrimar.video.salvos';
/** A vaga unica da v2.99.0: o que estiver nela entra no mapa uma vez (migrarRascunhoAntigo). */
const CHAVE_RASCUNHO_ANTIGA = 'ritmopatrimar.video.rascunho';
const MAX_GUARDADOS = 10;
/** Duracao de parada: no video se marca no segundo, e "< 1 min" esconderia isso. */
const duracaoCurta = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : formatarDuracao(ms));
const volumes = (n) => `${n} ${n === 1 ? 'volume' : 'volumes'}`;

const chaveDoArquivo = (f) => (f ? `${f.name}|${f.size}|${f.lastModified}` : null);
/** A lista da Embalagem Takt Time mostra os ultimos 30 dias (DIAS em EmbalagemTaktTimePc). */
const DIAS_DA_LISTA = 30;
const foraDaListaDesde = (inicio) => {
  const t = inicio ? new Date(inicio).getTime() : NaN;
  return Number.isFinite(t) && Date.now() - t > DIAS_DA_LISTA * 86400000;
};
/** Onde a medicao aparece: a lista so' tem 30 dias; a mais antiga, so' o relatorio. */
const ondeConferir = (inicio) => (foraDaListaDesde(inicio)
  ? 'no relatório Ritmo por máquina, escolhendo um período maior (a filmagem é de mais de 30 dias atrás e não aparece na lista da Embalagem Takt Time)'
  : 'na lista da Embalagem Takt Time');
function lerMapa(chave) {
  try { return JSON.parse(localStorage.getItem(chave)) || {}; } catch { return {}; }
}
function gravarMapa(chave, mapa) {
  // So' os mais recentes: o localStorage e' pequeno e isto nao e' arquivo.
  const recentes = Object.entries(mapa)
    .sort((a, b) => String(b[1].atualizadoEm || b[1].em).localeCompare(String(a[1].atualizadoEm || a[1].em)))
    .slice(0, MAX_GUARDADOS);
  try { localStorage.setItem(chave, JSON.stringify(Object.fromEntries(recentes))); } catch { /* segue sem guardar */ }
}
/**
 * O que vale guardar (v2.112.1): marcacao com alguma marca, ou que pode ja'
 * estar no servidor (tentou salvar, ou chegou e foi mexida no PC) — essa,
 * mesmo vazia, guarda o aviso de nao salvar o mesmo trecho duas vezes.
 */
const rascunhoTemAlgo = (r) => Boolean(r && (r.envioTentado || r.incerto || r.mexida || !semMarcas(r.marcacao)));
const lerRascunho = (arquivoChave) => {
  const r = lerMapa(CHAVE_RASCUNHOS)[arquivoChave];
  return rascunhoTemAlgo(r) ? r : null;
};
const rascunhosGuardados = () => Object.values(lerMapa(CHAVE_RASCUNHOS)).filter(rascunhoTemAlgo);
/** As vazias guardadas ate' a v2.112.0 (uma por video aberto) saem do PC. */
function limparRascunhosVazios() {
  const mapa = lerMapa(CHAVE_RASCUNHOS);
  const comAlgo = Object.fromEntries(Object.entries(mapa).filter(([, r]) => rascunhoTemAlgo(r)));
  if (Object.keys(comAlgo).length !== Object.keys(mapa).length) gravarMapa(CHAVE_RASCUNHOS, comAlgo);
}
function gravarRascunho(r) {
  gravarMapa(CHAVE_RASCUNHOS, { ...lerMapa(CHAVE_RASCUNHOS), [r.arquivo]: r });
}
function apagarRascunho(arquivoChave) {
  const mapa = lerMapa(CHAVE_RASCUNHOS);
  delete mapa[arquivoChave];
  gravarMapa(CHAVE_RASCUNHOS, mapa);
}
/**
 * O RETANGULO DA MARCACAO AUTOMATICA (v2.105.0), guardado NESTE PC por
 * maquina: cada embalagem tem a sua camera e o seu enquadramento, e o
 * proximo video da mesma maquina ja' abre com ele. Em fracao da imagem,
 * nao em pixels — vale em qualquer tamanho de janela.
 */
const CHAVE_RETANGULOS = 'ritmopatrimar.video.retangulos';
function lerRetangulo(maquinaId) {
  const r = maquinaId ? lerMapa(CHAVE_RETANGULOS)[maquinaId] : null;
  return retanguloValido(r) ? r : null;
}
function gravarRetangulo(maquinaId, r) {
  if (!maquinaId) return;
  try {
    localStorage.setItem(CHAVE_RETANGULOS, JSON.stringify({ ...lerMapa(CHAVE_RETANGULOS), [maquinaId]: r }));
  } catch { /* segue sem guardar: vale para este video */ }
}
const lerSalvo = (arquivoChave) => lerMapa(CHAVE_SALVOS)[arquivoChave] || null;
function anotarSalvo(arquivoChave, info) {
  gravarMapa(CHAVE_SALVOS, { ...lerMapa(CHAVE_SALVOS), [arquivoChave]: info });
}
/**
 * Descartar uma marcacao que talvez tenha chegado (`chegou` = sabe-se que
 * chegou: o 409 de mexida no PC). O aviso fica no video, com a filmagem
 * (decide onde conferir: a lista mostra so' 30 dias).
 */
function anotarDescartada(arquivoChave, r, chegou) {
  anotarSalvo(arquivoChave, {
    em: new Date().toISOString(), volumes: r.marcacao.toques.length, incerto: !chegou, chegou,
    inicio: r.campos.inicio || null,
  });
}
/**
 * Descartar uma marcacao guardada — a do video aberto ou, desde a v2.112.1,
 * uma da lista do preparo. A que pode ja' estar no servidor deixa o aviso
 * no video, para a marcacao nova do mesmo trecho nao duplicar calada.
 */
function descartarGuardada(r) {
  if (r.envioTentado || r.incerto || r.mexida) anotarDescartada(r.arquivo, r, Boolean(r.mexida));
  apagarRascunho(r.arquivo);
}
/**
 * A marcacao guardada pela v2.99.0, na vaga unica: passa para o mapa (sem
 * passar por cima de uma mais nova do mesmo video) e a vaga e' apagada. Sem
 * isto, quem atualizou com uma marcacao em andamento a perdia calado.
 */
function migrarRascunhoAntigo() {
  let antigo = null;
  try { antigo = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO_ANTIGA)); } catch { /* ilegivel: so' apaga */ }
  // Nem a de um video que ja' foi salvo DEPOIS dela (marcado de novo na
  // v2.99.1): continuar e salvar criaria uma segunda medicao.
  const salvo = antigo?.arquivo ? lerSalvo(antigo.arquivo) : null;
  const salvoDepois = salvo && String(salvo.em) > String(antigo.atualizadoEm || '');
  if (antigo?.arquivo && antigo.marcacao && antigo.campos && !lerRascunho(antigo.arquivo) && !salvoDepois) {
    gravarRascunho(antigo);
  }
  try { localStorage.removeItem(CHAVE_RASCUNHO_ANTIGA); } catch { /* nada a apagar */ }
}
/**
 * Envio cujo resultado nao se sabe (rede, tempo esgotado, erro do servidor):
 * pode ter gravado. Resposta 2xx que nao e' JSON tambem — o servidor pode
 * ter gravado antes de a resposta se estragar no caminho.
 */
const envioIncerto = (e) => !(e instanceof ErroApi) || e.status >= 500 || e.status < 400;
/** O 409 de "ja' chegou e foi mexida no PC" (api/sync.js): a tela oferece o que fazer. */
const mexidaNoPc = (e) => e instanceof ErroApi && e.status === 409 && e.detalhes?.motivo === 'mexida-no-pc';
/**
 * O que dizer quando nao se sabe se gravou. Salvar de novo e' seguro: o
 * servidor SUBSTITUI a medicao por video com o mesmo identificador (v2.99.2),
 * entao a ultima versao enviada e' a que fica — e nunca duas.
 */
function mensagemIncerta(e) {
  // A mensagem do servidor vai junto (com o codigo, quando ha'): sem ela,
  // quem esta' diante da tela nao tem como dizer o que houve.
  // Sem o "Tente de novo" da mensagem (a frase seguinte ja' diz o que fazer)
  // e sem repetir o codigo quando ela ja' o traz.
  const doServidor = String(e?.message || '').replace(/\s*Tente[^.]*\.?\s*$/i, '').replace(/\.$/, '');
  let causa = doServidor.includes(String(e?.status))
    ? `o servidor respondeu com erro: ${doServidor}`
    : `o servidor respondeu com erro (${e?.status}): ${doServidor}`;
  if (!(e instanceof ErroApi)) causa = 'o servidor não respondeu (a rede caiu ou o PC está sem internet)';
  else if (e.status === 504) causa = 'o servidor demorou demais para responder';
  else if (e.status < 400) causa = 'a resposta do servidor chegou estragada';
  return `Não deu para confirmar se salvou: ${causa}. Salve de novo — se a tentativa anterior chegou, `
    + 'esta a substitui, sem duplicar.';
}

/** Date -> "AAAA-MM-DDTHH:MM:SS" no fuso do PC (o que o datetime-local entende). */
function paraCampoLocal(d) {
  if (!d || Number.isNaN(d.getTime())) return '';
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
    + `T${dois(d.getHours())}:${dois(d.getMinutes())}:${dois(d.getSeconds())}`;
}

/**
 * CRONOMETRAR POR VIDEO — outra forma de medir a embalagem, ao lado do
 * tablet (v2.99.0). Nada do tablet muda.
 *
 * Alguem filma a linha com o celular num tripe' (app de camera do proprio
 * aparelho) e, depois, no PC, o analista assiste e marca: Enter quando o
 * fim da caixa sai do rolete e entra no tapete (o padrao do PPCP, o mesmo
 * do tablet), P para Parou/Voltou, F para Encerrar. A marca sai do
 * TEMPO DO VIDEO — pausar, voltar, ver em 2x ou quadro a quadro nao mexe
 * nos numeros. O video fica no PC: nada dele sobe para o servidor.
 *
 * Tres passos na mesma tela: PREPARAR (o arquivo, a maquina, o produto e
 * quando a filmagem comecou — e' a data que decide a semana e o takt),
 * MARCAR (o video e as marcas lado a lado, com os mesmos numeros do
 * tablet) e REVISAR (a previa do volume a volume antes de salvar). Salva,
 * a medicao entra na Embalagem Takt Time como qualquer outra, com o selo
 * "por video" (`origem` no banco).
 */
export default function EmbalagemPorVideo({ aoVoltar, aoVerInicio }) {
  const [verVersoes, setVerVersoes] = useState(false);
  const [carga, setCarga] = useState({ estado: 'carregando' });
  const [arquivo, setArquivo] = useState(null);
  const [url, setUrl] = useState(null);
  // pronto: o navegador abriu o video. duracaoS pode ficar null mesmo pronto
  // (WebM de gravador de tela nao informa duracao) — da' para marcar igual.
  const [meta, setMeta] = useState({ duracaoS: null, erro: null, pronto: false });
  const [campos, setCampos] = useState({ maquinaId: '', produto: '', inicio: '' });
  const [etapa, setEtapa] = useState('preparar'); // preparar | marcar | revisar | salvo
  const [marcacao, setMarcacao] = useState(marcacaoVazia);
  const refMarcacao = useRef(marcacao);
  const [fimMs, setFimMs] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [clientId, setClientId] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  // A marcacao guardada voltou, mas falta escolher a maquina (a dela saiu
  // do cadastro): o botao continua a marcacao em vez de zera-la.
  const [retomando, setRetomando] = useState(false);
  const [avisoPreparar, setAvisoPreparar] = useState(null);
  const [jaSalvo, setJaSalvo] = useState(null);
  // Ja' se tentou salvar esta marcacao (e pode ter chegado): vai no
  // rascunho, para o F5 e o Descartar saberem. Ref, e nao estado, porque e'
  // gravado na hora do envio — nao num efeito que podia rodar depois do
  // sucesso e recriar o rascunho ja' apagado.
  const refEnvioTentado = useRef(false);
  // A medicao salva substituiu a que uma tentativa anterior tinha gravado.
  const [substituiu, setSubstituiu] = useState(false);
  // O id (no servidor) da medicao que chegou numa tentativa anterior e foi
  // mexida no PC depois: salvar de novo nao a substitui (409). Vai no rascunho.
  const [mexida, setMexida] = useState(null);
  const [motivoPedido, setMotivoPedido] = useState(null); // ms do video em que se apertou P
  const [salvar, setSalvar] = useState({ estado: 'parado', erro: null });
  const refVideo = useRef(null);
  const [agoraMs, setAgoraMs] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [velocidade, setVelocidade] = useState(1);
  // MARCACAO AUTOMATICA (v2.105.0). O retangulo e' da maquina; `automaticas`
  // sao as marcas que ela pos (largada e volumes, ms do video) — vao no
  // rascunho, para a conferencia sobreviver ao F5.
  const [retangulo, setRetangulo] = useState(null);
  // false | 'A' (o retangulo que marca as caixas) | 'B' (a linha B da
  // velocidade, v2.113.0).
  const [desenhando, setDesenhando] = useState(false);
  const [arrasto, setArrasto] = useState(null); // { a, b } em fracao da imagem, enquanto arrasta
  const [caixaVideo, setCaixaVideo] = useState(null); // tamanho do <video> na tela, em px
  // parado | lendo | pronto | erro. Lendo, `modo` diz se e' o video todo
  // ('tudo') ou o TESTE do retangulo ('teste', v2.112.0), que nao mexe na lista.
  const [automatica, setAutomatica] = useState({ estado: 'parado' });
  // O TESTE do retangulo (v2.112.0): parado | pronto (com o resultado) | erro.
  // Nao vai no rascunho: vale para o retangulo e o video da tela, agora.
  const [teste, setTeste] = useState({ estado: 'parado' });
  const [progresso, setProgresso] = useState(null);
  const [automaticas, setAutomaticas] = useState([]);
  const refVideoLeitura = useRef(null);
  const refUltimoProgresso = useRef(0);

  /* ---------------------------------------------- cadastro e programa */
  useEffect(() => {
    let vivo = true;
    // Antes do Preparar aparecer (ele so' vem com o cadastro carregado).
    migrarRascunhoAntigo();
    limparRascunhosVazios();
    carregarMotivos();
    listarCadastroMaquinas()
      .then(async (cadastro) => {
        const grupos = (cadastro.grupos || []).filter(ehEmbalagem);
        // Programa que nao veio nao derruba a tela: so' fica sem takt.
        const programas = await Promise.all(grupos.map((g) => lerDemanda(g.id).catch(() => null)));
        if (!vivo) return;
        const ids = new Set(grupos.map((g) => g.id));
        const maquinas = (cadastro.maquinas || []).filter((m) => m && m.ativa !== false && ids.has(m.grupo_id));
        setCarga({
          estado: 'pronto', cadastro, grupos, maquinas,
          demandas: new Map(grupos.map((g, i) => [g.id, programas[i]?.demandas ?? null])),
        });
        setCampos((c) => (c.maquinaId || !maquinas.length ? c : { ...c, maquinaId: maquinas[0].id }));
      })
      .catch((e) => { if (vivo) setCarga({ estado: 'erro', erro: e.message }); });
    return () => { vivo = false; };
  }, []);

  const maquina = carga.estado === 'pronto' ? carga.maquinas.find((m) => m.id === campos.maquinaId) || null : null;
  const grupo = maquina ? carga.grupos.find((g) => g.id === maquina.grupo_id) || null : null;
  const produtos = useMemo(
    () => (carga.estado === 'pronto' ? produtosDoGrupo(carga.cadastro, grupo?.id) : []),
    [carga, grupo?.id],
  );
  const motivos = useMotivosDoGrupo(grupo?.id);
  // O retangulo e' da maquina: trocar a maquina traz o dela (ou nenhum) — e
  // o teste era do outro retangulo.
  useEffect(() => { setRetangulo(lerRetangulo(maquina?.id)); setTeste({ estado: 'parado' }); }, [maquina?.id]);

  const inicioData = campos.inicio ? new Date(campos.inicio) : null;
  const inicioValido = Boolean(inicioData && !Number.isNaN(inicioData.getTime()));
  /** O instante real de um ponto do video: inicio da filmagem + tempo do video. */
  const instante = (ms) => (inicioValido ? new Date(inicioData.getTime() + ms) : null);

  // O TAKT da semana em que a filmagem foi feita — nao o desta semana.
  const takt = useMemo(() => {
    if (!grupo || !inicioValido || carga.estado !== 'pronto') return null;
    const demandas = carga.demandas.get(grupo.id);
    if (demandas === null) return { taktMs: null, estado: 'erro-programa' };
    const data = new Date(inicioData.getTime() + (marcacao.largadaMs || 0)).toISOString();
    return taktDaMedicao({
      demandas,
      horas: grupo.horas_semana,
      maquinas: carga.maquinas.filter((m) => m.grupo_id === grupo.id).length,
      setup: { setupsDia: grupo.setups_dia, dias: grupo.dias_semana, minutos: grupo.setup_min },
      data,
      pecas: 1,
      duracaoMs: 3600000,
    });
  }, [grupo, inicioValido, campos.inicio, carga, marcacao.largadaMs]);

  /* O TEMPO-ALVO do produto (v2.106.0): a regua do "▲ alvo", como no tablet
     e no volume a volume. O takt fica como a carga da semana, sem cor. */
  const alvos = useTemposAlvo();
  // A semana da filmagem decide a linha "a semana pede" (v2.107.0).
  const alvo = alvos.alvoDe(campos.produto, inicioValido ? inicioData : null);

  /* --------------------------------------------------------- arquivo */
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const escolherArquivo = (f) => {
    setAviso(null);
    setAvisoPreparar(null);
    setRetomando(false);
    if (!f) return;
    setArquivo(f);
    setMeta({ duracaoS: null, erro: null, pronto: false });
    // O video novo abre no segundo 0: a posicao do anterior ficava no
    // relogio da tela (1:25 / 1:00) e o "+5 s" saltava dela (revisao v2.108.0).
    setAgoraMs(0);
    setUrl(URL.createObjectURL(f));
    // O inicio era do arquivo anterior: o deste vem dos metadados dele. Sem
    // isto, trocar o arquivo errado pelo certo mantinha a data do errado — e
    // a medicao ia para a semana e o takt de outro dia (revisao de 30/10).
    setCampos((c) => ({ ...c, inicio: '' }));
    setRascunho(lerRascunho(chaveDoArquivo(f)));
    setJaSalvo(lerSalvo(chaveDoArquivo(f)));
    // O teste era do video anterior.
    setTeste({ estado: 'parado' });
  };

  const aoCarregarMetadados = () => {
    const v = refVideo.current;
    if (!v) return;
    const duracaoS = Number.isFinite(v.duration) ? v.duration : null;
    // O tamanho da imagem: e' nele que o retangulo desenhado e' medido.
    setMeta({
      duracaoS, erro: null, pronto: true, largura: v.videoWidth || null, altura: v.videoHeight || null,
    });
    // Sugestao: o arquivo e' gravado no fim da filmagem (ver inicioSugerido).
    // Sem duracao nao ha' como voltar do fim ao comeco: o campo fica vazio.
    setCampos((c) => (c.inicio || !arquivo ? c : { ...c, inicio: paraCampoLocal(inicioSugerido(arquivo.lastModified, duracaoS)) }));
  };
  // A duracao que chega depois (WebM sem duracao no cabecalho, as vezes).
  const aoMudarDuracao = () => {
    const v = refVideo.current;
    if (v && Number.isFinite(v.duration)) setMeta((m) => ({ ...m, duracaoS: v.duration }));
  };
  // O tamanho do <video> na tela muda com a janela: o retangulo desenhado
  // acompanha (ele e' guardado em fracao da imagem).
  useEffect(() => {
    const v = refVideo.current;
    if (!url || !v || typeof ResizeObserver === 'undefined') return undefined;
    const medir = () => setCaixaVideo({ largura: v.clientWidth, altura: v.clientHeight });
    const obs = new ResizeObserver(medir);
    obs.observe(v);
    medir();
    return () => obs.disconnect();
  }, [url]);

  const continuarRascunho = () => {
    const r = rascunho;
    refMarcacao.current = r.marcacao;
    setMarcacao(r.marcacao);
    setObservacao(r.observacao || '');
    setClientId(r.clientId);
    // `incerto` era o nome na v2.99.1. Com o mesmo clientId, salvar de novo
    // substitui o que tiver chegado.
    refEnvioTentado.current = Boolean(r.envioTentado || r.incerto);
    setMexida(r.mexida || null);
    setAutomaticas(r.automaticas || []);
    setAutomatica(r.automaticaResultado ? { estado: 'pronto', resultado: r.automaticaResultado } : { estado: 'parado' });
    setFimMs(null);
    setRascunho(null);
    // A maquina guardada tem de estar ativa no cadastro: sem ela, o Salvar
    // nao teria o que gravar. Nao troca por outra calado — pede a escolha.
    const maquinaAtiva = carga.estado === 'pronto' && carga.maquinas.some((m) => m.id === r.campos.maquinaId);
    if (!maquinaAtiva) {
      setCampos({ ...r.campos, maquinaId: '' });
      setRetomando(true);
      setAvisoPreparar(`A máquina desta marcação (${r.maquinaNome || 'sem nome'}) não está mais ativa no cadastro da `
        + 'embalagem. Escolha a máquina e continue: as marcas estão guardadas.');
      return;
    }
    setCampos(r.campos);
    setEtapa('marcar');
  };
  const descartarRascunho = () => {
    // Descartar uma marcacao que talvez tenha chegado ao servidor: o aviso
    // de "ja' salvo" fica, para a marcacao nova do mesmo trecho nao duplicar
    // calada.
    descartarGuardada(rascunho);
    setJaSalvo(lerSalvo(rascunho.arquivo));
    setRascunho(null);
  };

  const comecar = () => {
    setAvisoPreparar(null);
    if (retomando) {
      setRetomando(false);
      setEtapa('marcar');
      return;
    }
    refMarcacao.current = marcacaoVazia();
    setMarcacao(refMarcacao.current);
    setClientId(crypto.randomUUID());
    refEnvioTentado.current = false;
    setMexida(null);
    setAutomaticas([]);
    setAutomatica({ estado: 'parado' });
    setFimMs(null);
    setAviso(null);
    setEtapa('marcar');
  };

  /* VOLTAR AO PREPARO no meio da marcacao (v2.108.0): trocar a maquina (o
     video era de outra camera, e o retangulo e' da maquina), o produto ou o
     inicio sem perder as marcas. E' o "retomando" de quando a maquina do
     rascunho saiu do cadastro: no preparo o botao vira "Continuar a
     marcacao" e o comecar() nao zera nada. Trocar o ARQUIVO la' sai do
     retomando, e a marcacao deste video fica no rascunho dele. */
  const voltarAoPreparo = () => {
    refVideo.current?.pause();
    setAviso(null);
    setRetomando(true);
    setAvisoPreparar(`${marcasGuardadas(refMarcacao.current)} Troque o que precisar e clique em “Continuar a marcação”.`);
    setEtapa('preparar');
  };

  // O rascunho acompanha cada marca; salva a medicao, ele some.
  const rascunhoAtual = (troca = {}) => ({
    arquivo: chaveDoArquivo(arquivo), nome: arquivo.name, clientId, campos, marcacao, observacao, mexida,
    envioTentado: refEnvioTentado.current, maquinaNome: maquina?.nome || null, atualizadoEm: new Date().toISOString(),
    automaticas,
    // O que a leitura apontou para conferir (caixas encostadas, intervalos
    // longos...): sem isto, o F5 voltava com as marcas e sem os avisos.
    automaticaResultado: automatica.resultado || null,
    ...troca,
  });
  useEffect(() => {
    if (!arquivo || !clientId || (etapa !== 'marcar' && etapa !== 'revisar')) return;
    // Sem marca nenhuma (e sem tentativa de salvar), nao ha' o que guardar:
    // abrir um video e nao marcar nada nao vira "marcacao em andamento".
    const r = rascunhoAtual();
    if (rascunhoTemAlgo(r)) gravarRascunho(r); else apagarRascunho(r.arquivo);
  }, [arquivo, clientId, campos, marcacao, observacao, mexida, etapa, automaticas, automatica.resultado]);

  /* ---------------------------------------------------------- player */
  useEffect(() => {
    if (!tocando) return undefined;
    let quadro;
    const passo = () => {
      if (refVideo.current) setAgoraMs(Math.round(refVideo.current.currentTime * 1000));
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [tocando]);

  const tempoDoVideo = () => Math.round((refVideo.current?.currentTime || 0) * 1000);
  const irPara = useCallback((ms) => {
    const v = refVideo.current;
    if (!v) return;
    const fim = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.min(Math.max(0, ms / 1000), fim);
    setAgoraMs(Math.round(v.currentTime * 1000));
  }, []);
  const alternarPlay = () => {
    const v = refVideo.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {}); else v.pause();
  };
  const trocarVelocidade = (x) => {
    setVelocidade(x);
    if (refVideo.current) refVideo.current.playbackRate = x;
  };
  const quadro = (sentido) => {
    const v = refVideo.current;
    if (!v) return;
    v.pause();
    irPara(tempoDoVideo() + sentido * QUADRO_S * 1000);
  };

  /* --------------------------------------------------------- marcacao */
  // A marcacao vive num ref alem do estado: duas teclas no mesmo instante
  // (Enter repetido) leem a marcacao ja' com o toque anterior.
  const aplicar = useCallback((fn) => {
    const r = fn(refMarcacao.current);
    refMarcacao.current = r.marcacao;
    setMarcacao(r.marcacao);
    setAviso(r.aviso || null);
  }, []);

  const toque = () => aplicar((m) => marcarToque(m, tempoDoVideo()));
  const desfazer = () => aplicar(desfazerUltimo);
  const parou = () => {
    const m = refMarcacao.current;
    if (m.aberta) { aplicar((x) => encerrarParadaNoVideo(x, tempoDoVideo())); return; }
    // As mesmas travas de abrir a parada, ANTES de perguntar o motivo (sem
    // largada, dentro de outra parada, o teto de paradas): o motivo aqui so'
    // ocupa o lugar — o resultado e' descartado.
    const teste = iniciarParadaNoVideo(m, 'outro', tempoDoVideo());
    if (teste.aviso) { setAviso(teste.aviso); return; }
    refVideo.current?.pause();
    setMotivoPedido(tempoDoVideo());
  };
  const escolherMotivo = (codigo) => {
    const ms = motivoPedido;
    setMotivoPedido(null);
    aplicar((m) => iniciarParadaNoVideo(m, codigo, ms));
  };
  const encerrar = () => {
    let m = refMarcacao.current;
    const fim = tempoDoVideo();
    // Parada aberta: o Encerrar fecha ela ali, como no tablet — mas so' se a
    // medicao fechar. Recusado o Encerrar, a parada continua ABERTA: fechada
    // calada, ela terminava num ponto que ninguem escolheu.
    if (m.aberta) {
      const r1 = encerrarParadaNoVideo(m, fim);
      if (r1.aviso) { setAviso(`Ainda não dá para encerrar: ${r1.aviso}`); return; }
      m = r1.marcacao;
    }
    const r = medicaoDoVideo({
      largadaMs: m.largadaMs, toquesMs: m.toques.map((t) => t.ms), paradas: m.paradas,
      fimMs: fim, inicioFilmagem: campos.inicio,
    });
    if (r.motivo) { setAviso(`Ainda não dá para encerrar: ${r.motivo}.`); return; }
    refMarcacao.current = m;
    setMarcacao(m);
    refVideo.current?.pause();
    setFimMs(fim);
    setAviso(null);
    setEtapa('revisar');
  };

  /* ------------------------------------------- marcacao automatica */
  // A marcacao automatica comeca com a lista vazia: pondo marcas por cima
  // das do analista, nao daria para saber o que conferir.
  // A MESMA regra do rascunho (semMarcas): "sem marca" para a automatica e
  // para o que se guarda no PC nao pode discordar.
  const listaVazia = semMarcas;
  const lendo = automatica.estado === 'lendo';

  const desenharRetangulo = (qual = 'A') => {
    refVideo.current?.pause();
    setArrasto(null);
    setAviso(null);
    setDesenhando(qual);
  };
  /** Grava o retangulo da maquina (A, a linha B e as medidas da esteira) e tira o teste velho. */
  const guardarRetangulo = (novo, { testeVelho = true } = {}) => {
    setRetangulo(novo);
    gravarRetangulo(maquina?.id, novo);
    if (testeVelho) setTeste({ estado: 'parado' });
  };
  // A LINHA B (v2.113.0): tirar volta a' medicao so' com a A. A distancia
  // era entre as duas linhas: sai junto.
  const tirarLinhaB = () => {
    const { b: _b, distanciaMm: _d, ...semB } = retangulo;
    guardarRetangulo(semB);
  };
  // A distancia de A ate' B: so' a conta muda, o teste continua valendo. A
  // caixa NAO fica aqui: ela e' do produto (o cadastro), nao da maquina.
  const trocarDistancia = (distanciaMm) => guardarRetangulo({ ...retangulo, distanciaMm }, { testeVelho: false });
  const cancelarDesenho = () => { setArrasto(null); setDesenhando(false); };
  const terminarDesenho = (r) => {
    setArrasto(null);
    // O porque fica logo abaixo do video, onde se arrastou: o cartao da
    // marcacao automatica, com a tela estreita, vai para o fim da pagina
    // (revisao da v2.112.0).
    if (!retanguloValido(r)) {
      setAviso(desenhando === 'B'
        ? 'A linha B ficou pequena demais para ler. Arraste de novo, atravessando o corredor da caixa sobre o centro da fita.'
        : 'O retângulo ficou pequeno demais para ler. Arraste de novo, atravessando todo o caminho da caixa na passagem do '
          + 'rolete para o tapete.');
      return;
    }
    // `evento: 'saida'` (v2.109.0): desenhado ja' para a marca na saida. O
    // guardado antes, sem ele, foi feito para a entrada embaixo do filme —
    // a tela pede para redesenhar (ver MarcacaoAutomatica). Redesenhar a A
    // mantem a linha B (a camera e' a mesma), mas NAO a distancia: ela e'
    // entre as duas linhas, e mover qualquer uma a muda (revisao da v2.113.0
    // — mantida, a velocidade mudava calada).
    const linha = {
      x: r.x, y: r.y, largura: r.largura, altura: r.altura,
    };
    const tinhaDistancia = retangulo?.distanciaMm > 0;
    const novo = desenhando === 'B'
      ? { ...linhaSemDistancia(retangulo), b: linha }
      : { ...linha, evento: 'saida', ...(retangulo?.b ? { b: retangulo.b } : {}) };
    // O teste e o erro eram do retangulo anterior.
    guardarRetangulo(novo);
    setDesenhando(false);
    setAviso(tinhaDistancia && (desenhando === 'B' || retangulo?.b)
      ? 'A linha mudou de lugar: a distância de A até B foi apagada. Meça com trena e digite de novo.'
      : null);
    if (automatica.estado === 'erro') setAutomatica({ estado: 'parado' });
  };

  // DE ONDE A LEITURA INTEIRA COMECA: de onde o video esta' — ou, depois de
  // um teste, do comeco do teste, se o video estiver depois dele. Conferir
  // uma caixa do teste leva o video ate' ela; a leitura comecava dali e
  // perdia, calada, o que vinha antes (revisao da v2.112.0).
  const inicioDaLeitura = (agora) => (teste.estado === 'pronto' ? Math.min(agora, teste.resultado.inicioMs) : agora);
  const lerAutomatica = () => {
    // Retangulo de antes da v2.109.0 (para a entrada embaixo do filme): lido
    // pela saida, marcaria outro instante, carimbado como o do Enter.
    if (!retangulo || retangulo.evento !== 'saida' || !listaVazia(refMarcacao.current)) return;
    refVideo.current?.pause();
    const inicioMs = inicioDaLeitura(tempoDoVideo());
    const v = refVideo.current;
    // No fim do video o play() volta ao comeco: a leitura leria o video
    // inteiro dizendo que comecou no fim.
    if (v && Number.isFinite(v.duration) && inicioMs >= v.duration * 1000 - 2000) {
      setAutomatica({
        estado: 'erro',
        erro: `O vídeo está no fim (${emRelogio(inicioMs)}): volte ao ponto onde a medição começa e marque de novo.`,
      });
      return;
    }
    refUltimoProgresso.current = 0;
    setProgresso(null);
    setAviso(null);
    // A leitura do video todo responde no lugar do teste.
    setTeste({ estado: 'parado' });
    setAutomatica({
      estado: 'lendo', modo: 'tudo', inicioMs, fimMs: null, retangulo,
    });
  };

  // TESTAR O RETANGULO (v2.112.0): le' 2 min a partir de onde o video esta',
  // com a mesma conta da leitura inteira, e diz se pegou — em segundos, nao
  // depois do video todo. Nao poe marca na lista.
  const testarRetangulo = () => {
    if (!retangulo || retangulo.evento !== 'saida' || desenhando || automatica.estado === 'lendo') return;
    refVideo.current?.pause();
    refUltimoProgresso.current = 0;
    setProgresso(null);
    setAviso(null);
    setTeste({ estado: 'parado' });
    const v = refVideo.current;
    const trecho = trechoDoTeste(tempoDoVideo(), v && Number.isFinite(v.duration) ? v.duration * 1000 : null);
    if (trecho.curto) {
      setTeste({
        estado: 'erro',
        erro: `A partir de ${emRelogio(trecho.inicioMs)} sobra só ${formatarSegundos(trecho.fimMs - trecho.inicioMs)} s `
          + `de vídeo: pouco para testar. Volte o vídeo (o teste lê até ${Math.round(TESTE_MS / 60000)} min).`,
      });
      return;
    }
    setAutomatica({
      estado: 'lendo', modo: 'teste', inicioMs: trecho.inicioMs, fimMs: trecho.fimMs, retangulo,
    });
  };
  const concluirTeste = (amostras, inicioMs, fimMs, lido) => {
    setAutomatica({ estado: 'parado' });
    const res = avaliarTeste(amostras, { inicioMs, fimMs });
    setTeste({ estado: 'pronto', resultado: { ...res, linhaB: congelarLinhaB(res.linhaB, lido) } });
  };

  const concluirLeitura = (amostras, inicioMs, lido) => {
    const r = detectarVolumes(amostras);
    const trecho = `de ${emRelogio(inicioMs)} até o fim do vídeo`;
    // O retangulo pode estar certo e o trecho lido nao ter caixa (comecou
    // tarde, a linha parou): a mensagem diz as duas causas, e o que fazer em
    // cada uma — culpar so' o retangulo fazia redesenhar um retangulo certo.
    if (r.semContraste) {
      setAutomatica({
        estado: 'erro',
        erro: `Não deu para marcar: no trecho lido (${trecho}) o retângulo não mostrou diferença entre caixa e `
          + 'esteira vazia. Se nenhuma caixa passou nesse trecho, volte o vídeo para antes e leia de novo. Se passaram '
          + 'caixas, o retângulo não está sobre a passagem do rolete para o tapete, onde a caixa passa: redesenhe.',
      });
      return;
    }
    if (r.motivo) { setAutomatica({ estado: 'erro', erro: `Não deu para marcar: ${r.motivo}.` }); return; }
    // A MARCA E' NA SAIDA (v2.109.0): o fim da caixa sai do rolete e entra no
    // tapete — o mesmo instante do Enter manual e do toque do tablet.
    const s = saidasDosVolumes(r);
    if (!s.marcasMs.length) {
      setAutomatica({
        estado: 'erro',
        erro: `Nenhuma caixa passou pelo retângulo ${trecho}. Se passaram caixas nesse trecho, confira se o retângulo `
          + 'atravessa a passagem do rolete para o tapete, onde a caixa passa. Se não, volte o vídeo para antes e leia de novo.',
      });
      return;
    }
    if (s.marcasMs.length === 1) {
      setAutomatica({
        estado: 'erro',
        erro: `Só uma caixa passou pelo retângulo ${trecho}: ela seria a largada, e não sobra volume para medir. `
          + 'Volte o vídeo para antes e leia um trecho maior.',
      });
      return;
    }
    if (!listaVazia(refMarcacao.current)) {
      setAutomatica({ estado: 'erro', erro: 'A lista ganhou marcas durante a leitura: apague-as e leia de novo.' });
      return;
    }
    // Pelo mesmo caminho do Enter: a primeira saida e' a largada.
    const m = marcacaoDasEntradas(s.marcasMs);
    refMarcacao.current = m;
    setMarcacao(m);
    setAviso(null);
    setAutomaticas([m.largadaMs, ...m.toques.map((t) => t.ms)]);
    setAutomatica({
      estado: 'pronto',
      resultado: {
        volumes: m.toques.length,
        evento: 'saida',
        // So' conta a caixa que passou inteira pela faixa durante a leitura:
        // a que ja' estava no comeco e a que o video cortou antes de sair
        // ficam de fora, e a tela diz onde estao.
        jaEstava: s.jaEstava,
        semSaida: s.semSaida,
        suspeitos: s.suspeitos,
        // Na SAIDA: se era caixa, o Enter ali marca o instante certo.
        descartados: s.descartados,
        limiteCurtaMs: r.permanenciaMinimaMs,
        longos: intervalosLongos(s.marcasMs),
        // A linha B (v2.113.0): o atraso de A para B e o intervalo tipico —
        // a velocidade e o entre-pecas saem deles e da distancia medida.
        // As linhas e a distancia DESTA leitura vao junto (congelarLinhaB):
        // no F5 ou em outra maquina, o atraso nao e' dividido por outra
        // distancia.
        linhaB: congelarLinhaB(linhaBDaLeitura(amostras, s.marcasMs), lido),
      },
    });
  };

  // A LEITURA: roda enquanto o estado e' "lendo". Parar (botao) ou sair da
  // tela muda o estado ou desmonta, e a limpeza cancela a leitura.
  useEffect(() => {
    if (automatica.estado !== 'lendo' || !refVideoLeitura.current) return undefined;
    let vivo = true;
    const ehTeste = automatica.modo === 'teste';
    const leitura = analisarVideo({
      video: refVideoLeitura.current,
      retangulo: automatica.retangulo,
      retanguloB: retanguloValido(automatica.retangulo?.b) ? automatica.retangulo.b : null,
      inicioMs: automatica.inicioMs,
      fimMs: ehTeste ? automatica.fimMs : null,
      aoProgresso: (p) => {
        // ~4 vezes por segundo basta para a barra: a cada quadro, a tela
        // inteira se redesenharia 60 vezes por segundo.
        const agora = performance.now();
        if (!p.pausado && agora - refUltimoProgresso.current < 250) return;
        refUltimoProgresso.current = agora;
        setProgresso(p);
      },
    });
    leitura.promessa
      .then(({ amostras, cancelado }) => {
        if (!vivo || cancelado) return;
        if (ehTeste) concluirTeste(amostras, automatica.inicioMs, automatica.fimMs, automatica.retangulo);
        else concluirLeitura(amostras, automatica.inicioMs, automatica.retangulo);
      })
      .catch((e) => {
        if (!vivo) return;
        if (ehTeste) {
          setAutomatica({ estado: 'parado' });
          setTeste({ estado: 'erro', erro: `Não deu para testar: ${e.message}.` });
        } else setAutomatica({ estado: 'erro', erro: `Não deu para marcar: ${e.message}.` });
      });
    return () => { vivo = false; leitura.cancelar(); };
  }, [automatica.estado]);

  const apagarAutomatica = () => {
    refMarcacao.current = marcacaoVazia();
    setMarcacao(refMarcacao.current);
    setAutomaticas([]);
    setAutomatica({ estado: 'parado' });
    setAviso(null);
  };
  const conferencia = useMemo(() => conferirAutomatica(automaticas, marcacao), [automaticas, marcacao]);
  // AS LACUNAS (v2.112.2): a regra do indicador, recontada a cada marca.
  const lacunasVideo = useMemo(() => lacunasDoVideo(marcacao), [marcacao]);
  // Lista esvaziada (⌫ ate' o fim): a marcacao automatica foi desfeita
  // inteira. Sem isto, o resumo "a leitura marcou 4 volumes" ficava na tela
  // ao lado de uma lista vazia e do botao de marcar de novo.
  useEffect(() => {
    if (automatica.estado !== 'lendo' && automaticas.length && listaVazia(marcacao)) {
      setAutomaticas([]);
      setAutomatica({ estado: 'parado' });
    }
  }, [marcacao]);

  // AS TECLAS — so' na etapa de marcar, e nunca com o cursor num campo.
  useEffect(() => {
    if (etapa !== 'marcar') return undefined;
    const aoTeclar = (e) => {
      // Desenhando o retangulo, so' o Esc (cancela). Lendo o video, nenhuma:
      // marca posta durante a leitura bateria com as automaticas.
      if (desenhando) {
        if (e.key === 'Escape') { cancelarDesenho(); e.preventDefault(); }
        return;
      }
      if (lendo) return;
      if (motivoPedido != null) {
        if (e.key === 'Escape') { setMotivoPedido(null); e.preventDefault(); }
        return;
      }
      if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      // Tecla SEGURADA so' anda o video (setas, quadro a quadro). Marcar,
      // desfazer, parar e encerrar e' um aperto, uma acao: segurar o ⌫
      // apagava a lista inteira e o Enter segurado marcava dois volumes.
      if (e.repeat && !['ArrowLeft', 'ArrowRight', ',', '.'].includes(k)) {
        if (['Enter', 'Backspace', ' ', 'p', 'f'].includes(k)) e.preventDefault();
        return;
      }
      const v = refVideo.current;
      const acoes = {
        ' ': alternarPlay,
        Enter: toque,
        Backspace: desfazer,
        p: parou,
        f: encerrar,
        ArrowLeft: () => irPara(tempoDoVideo() - 5000),
        ArrowRight: () => irPara(tempoDoVideo() + 5000),
        ',': () => quadro(-1),
        '.': () => quadro(1),
        1: () => trocarVelocidade(1),
        2: () => trocarVelocidade(1.5),
        3: () => trocarVelocidade(2),
      };
      if (!acoes[k] || !v) return;
      e.preventDefault();
      acoes[k]();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  /* ---------------------------------------------- numeros enquanto marca */
  const parcial = useMemo(() => {
    const { largadaMs, toques, paradas } = marcacao;
    if (largadaMs == null || !toques.length) return null;
    const ultimo = toques[toques.length - 1].ms;
    return medicaoDoVideo({
      largadaMs, toquesMs: toques.map((t) => t.ms), paradas: paradas.filter((p) => p.fimMs <= ultimo),
      fimMs: ultimo, inicioFilmagem: campos.inicio || new Date(0).toISOString(),
    }).medicao || null;
  }, [marcacao, campos.inicio]);
  const final = useMemo(() => (fimMs == null ? null : medicaoDoVideo({
    largadaMs: marcacao.largadaMs, toquesMs: marcacao.toques.map((t) => t.ms), paradas: marcacao.paradas,
    fimMs, inicioFilmagem: campos.inicio,
  })), [marcacao, fimMs, campos.inicio]);
  // O MESMO criterio da lista, do volume a volume e do tablet: com tempo-alvo,
  // o setup do painel (descontaSetup); sem, o do takt da semana.
  const setupPlanejado = descontaSetup(alvo, takt);
  const numeros = (med) => {
    if (!med) return null;
    const porVolume = periodoPorPeca({
      relogioEntreMarcasMs: med.marcasRelogioMs, volumes: med.pecas,
      setupNoTrechoMs: med.marcasSetupMs, setupPlanejado,
    });
    const leitura = leituraPecaAPeca({
      marcasMs: med.marcasMs, taktMs: takt?.taktMs, alvoMs: alvo.alvoMs, periodoPorPecaMs: porVolume,
    });
    const calc = conferenciaRapida({ duracaoMs: med.duracaoMs, pecas: med.pecas, paradas: med.paradas });
    return { porVolume, leitura, calc };
  };
  const vivo = numeros(parcial);

  /* ---------------------------------------------------------- salvar */
  /**
   * SALVAR. Sempre com o MESMO client_id da marcacao — e, por video, o
   * servidor SUBSTITUI a medicao que ja' tiver esse id (v2.99.2). Resposta
   * perdida (rede, tempo esgotado) deixou de ser problema: o analista corrige
   * o que quiser e salva de novo, e o banco fica com a ultima versao, uma so'.
   * Antes o servidor ignorava o reenvio e a tela tentava adivinhar qual
   * tentativa tinha chegado — e errava (revisao de 31/10).
   */
  // `id` e `mexidaAtual` vem de fora quando o arquivarESalvar acabou de
  // troca-los: o estado desta renderizacao ainda tem os antigos, e o
  // rascunho com o id NOVO e a mexida VELHA faria o proximo clique gerar
  // outro id — duas medicoes.
  const salvarMedicao = async ({ id = clientId, mexidaAtual = mexida } = {}) => {
    const med = final?.medicao;
    if (!med) { setSalvar({ estado: 'parado', erro: 'Não salvou: a medição não está completa — volte a marcar e encerre de novo.' }); return; }
    if (!maquina) { setSalvar({ estado: 'parado', erro: 'Não salvou: falta a máquina da embalagem — volte a marcar e escolha a máquina.' }); return; }
    const dados = {
      clientId: id, maquina: maquina.nome, peca: campos.produto.trim() || null,
      duracaoMs: med.duracaoMs, pecas: med.pecas, ciclosPorPeca: 1, furacaoPassante: false,
      observacao: observacao.trim() || null, paradas: med.paradas,
      marcasMs: med.marcasMs, marcasRelogioMs: med.marcasRelogioMs, marcasSetupMs: med.marcasSetupMs,
      salvoEm: med.salvoEm,
    };
    // Antes de enviar: se a resposta nao voltar e o PC fechar, o rascunho ja'
    // sabe que esta marcacao pode estar no servidor.
    const tentadoAntes = refEnvioTentado.current;
    refEnvioTentado.current = true;
    gravarRascunho(rascunhoAtual({ clientId: id, mexida: mexidaAtual }));
    setSalvar({ estado: 'enviando', erro: null });
    try {
      const r = await enviarMedicaoPorVideo(dados);
      apagarRascunho(chaveDoArquivo(arquivo));
      anotarSalvo(chaveDoArquivo(arquivo), { em: new Date().toISOString(), volumes: med.pecas });
      setSubstituiu(Number(r.atualizados) > 0);
      setSalvar({ estado: 'parado', erro: null });
      setEtapa('salvo');
    } catch (e) {
      // Recusa CERTA (o servidor respondeu que nao gravou): esta tentativa
      // nao chegou, e o rascunho nao pode dizer que talvez sim. O 409 fica de
      // fora — ele diz que uma tentativa ANTERIOR chegou.
      if (!envioIncerto(e) && e.status !== 409) {
        refEnvioTentado.current = tentadoAntes;
        gravarRascunho(rascunhoAtual({ clientId: id, mexida: mexidaAtual }));
      }
      // Ja' chegou e foi mexida no PC: a Revisar diz o que fazer (e o F5 tambem).
      if (mexidaNoPc(e)) {
        setMexida(e.detalhes.conferenciaId);
        gravarRascunho(rascunhoAtual({ clientId: id, mexida: e.detalhes.conferenciaId }));
        setSalvar({ estado: 'parado', erro: null });
        return;
      }
      setSalvar({ estado: 'parado', erro: envioIncerto(e) ? mensagemIncerta(e) : `Não salvou: ${e.message}` });
    }
  };

  /**
   * A QUE CHEGOU FOI MEXIDA NO PC e esta versao e' a certa: volume e marca
   * nao se corrigem no PC, entao a que chegou vai para o arquivo (com a
   * analise e as correcoes dela, e da' para desarquivar) e esta entra como
   * medicao NOVA. O id novo nasce UMA vez e fica no rascunho: clicar de novo,
   * ou salvar de novo depois de uma resposta perdida, usa o mesmo — e o
   * servidor substitui, sem duplicar.
   */
  const arquivarESalvar = async () => {
    setSalvar({ estado: 'enviando', erro: null });
    try {
      await arquivarConferencia(mexida, true);
    } catch (e) {
      setSalvar({
        estado: 'parado',
        erro: `Não arquivou a medição que chegou (${e.message}). Nada foi salvo: tente de novo.`,
      });
      return;
    }
    const novo = crypto.randomUUID();
    refEnvioTentado.current = false;
    setMexida(null);
    setClientId(novo);
    gravarRascunho(rascunhoAtual({ clientId: novo, mexida: null, envioTentado: false }));
    await salvarMedicao({ id: novo, mexidaAtual: null });
  };

  /** A que chegou serve: esta marcacao sai, e o video fica avisando que ja' tem medicao. */
  const descartarMexida = () => {
    const chave = chaveDoArquivo(arquivo);
    anotarDescartada(chave, rascunhoAtual(), true);
    apagarRascunho(chave);
    setJaSalvo(lerSalvo(chave));
    refMarcacao.current = marcacaoVazia();
    setMarcacao(refMarcacao.current);
    setAutomaticas([]);
    setAutomatica({ estado: 'parado' });
    setMexida(null);
    setClientId(null);
    setFimMs(null);
    setObservacao('');
    setSalvar({ estado: 'parado', erro: null });
    setEtapa('preparar');
  };

  const recomecar = () => {
    setArquivo(null);
    setUrl(null);
    setMeta({ duracaoS: null, erro: null, pronto: false });
    setSubstituiu(false);
    refEnvioTentado.current = false;
    setMexida(null);
    setJaSalvo(null);
    setCampos((c) => ({ ...c, produto: '', inicio: '' }));
    refMarcacao.current = marcacaoVazia();
    setMarcacao(refMarcacao.current);
    setAutomaticas([]);
    setAutomatica({ estado: 'parado' });
    setFimMs(null);
    setObservacao('');
    setClientId(null);
    setAviso(null);
    setEtapa('preparar');
  };

  /* ------------------------------------------------------------ tela */
  const podeComecar = Boolean(url && !meta.erro && meta.pronto && maquina && inicioValido);
  // Filmagem antiga nao aparece na lista da Embalagem (ultimos 30 dias).
  const foraDaLista = inicioValido && foraDaListaDesde(campos.inicio);
  const duracaoVideoMs = meta.duracaoS != null ? meta.duracaoS * 1000 : null;
  const areaVideo = caixaVideo && meta.largura && meta.altura ? areaDaImagem({
    larguraElemento: caixaVideo.largura, alturaElemento: caixaVideo.altura,
    larguraVideo: meta.largura, alturaVideo: meta.altura,
  }) : null;

  return (
    <div style={est.tela}>
      <style>{ESTILO_GRADE}</style>
      <div className="somente-tela" style={est.telaComLateral}>
        <MenuLateral
          versao={VERSAO}
          aoVerVersao={() => setVerVersoes(true)}
          aoVoltar={aoVoltar}
          voltarRotulo="Embalagem"
          aoVerInicio={aoVerInicio}
          contexto={{
            rotulo: 'Embalagem',
            titulo: 'Cronometrar por vídeo',
            subtitulo: 'Marque cada volume assistindo à filmagem da linha',
          }}
        />
        <main style={est.conteudoLateral}>
          {carga.estado === 'carregando' && (
            <EstadoVazio modo="analise" titulo="Carregando" texto="Buscando o cadastro e o programa da embalagem." />
          )}
          {carga.estado === 'erro' && <div style={est.faixaErro} role="alert">Não deu para carregar: {carga.erro}</div>}
          {carga.estado === 'pronto' && !carga.maquinas.length && (
            <EstadoVazio
              modo="analise"
              titulo="Nenhuma máquina no grupo EMBALAGEM"
              texto="Cadastre a máquina da embalagem em Ferramentas → Máquinas: a medição por vídeo é da embalagem."
            />
          )}

          {carga.estado === 'pronto' && carga.maquinas.length > 0 && etapa === 'salvo' && (
            <section style={ev.cartao} aria-label="Medição salva">
              <p style={ev.ok} role="status">
                ✓ Medição salva: {volumes(final?.medicao?.pecas || 0)} de {campos.produto || 'produto não informado'}.
                {/* Uma tentativa anterior tinha chegado sem resposta: esta
                    versao entrou no lugar dela — uma medicao so'. */}
                {substituiu && ' Ela substituiu a versão que uma tentativa anterior tinha gravado — não ficou duplicada.'}
                {foraDaLista
                  ? ` A filmagem é de mais de ${DIAS_DA_LISTA} dias atrás: a lista da Embalagem Takt Time mostra só os últimos ${DIAS_DA_LISTA} dias, então ela não aparece lá — está no relatório Ritmo por máquina, escolhendo um período maior.`
                  : ' Ela já está na lista da Embalagem Takt Time, com o selo “por vídeo”.'}
              </p>
              <div style={ev.linhaBotoes}>
                <button type="button" style={est.botaoImprimir} onClick={aoVoltar}>Ver na Embalagem Takt Time</button>
                <button type="button" style={est.botaoSecundario} onClick={recomecar}>Marcar outro vídeo</button>
              </div>
            </section>
          )}

          {carga.estado === 'pronto' && carga.maquinas.length > 0 && etapa !== 'salvo' && (
            <div className="video-grade" style={ev.grade}>
              <div style={ev.coluna}>
                {etapa === 'preparar' && (
                  <Preparar
                    arquivo={arquivo} aoEscolher={escolherArquivo} meta={meta} campos={campos}
                    aoTrocar={(c) => setCampos((x) => ({ ...x, ...c }))}
                    maquinas={carga.maquinas} produtos={produtos} takt={takt} alvo={alvo} inicioValido={inicioValido}
                    rascunho={rascunho} aoContinuar={continuarRascunho} aoDescartar={descartarRascunho}
                    // Com marcacao guardada deste video na tela, comecar do zero
                    // a apagaria — e, se ela tinha chegado ao servidor, o mesmo
                    // trecho entraria duas vezes. Primeiro continuar ou descartar.
                    podeComecar={podeComecar && !rascunho} aoComecar={comecar}
                    retomando={retomando} aviso={avisoPreparar} jaSalvo={jaSalvo} foraDaLista={foraDaLista}
                  />
                )}
                {url && (
                  /* Na revisao o video so' some da tela: desmontado, "Voltar a
                     marcar" recomecaria do segundo zero. */
                  <section style={{ ...ev.cartao, ...(etapa === 'revisar' ? { display: 'none' } : {}) }} aria-label="Vídeo">
                    {etapa === 'marcar' && (
                      <div style={ev.linhaBotoes}>
                        {/* Sem foco no botao: o Enter seguinte seria clique nele. */}
                        <button
                          type="button" style={ev.botaoControle} onClick={voltarAoPreparo}
                          onMouseDown={(e) => e.preventDefault()} disabled={lendo || Boolean(desenhando)}
                          title={lendo || Boolean(desenhando) ? 'Termine ou pare a leitura (ou o desenho) antes' : undefined}
                        >
                          ← Voltar ao preparo
                        </button>
                        <span style={ev.dica}>
                          {[arquivo?.name, maquina?.nome, campos.produto || 'produto não informado'].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                    )}
                    {/* Sem os controles do navegador: eles roubariam o Espaco e as
                        setas das teclas de marcar. Os daqui fazem o mesmo. */}
                    <div style={ev.palco}>
                    <video
                      ref={refVideo}
                      src={url}
                      style={ev.video}
                      preload="auto"
                      playsInline
                      muted
                      tabIndex={-1}
                      onLoadedMetadata={aoCarregarMetadados}
                      onDurationChange={aoMudarDuracao}
                      onError={() => setMeta({
                        duracaoS: null, pronto: false,
                        erro: 'Este vídeo não abre no navegador — provavelmente está em HEVC (H.265). '
                          + 'Grave em H.264: no iPhone, Ajustes → Câmera → Formatos → “Mais compatível”; '
                          + 'no Samsung, desligue “Vídeos HEVC” nas configurações da câmera.',
                      })}
                      onPlay={() => setTocando(true)}
                      onPause={() => { setTocando(false); setAgoraMs(tempoDoVideo()); }}
                      onSeeked={() => setAgoraMs(tempoDoVideo())}
                      onClick={alternarPlay}
                    />
                    {etapa === 'marcar' && (
                      <CamadaRetangulo
                        area={areaVideo} retangulo={retangulo} arrasto={arrasto} desenhando={desenhando}
                        aoArrastar={setArrasto} aoTerminar={terminarDesenho} refVideo={refVideo}
                        // O que o leitor ve' (v2.112.0): enquanto se ajusta o
                        // retangulo — desenhando, ou antes de marcar.
                        mostrarLeitura={desenhando || listaVazia(marcacao)}
                      />
                    )}
                    </div>
                    {meta.erro && <div style={est.faixaErro} role="alert">{meta.erro}</div>}
                    {etapa === 'marcar' && (
                      <Controles
                        agoraMs={agoraMs} duracaoMs={duracaoVideoMs} tocando={tocando} velocidade={velocidade}
                        aoPlay={alternarPlay} aoIr={irPara} aoQuadro={quadro} aoVelocidade={trocarVelocidade}
                      />
                    )}
                    {etapa === 'marcar' && (
                      <Acoes
                        marcacao={marcacao} aviso={aviso} travado={lendo || Boolean(desenhando)}
                        aoToque={toque} aoDesfazer={desfazer} aoParou={parou} aoEncerrar={encerrar}
                      />
                    )}
                  </section>
                )}
              </div>

              {/* A coluna da direita: o painel do tablet e as marcas, e embaixo
                  a marcacao automatica (v2.108.0) — ao lado do video, sem rolar
                  ate' ela; e a conferencia dela anda junto com a lista. */}
              {etapa === 'marcar' && (
                <div style={ev.coluna}>
                  <Marcas
                    marcacao={marcacao} numeros={vivo} alvo={alvo} instante={instante}
                    produto={campos.produto} agoraMs={agoraMs} takt={takt} marcasMs={parcial?.marcasMs}
                    aoIr={irPara}
                    aoRemoverVolume={(ms) => aplicar((m) => removerVolume(m, ms))}
                    aoRemoverParada={(ms) => aplicar((m) => removerParada(m, ms))}
                  />
                  {url && !meta.erro && (
                    <MarcacaoAutomatica
                      url={url} refVideoLeitura={refVideoLeitura} maquina={maquina} retangulo={retangulo}
                      desenhando={desenhando} automatica={automatica} progresso={progresso}
                      listaVazia={listaVazia(marcacao)} conferencia={conferencia} agoraMs={agoraMs}
                      podeDesenhar={Boolean(areaVideo)} teste={teste} inicioLeituraMs={inicioDaLeitura(agoraMs)}
                      aoDesenhar={() => desenharRetangulo('A')} aoCancelarDesenho={cancelarDesenho}
                      aoDesenharB={() => desenharRetangulo('B')} aoTirarB={tirarLinhaB}
                      aoDistancia={trocarDistancia}
                      aoTestar={testarRetangulo} lacunasVideo={lacunasVideo} alvo={alvo}
                      aoLer={lerAutomatica} aoParar={() => setAutomatica({ estado: 'parado' })}
                      aoApagar={apagarAutomatica}
                      aoIr={(ms) => { refVideo.current?.pause(); irPara(ms); }}
                    />
                  )}
                </div>
              )}
              {etapa === 'revisar' && final?.medicao && (
                <Revisar
                  medicao={final.medicao} numeros={numeros(final.medicao)} alvo={alvo}
                  maquina={maquina} produto={campos.produto} conferencia={conferencia}
                  observacao={observacao} aoObservacao={setObservacao}
                  salvar={salvar} aoSalvar={() => salvarMedicao()}
                  mexida={mexida} aoArquivarESalvar={arquivarESalvar} aoDescartarMexida={descartarMexida}
                  aoVoltar={() => { setFimMs(null); setEtapa('marcar'); }}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {motivoPedido != null && (
        <div style={est.modal} role="dialog" aria-label="Por que a linha parou">
          <div style={est.caixaModal}>
            <h2 style={est.tituloModal}>Por que a linha parou?</h2>
            <p style={est.textoModal}>Parou em {emRelogio(motivoPedido)} do vídeo. Esc cancela.</p>
            <div style={ev.motivos}>
              {motivos.map((m) => (
                <button key={m.codigo} type="button" style={ev.motivo} onClick={() => escolherMotivo(m.codigo)}>
                  {m.rotulo}
                </button>
              ))}
            </div>
            <div style={est.acoesModal}>
              <button type="button" style={est.botaoSecundario} onClick={() => setMotivoPedido(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {verVersoes && <HistoricoVersoes modo="analise" aoFechar={() => setVerVersoes(false)} />}
    </div>
  );
}

/** PREPARAR: o arquivo, a maquina, o produto e quando a filmagem comecou. */
function Preparar({
  arquivo, aoEscolher, meta, campos, aoTrocar, maquinas, produtos, takt, alvo, inicioValido,
  rascunho, aoContinuar, aoDescartar, podeComecar, aoComecar, retomando, aviso, jaSalvo, foraDaLista,
}) {
  const motivoTakt = takt && !(takt.taktMs > 0) ? (motivoSemTakt(takt.estado) || 'sem programa da embalagem para esta semana') : null;
  // As marcacoes guardadas de OUTROS videos: continuam guardadas, e a tela
  // diz quais — escolher o mesmo arquivo as traz de volta; a que nao serve
  // mais se descarta dali (v2.112.1). `descartadas` so' redesenha a lista.
  const [, setDescartadas] = useState(0);
  const outras = arquivo ? [] : rascunhosGuardados();
  const quando = (iso) => new Date(iso).toLocaleString('pt-BR');
  return (
    <section style={ev.cartao} aria-label="Preparar a medição por vídeo">
      <h2 style={ev.titulo}>Cronometrar por vídeo</h2>
      <p style={ev.dica}>
        Filme a embalagem com o celular num tripé, enquadrando o ponto onde o volume fecha. Aqui, escolha o
        arquivo: ele abre neste PC e não é enviado para lugar nenhum. Depois, assista e marque cada volume.
      </p>
      <label style={ev.campo}>
        <span style={ev.rotulo}>Vídeo</span>
        <input
          type="file" accept="video/*" aria-label="Arquivo de vídeo"
          onChange={(e) => aoEscolher(e.target.files?.[0] || null)}
        />
        {arquivo && (
          <span style={ev.dica}>
            {arquivo.name}
            {meta.duracaoS != null && ` · ${formatarDuracao(meta.duracaoS * 1000)} de vídeo`}
          </span>
        )}
        {/* Gravador de tela e alguns apps gravam WebM sem a duracao: marca-se
            igual, so' sem a barra de posicao e sem a sugestao de inicio. */}
        {arquivo && meta.pronto && meta.duracaoS == null && (
          <span style={ev.dica}>
            Este vídeo não informa a duração: dá para marcar normalmente, mas sem a barra de posição e sem a
            sugestão do início — informe o início da filmagem abaixo.
          </span>
        )}
      </label>

      {outras.length > 0 && (
        <div style={ev.guardadas}>
          <p style={ev.dica}>
            {outras.length === 1 ? 'Uma marcação em andamento neste PC' : `${outras.length} marcações em andamento neste PC`}
            {' '}— para continuar, escolha o mesmo arquivo:
          </p>
          <ul style={ev.listaGuardadas} aria-label="Marcações em andamento neste PC">
            {outras.map((r) => (
              <MarcacaoGuardada
                key={r.arquivo} r={r} quando={quando}
                // O de AGORA no PC, nao o de quando a lista foi desenhada:
                // outra aba pode ter tentado salvar este video nesse meio.
                aoDescartar={() => {
                  descartarGuardada(lerMapa(CHAVE_RASCUNHOS)[r.arquivo] || r);
                  setDescartadas((n) => n + 1);
                }}
              />
            ))}
          </ul>
        </div>
      )}

      {jaSalvo && (
        <div style={ev.aviso} role="status">
          {jaSalvo.chegou && `Uma marcação deste vídeo foi descartada neste PC em ${quando(jaSalvo.em)}, e uma versão dela já está no sistema: confira ${ondeConferir(jaSalvo.inicio)}. Salvar de novo o mesmo trecho cria outra medição: o takt e a junção contariam os mesmos volumes duas vezes. `}
          {jaSalvo.incerto && `Uma marcação deste vídeo${jaSalvo.volumes ? ` (${volumes(jaSalvo.volumes)})` : ''} foi descartada neste PC em ${quando(jaSalvo.em)} depois de uma tentativa de salvar sem resposta: ela pode ter chegado. Confira ${ondeConferir(jaSalvo.inicio)} antes de marcar o mesmo trecho — se ela estiver lá, salvar de novo cria outra medição, e o takt e a junção contariam os mesmos volumes duas vezes. `}
          {!jaSalvo.chegou && !jaSalvo.incerto && `Este vídeo já foi salvo neste PC em ${quando(jaSalvo.em)} (${volumes(jaSalvo.volumes)}). Salvar de novo o mesmo trecho cria outra medição: o takt e a junção contariam os mesmos volumes duas vezes. `}
          Outro trecho do vídeo pode ser salvo sem problema.
        </div>
      )}

      {rascunho && (
        <div style={ev.aviso} role="status">
          Há uma marcação em andamento deste vídeo ({marcasEmPalavras(rascunho.marcacao) || 'nenhuma marca'} —
          guardada neste PC em {quando(rascunho.atualizadoEm)}). Continuar usa o que foi guardado com ela:{' '}
          {[rascunho.maquinaNome, rascunho.campos.produto || 'sem produto',
            rascunho.campos.inicio ? `início ${new Date(rascunho.campos.inicio).toLocaleString('pt-BR')}` : null]
            .filter(Boolean).join(' · ')}.{' '}
          {/* Tentou salvar e a resposta nao voltou: pode estar no servidor. */}
          {rascunho.mexida && (
            <>
              <strong>Uma versão dela já está no sistema e foi mexida no PC depois</strong>: salvar de novo não a
              substitui. Continue para escolher — arquivar a que chegou e salvar esta como nova, ou descartar esta.{' '}
            </>
          )}
          {!rascunho.mexida && (rascunho.envioTentado || rascunho.incerto) && (
            <>
              <strong>Ela pode já estar no servidor</strong>: uma tentativa de salvar ficou sem resposta.
              Continue e salve — a versão nova substitui a que tiver chegado, sem duplicar.{' '}
            </>
          )}
          <span style={ev.linhaBotoes}>
            <button type="button" style={est.botaoSecundario} onClick={aoContinuar} disabled={!!meta.erro || !meta.pronto}>
              Continuar de onde parou
            </button>
            <button type="button" style={ev.link} onClick={aoDescartar}>Descartar e começar de novo</button>
          </span>
        </div>
      )}
      {aviso && <div style={ev.aviso} role="alert">{aviso}</div>}

      <div style={ev.campos}>
        <label style={ev.campo}>
          <span style={ev.rotulo}>Máquina</span>
          <select
            value={campos.maquinaId}
            // Retomando, o produto e' o da marcacao: trocar a maquina nao o apaga.
            onChange={(e) => aoTrocar(retomando ? { maquinaId: e.target.value } : { maquinaId: e.target.value, produto: '' })}
            style={est.inputNome} aria-label="Máquina da embalagem"
          >
            {!campos.maquinaId && <option value="">Escolha a máquina…</option>}
            {maquinas.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </label>
        <label style={ev.campo}>
          <span style={ev.rotulo}>Produto</span>
          <SeletorProduto
            valor={campos.produto} aoTrocar={(v) => aoTrocar({ produto: v })} opcoes={produtos}
            estilos={{ input: est.inputNome, select: est.inputNome, link: ev.link }}
            aria="Produto embalado"
          />
        </label>
        <label style={ev.campo}>
          <span style={ev.rotulo}>Início da filmagem</span>
          <input
            type="datetime-local" step="1" value={campos.inicio}
            onChange={(e) => aoTrocar({ inicio: e.target.value })}
            style={est.inputNome} aria-label="Data e hora em que a filmagem começou"
          />
        </label>
      </div>
      <p style={ev.dica}>
        {/* A data decide a semana e o takt: errada, a medicao e' julgada pelo
            programa de outra semana. Por isso ela vai escrita, com o takt. */}
        {!inicioValido && 'Informe quando a filmagem começou: é a data que decide a semana e o takt. '}
        {/* O veredito e' contra o TEMPO-ALVO do produto (v2.106.0); o takt
            da semana da filmagem fica como a carga, sem julgar. */}
        {alvo.alvoMs > 0
          ? <>Tempo-alvo do produto: <strong>{formatarSegundos(alvo.alvoMs)} s por volume</strong>. {explicacaoDoAlvo(alvo)}{' '}</>
          : `Sem tempo-alvo: ${semAlvo(alvo.estado, alvo.mensagem)} `}
        {/* A carga da semana NESTE PRODUTO (v2.107.0); sem a semana no painel, o takt por volume. */}
        {inicioValido && fraseDaSemana(alvo) && <>{fraseDaSemana(alvo)}{' '}</>}
        {inicioValido && !fraseDaSemana(alvo) && takt?.taktMs > 0 && (
          <>
            Carga da semana {takt.semana}: takt de {formatarSegundos(takt.taktMs)} s por volume
            {diasProgramados(takt.dias) ? ` · ${diasProgramados(takt.dias)}` : ''} — não julga o produto.{' '}
          </>
        )}
        {inicioValido && motivoTakt && `Sem takt para essa data: ${motivoTakt} `}
        {foraDaLista && `Filmagem de mais de ${DIAS_DA_LISTA} dias atrás: salva, ela não aparece na lista da Embalagem Takt Time, que mostra os últimos ${DIAS_DA_LISTA} dias. `}
        A data sugerida vem do arquivo (o celular grava no fim da filmagem). Confira: arquivo copiado de outro
        computador perde a data original.
      </p>
      <div style={ev.linhaBotoes}>
        <button type="button" style={est.botaoImprimir} onClick={aoComecar} disabled={!podeComecar}>
          {retomando ? 'Continuar a marcação' : 'Começar a marcar'}
        </button>
        {!podeComecar && arquivo && !meta.erro && !meta.pronto && <span style={ev.dica}>Abrindo o vídeo…</span>}
        {rascunho && <span style={ev.dica}>Continue ou descarte a marcação guardada deste vídeo antes de começar outra.</span>}
      </div>
    </section>
  );
}

/** A barra do player: tempo, posicao, voltar/avancar, quadro a quadro, velocidade. */
function Controles({
  agoraMs, duracaoMs, tocando, velocidade, aoPlay, aoIr, aoQuadro, aoVelocidade,
}) {
  // Os botoes nao ficam com o foco: o Enter seguinte seria clique neles.
  const semFoco = (e) => e.preventDefault();
  return (
    <div style={ev.controlesBloco} aria-label="Controles do vídeo">
      <div style={ev.controles}>
        <span style={ev.tempo} aria-label="Tempo do vídeo">
          {emRelogio(agoraMs)}{duracaoMs != null && ` / ${emRelogio(duracaoMs)}`}
        </span>
        {duracaoMs != null && (
          <input
            type="range" min={0} max={Math.round(duracaoMs)} step={100} value={Math.min(agoraMs, duracaoMs)}
            onChange={(e) => aoIr(Number(e.target.value))}
            onPointerUp={(e) => e.currentTarget.blur()}
            style={ev.barraTempo} aria-label="Posição no vídeo"
          />
        )}
      </div>
      <div style={ev.controles}>
      <button type="button" style={ev.botaoControle} onMouseDown={semFoco} onClick={aoPlay}>
        {tocando ? '❚❚ Pausar' : '▶ Assistir'}
      </button>
      <button type="button" style={ev.botaoControle} onMouseDown={semFoco} onClick={() => aoIr(agoraMs - 5000)}>−5 s</button>
      <button type="button" style={ev.botaoControle} onMouseDown={semFoco} onClick={() => aoQuadro(-1)}>◂ quadro</button>
      <button type="button" style={ev.botaoControle} onMouseDown={semFoco} onClick={() => aoQuadro(1)}>quadro ▸</button>
      <button type="button" style={ev.botaoControle} onMouseDown={semFoco} onClick={() => aoIr(agoraMs + 5000)}>+5 s</button>
      {[1, 1.5, 2].map((x) => (
        <button
          key={x} type="button" onMouseDown={semFoco} onClick={() => aoVelocidade(x)}
          style={{ ...ev.botaoControle, ...(velocidade === x ? ev.botaoControleAtivo : {}) }}
          aria-pressed={velocidade === x}
        >
          {String(x).replace('.', ',')}×
        </button>
      ))}
      </div>
    </div>
  );
}

/** As quatro acoes que tem tecla, com a tecla escrita no botao; e o aviso de quando nao marcou. */
function Acoes({
  marcacao, aviso, aoToque, aoDesfazer, aoParou, aoEncerrar, travado = false,
}) {
  const semFoco = (e) => e.preventDefault();
  const largada = marcacao.largadaMs == null;
  return (
    <>
      {marcacao.aberta && (
        <p style={ev.paradaAberta} role="status">
          PARADA · {rotuloMotivo(marcacao.aberta.motivo)} desde {emRelogio(marcacao.aberta.inicioMs)} — avance até a
          linha voltar e aperte P (Voltou).
        </p>
      )}
      <div style={ev.acoes} aria-label="Marcar">
        <button
          type="button" onMouseDown={semFoco} onClick={aoToque} disabled={travado}
          style={{ ...ev.acao, ...(largada ? ev.acaoLargada : ev.acaoVolume) }}
        >
          {largada ? 'Largada' : '+1 volume'} <span style={ev.tecla}>Enter</span>
        </button>
        <button type="button" onMouseDown={semFoco} onClick={aoDesfazer} style={ev.acao} disabled={travado}>
          Desfazer volume <span style={ev.tecla}>⌫</span>
        </button>
        <button type="button" onMouseDown={semFoco} onClick={aoParou} style={{ ...ev.acao, ...ev.acaoParou }} disabled={travado}>
          {marcacao.aberta ? 'Voltou' : 'Parou'} <span style={ev.tecla}>P</span>
        </button>
        <button type="button" onMouseDown={semFoco} onClick={aoEncerrar} style={{ ...ev.acao, ...ev.acaoEncerrar }} disabled={travado}>
          Encerrar <span style={ev.tecla}>F</span>
        </button>
      </div>
      {aviso && <p style={ev.aviso} role="alert">{aviso}</p>}
      <p style={ev.teclas}>
        {largada
          ? 'Assista até o fim de uma caixa sair do rolete e entrar no tapete e aperte Enter: é a largada — ela abre o período e não conta volume, como no tablet. '
          : 'Enter quando o fim da caixa sai do rolete e entra no tapete; ⌫ desfaz o último volume marcado (parada sai pelo × da lista). '}
        Espaço pausa · ← → 5 s · , . um quadro · 1 2 3 velocidade 1×, 1,5×, 2× · clique numa marca para voltar a ela.
      </p>
    </>
  );
}

/** A coluna das marcas: os numeros (os mesmos do tablet) e a lista, em ordem de video. */
function Marcas({
  marcacao, numeros, alvo, instante, produto, agoraMs, takt, marcasMs, aoIr, aoRemoverVolume, aoRemoverParada,
}) {
  const { largadaMs, toques, paradas, aberta } = marcacao;
  const itens = [
    ...(largadaMs != null ? [{ tipo: 'largada', ms: largadaMs }] : []),
    ...toques.map((t, i) => ({
      tipo: 'volume', ms: t.ms, n: i + 1, intervalo: t.ms - (i ? toques[i - 1].ms : largadaMs),
    })),
    ...paradas.map((p) => ({ tipo: 'parada', ms: p.inicioMs, parada: p })),
    ...(aberta ? [{ tipo: 'parada', ms: aberta.inicioMs, parada: aberta }] : []),
  ].sort((a, b) => a.ms - b.ms || (a.tipo === 'parada' ? -1 : 1));
  const lacunas = numeros?.leitura?.suficiente ? numeros.leitura.lacunas.length : null;
  // O PASSO DA LINHA (v2.112.1): por volume sem parada marcada nem lacuna, o
  // mesmo "sem as lacunas" do Volume a volume (normalMs) — a regua da UEP.
  // Sem os 10 intervalos da leitura, nao ha' passo: "—".
  const semLacunasMs = numeros?.leitura?.suficiente ? numeros.leitura.normalMs : null;
  // As paradas daqui sao intervalos do video (inicio/fim), nao duracoes.
  const parado = paradas.reduce((soma, p) => soma + (p.fimMs - p.inicioMs), 0);
  const ultimo = toques.length ? toques[toques.length - 1].ms : null;
  // Volumes/hora do periodo ate' o ultimo volume, paradas dentro — a conta
  // do tablet (nao e' velocimetro: so' muda quando se marca).
  const volHora = toques.length >= 2 && ultimo > largadaMs ? Math.round((toques.length * 3600000) / (ultimo - largadaMs)) : null;
  const quando = largadaMs != null ? instante(largadaMs) : null;
  // O ULTIMO do tablet: entre as duas ultimas marcas no relogio da linha
  // rodando (a parada marcada sai), as mesmas marcas que vao ao sync.
  const ultimoMs = marcasMs?.length >= 2 ? marcasMs[marcasMs.length - 1] - marcasMs[marcasMs.length - 2] : null;
  // O TEMPO do tablet: desde a largada, no relogio do video (paradas dentro).
  const decorridoMs = largadaMs != null ? Math.max(0, agoraMs - largadaMs) : 0;
  return (
    /* Sem o "sticky" de antes: com a marcacao automatica embaixo, a lista
       grudada no topo correria por cima dela. */
    <aside style={ev.cartao} aria-label="Marcas da medição">
      {/* A MESMA VISAO DO CRONOMETRO DO TABLET (v2.108.0): o tempo por volume
          contra o tempo-alvo, vermelho ▲ acima e verde ✓ dentro, e o apoio.
          As letras saem do tamanho da caixa (ver PainelTakt). */}
      <style>{ESTILO_TAKT}</style>
      <div style={ev.painelTablet}>
        <PainelTakt
          produto={produto} decorridoMs={decorridoMs} volumes={toques.length} unidade={VOLUME}
          porVolumeMs={numeros?.porVolume || null} alvoMs={alvo?.alvoMs > 0 ? alvo.alvoMs : null}
          volHora={volHora} ultimoMs={ultimoMs} semana={alvo?.semana || null} taktMs={takt?.taktMs || null}
          // A lista logo abaixo mostra o intervalo COM a parada dentro; este,
          // como o do tablet, e' sem ela — o rotulo diz de que tempo sai.
          rotuloUltimo="Último rodando"
        />
      </div>
      <div style={ev.numeros}>
        <Numero rotulo="Sem as lacunas" valor={semLacunasMs > 0 ? `${formatarSegundos(semLacunasMs)} s` : '—'} sub="por volume: o passo da linha" />
        <Numero rotulo="Lacunas" valor={lacunas != null ? String(lacunas) : '—'} />
        <Numero rotulo="Parado" valor={parado > 0 ? duracaoCurta(parado) : '—'} />
      </div>
      {quando && (
        <p style={ev.dica}>
          Largada em {quando.toLocaleString('pt-BR')} (início da filmagem + {emRelogio(largadaMs)} do vídeo).
        </p>
      )}
      <ul style={ev.lista} aria-label="Marcas">
        {!itens.length && <li style={ev.dica}>Nenhuma marca ainda.</li>}
        {itens.map((it) => (
          <li key={`${it.tipo}-${it.ms}`} style={{ ...ev.item, ...(it.tipo === 'parada' ? ev.itemParada : {}) }}>
            <button type="button" style={ev.itemTempo} onClick={() => aoIr(it.ms)} title="Levar o vídeo a este ponto">
              {emRelogio(it.ms)}
            </button>
            <span style={ev.itemTexto}>
              {it.tipo === 'largada' && 'Largada (não conta volume)'}
              {it.tipo === 'volume' && `Volume ${it.n}`}
              {it.tipo === 'parada' && (
                <>
                  Parada · {rotuloMotivo(it.parada.motivo)}
                  {it.parada.fimMs != null
                    ? ` até ${emRelogio(it.parada.fimMs)} (${duracaoCurta(it.parada.fimMs - it.parada.inicioMs)})`
                    : ' — aberta'}
                </>
              )}
            </span>
            <span style={ev.itemNumero}>
              {it.tipo === 'volume' && `${formatarSegundos(it.intervalo)} s${it.n === 1 ? ' desde a largada' : ''}`}
            </span>
            {it.tipo === 'largada' ? <span /> : (
              <button
                type="button" style={ev.itemRemover}
                onClick={() => (it.tipo === 'volume' ? aoRemoverVolume(it.ms) : aoRemoverParada(it.ms))}
                aria-label={it.tipo === 'volume' ? `Remover o volume ${it.n} (${emRelogio(it.ms)})` : `Remover a parada de ${emRelogio(it.ms)}`}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function Numero({
  rotulo, valor, atencao = false, sub = null,
}) {
  return (
    <div style={ev.numero}>
      <span style={ev.rotulo}>{rotulo}</span>
      <span style={{ ...ev.numeroValor, ...(atencao ? ev.numeroAtencao : {}) }}>{valor}</span>
      {/* De que tempo o numero sai: o mesmo nome com reguas diferentes
          virou divergencia entre tablet e PC uma vez (10,3 contra 13,2). */}
      {sub && <span style={ev.numeroSub}>{sub}</span>}
    </div>
  );
}

/** REVISAR: a previa do volume a volume antes de salvar — e a volta para corrigir. */
function Revisar({
  medicao, numeros, alvo, maquina, produto, observacao, aoObservacao, salvar, aoSalvar, aoVoltar,
  mexida, aoArquivarESalvar, aoDescartarMexida, conferencia = null,
}) {
  const { porVolume, leitura, calc } = numeros;
  const acima = alvo?.alvoMs > 0 && porVolume > alvo.alvoMs;
  const inicio = new Date(medicao.iniciadoEm);
  const fim = new Date(medicao.salvoEm);
  return (
    <section style={{ ...ev.cartao, gridColumn: '1 / -1' }} aria-label="Revisar a medição">
      <h2 style={ev.titulo}>{produto || 'Produto não informado'} · {maquina?.nome}</h2>
      <p style={ev.dica}>
        {inicio.toLocaleDateString('pt-BR')} · {inicio.toLocaleTimeString('pt-BR')}–{fim.toLocaleTimeString('pt-BR')}
        {' '}· {formatarDuracao(medicao.duracaoMs)} de medição · por vídeo
      </p>
      <div style={ev.numeros}>
        <Numero rotulo="Volumes" valor={String(medicao.pecas)} />
        <Numero
          rotulo={acima ? 'Por vol ▲ alvo' : 'Por volume no período'}
          valor={porVolume ? `${formatarSegundos(porVolume)} s` : '—'}
          atencao={acima}
        />
        <Numero rotulo="Tempo-alvo" valor={alvo?.alvoMs > 0 ? `${formatarSegundos(alvo.alvoMs)} s` : '—'} />
        <Numero
          rotulo="Por vol. sem as lacunas"
          valor={leitura?.suficiente && leitura.normalMs > 0 ? `${formatarSegundos(leitura.normalMs)} s` : '—'}
          sub="o passo da linha: sem parada marcada nem lacuna"
        />
        <Numero
          rotulo="Volumes/hora" valor={calc ? String(Math.round(calc.pecasPorHoraBruto)) : '—'}
          sub="da largada ao Encerrar, paradas dentro"
        />
        <Numero rotulo="Lacunas" valor={leitura?.suficiente ? String(leitura.lacunas.length) : '—'} />
        <Numero rotulo="Parado (marcado)" valor={calc?.paradaMs > 0 ? duracaoCurta(calc.paradaMs) : '—'} />
      </div>
      {leitura && !leitura.suficiente && (
        <p style={ev.dica}>Poucos volumes para ler o intervalo: {leitura.motivo}. O tempo por volume vale; as lacunas e o sem as lacunas, ainda não.</p>
      )}
      {conferencia && <p style={ev.dica}><TextoConferencia c={conferencia} /></p>}
      {leitura && <GraficoIntervalos leitura={leitura} unidade={VOLUME} altura={240} />}
      <label style={ev.campo}>
        <span style={ev.rotulo}>Observação (opcional)</span>
        <textarea
          style={ev.observacao} value={observacao} maxLength={2000}
          onChange={(e) => aoObservacao(e.target.value)} disabled={salvar.estado === 'enviando'}
          aria-label="Observação da medição"
          placeholder="O que o vídeo mostra e o número não diz: troca de operador, falta de caixa…"
        />
      </label>
      {/* A mensagem ja' diz se nao salvou ou se nao se sabe (mensagemIncerta). */}
      {salvar.erro && <div style={est.faixaErro} role="alert">{salvar.erro}</div>}
      {mexida && (
        /* O 409 de mexida no PC: salvar de novo daria o mesmo 409. O que da'
           para fazer de verdade — volume e marca nao se corrigem no PC. */
        <div style={ev.aviso} role="alert">
          Esta medição já chegou ao sistema numa tentativa anterior e foi mexida no PC depois (produto, paradas,
          análise ou arquivo). Salvar de novo não a substitui, para não apagar esse trabalho — e volume e marca não se
          corrigem no PC. <strong>Se esta versão é a certa</strong>, arquive a que chegou e salve esta como medição
          nova: a análise e as correções ficam na arquivada, que dá para desarquivar. <strong>Se a que chegou
          serve</strong>, descarte esta marcação.
          <div style={{ ...ev.linhaBotoes, marginTop: 8 }}>
            <button type="button" style={est.botaoImprimir} onClick={aoArquivarESalvar} disabled={salvar.estado === 'enviando'}>
              {salvar.estado === 'enviando' ? 'Salvando…' : 'Arquivar a que chegou e salvar esta'}
            </button>
            <button type="button" style={est.botaoSecundario} onClick={aoDescartarMexida} disabled={salvar.estado === 'enviando'}>
              Descartar esta marcação
            </button>
          </div>
        </div>
      )}
      <div style={ev.linhaBotoes}>
        {!mexida && (
          <button type="button" style={est.botaoImprimir} onClick={aoSalvar} disabled={salvar.estado === 'enviando'}>
            {salvar.estado === 'enviando' ? 'Salvando…' : 'Salvar medição'}
          </button>
        )}
        <button type="button" style={est.botaoSecundario} onClick={aoVoltar} disabled={salvar.estado === 'enviando'}>
          Voltar a marcar
        </button>
      </div>
    </section>
  );
}

/**
 * O RETANGULO por cima do video: mostra o guardado e, no modo de desenhar,
 * recebe o arrasto. As contas de posicao (faixa preta, fracao da imagem)
 * sao do dominio (deteccaoVolumes.js).
 */
function CamadaRetangulo({
  area, retangulo, arrasto, desenhando, aoArrastar, aoTerminar, refVideo, mostrarLeitura,
}) {
  if (!area) return null;
  const arrastado = arrasto ? retanguloEntre(arrasto.a, arrasto.b) : null;
  // A (o que marca as caixas) e a linha B (v2.113.0, a velocidade): o que
  // esta' sendo desenhado aparece no lugar do guardado.
  const visivelA = arrastado && desenhando === 'A' ? arrastado : retangulo;
  const visivelB = arrastado && desenhando === 'B' ? arrastado : (retanguloValido(retangulo?.b) ? retangulo.b : null);
  const ponto = (e) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    return pontoNaImagem(e.clientX - caixa.left, e.clientY - caixa.top, area);
  };
  const caixaDe = (r) => ({
    left: area.x + r.x * area.largura,
    top: area.y + r.y * area.altura,
    width: r.largura * area.largura,
    height: r.altura * area.altura,
  });
  return (
    <>
      {visivelA && mostrarLeitura && (
        <LeituraDoRetangulo refVideo={refVideo} area={area} retangulo={visivelA} prefixo={visivelB ? 'A · ' : ''} />
      )}
      {visivelB && mostrarLeitura && (
        <LeituraDoRetangulo refVideo={refVideo} area={area} retangulo={visivelB} prefixo="B · " linhaB />
      )}
      {visivelA && <div aria-hidden="true" style={{ ...ev.retangulo, ...caixaDe(visivelA) }} />}
      {visivelB && <div aria-hidden="true" style={{ ...ev.retangulo, ...ev.retanguloB, ...caixaDe(visivelB) }} />}
      {desenhando && (
        <CamadaDesenho
          ponto={ponto} arrasto={arrasto} aoArrastar={aoArrastar} aoTerminar={aoTerminar} refVideo={refVideo}
        />
      )}
    </>
  );
}

/**
 * A CAMADA DE DESENHO: recebe o arrasto e mostra a LUPA (v2.113.0) — o
 * video ampliado 5x em volta do ponteiro, com a mira. A linha fina sobre o
 * centro de uma fita de 5 cm fica a 8–18 px da outra numa camera de lado:
 * 1 px de erro no mouse era 5–10% na velocidade.
 */
function CamadaDesenho({
  ponto, arrasto, aoArrastar, aoTerminar, refVideo,
}) {
  const [mira, setMira] = useState(null);
  return (
    <>
      <div
        style={ev.camadaDesenho}
        aria-label="Desenhar o retângulo: clique e arraste sobre o vídeo"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = ponto(e);
          setMira(p);
          aoArrastar({ a: p, b: p });
        }}
        onPointerMove={(e) => {
          const p = ponto(e);
          setMira(p);
          if (arrasto) aoArrastar({ a: arrasto.a, b: p });
        }}
        onPointerLeave={() => { if (!arrasto) setMira(null); }}
        onPointerUp={(e) => { if (arrasto) aoTerminar(retanguloEntre(arrasto.a, ponto(e))); }}
        // O navegador tomou o arrasto (alt-tab, gesto do sistema): sem isto,
        // o retangulo seguia o mouse com o botao ja' solto.
        onPointerCancel={() => aoArrastar(null)}
      />
      {mira && <Lupa refVideo={refVideo} mira={mira} />}
    </>
  );
}

/** A LUPA: o quadro do video em volta da mira, 5x, sem suavizar (cada pixel do video, um quadrado). */
function Lupa({ refVideo, mira }) {
  const ref = useRef(null);
  useEffect(() => {
    const v = refVideo.current;
    const c = ref.current;
    if (!v || !c || !v.videoWidth || v.readyState < 2) return;
    const ctx = c.getContext('2d');
    const L = c.width;
    const lado = L / 5;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, L, L);
    ctx.drawImage(v, mira.x * v.videoWidth - lado / 2, mira.y * v.videoHeight - lado / 2, lado, lado, 0, 0, L, L);
    ctx.strokeStyle = '#22D3EE';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2, L);
    ctx.moveTo(0, L / 2); ctx.lineTo(L, L / 2);
    ctx.stroke();
  }, [refVideo, mira]);
  return <canvas ref={ref} width={200} height={200} aria-label="Lupa: o vídeo ampliado em volta do ponteiro" style={ev.lupa} />;
}

/**
 * O QUE O LEITOR VE' NO RETANGULO (v2.112.0), ao vivo, sobre o video: os
 * pontos que ele conta como papelao pintados de rosa e, ao lado, quanto do
 * retangulo eles sao. E' o mesmo medidor da leitura (criarMedidor, 64x32,
 * ehPapelao) — a caixa tem de ficar pintada quando passa, e o resto nao.
 * Sem isto, o analista so' descobria que o retangulo nao pegava depois de
 * ler o video inteiro.
 *
 * Desenhado por fora do React (canvas e texto pela ref): a cada quadro do
 * video tocando, so' este pedaco muda.
 */
function LeituraDoRetangulo({
  refVideo, area, retangulo, prefixo = '', linhaB = false,
}) {
  const refCanvas = useRef(null);
  const refRotulo = useRef(null);
  const refRet = useRef(retangulo);
  refRet.current = retangulo;
  const medidor = useMemo(() => criarMedidor(), []);

  const desenhar = useCallback(() => {
    const canvas = refCanvas.current;
    const rotulo = refRotulo.current;
    if (!canvas || !rotulo) return;
    const ctx = canvas.getContext('2d');
    const m = medidor(refVideo.current, refRet.current);
    if (!m) {
      ctx.clearRect(0, 0, LARGURA_MEDIDA, ALTURA_MEDIDA);
      rotulo.textContent = `${prefixo}— papelão`;
      rotulo.dataset.papelao = '';
      return;
    }
    const img = ctx.createImageData(LARGURA_MEDIDA, ALTURA_MEDIDA);
    for (let i = 0; i < m.rgba.length; i += 4) {
      if (ehPapelao(m.rgba[i], m.rgba[i + 1], m.rgba[i + 2])) {
        img.data[i] = 236; img.data[i + 1] = 72; img.data[i + 2] = 153; img.data[i + 3] = 170;
      }
    }
    ctx.putImageData(img, 0, 0);
    const pct = Math.round(m.fracao * 100);
    rotulo.textContent = `${prefixo}${pct}% papelão`;
    rotulo.dataset.papelao = String(pct);
  }, [medidor, refVideo, prefixo]);

  // O retangulo mudou (arrasto, outro desenho): mede de novo, no mesmo quadro.
  useEffect(() => { desenhar(); }, [desenhar, retangulo.x, retangulo.y, retangulo.largura, retangulo.altura]);

  // O video mudou de quadro: tocando (a cada quadro mostrado), indo a um
  // ponto, pausando.
  useEffect(() => {
    const v = refVideo.current;
    if (!v) return undefined;
    let vivo = true;
    let pedido = null;
    const temQuadros = typeof v.requestVideoFrameCallback === 'function';
    const aoQuadro = () => {
      if (!vivo) return;
      desenhar();
      pedido = v.requestVideoFrameCallback(aoQuadro);
    };
    if (temQuadros) pedido = v.requestVideoFrameCallback(aoQuadro);
    const eventos = ['loadeddata', 'seeked', 'pause', 'timeupdate'];
    eventos.forEach((e) => v.addEventListener(e, desenhar));
    return () => {
      vivo = false;
      if (pedido != null) v.cancelVideoFrameCallback?.(pedido);
      eventos.forEach((e) => v.removeEventListener(e, desenhar));
    };
  }, [desenhar, refVideo]);

  const left = area.x + retangulo.x * area.largura;
  const top = area.y + retangulo.y * area.altura;
  const width = retangulo.largura * area.largura;
  const height = retangulo.altura * area.altura;
  // O numero em cima do retangulo; colado no alto da imagem, embaixo dele.
  const topoRotulo = top - area.y >= 26 ? top - 24 : top + height + 4;
  return (
    <>
      <canvas
        ref={refCanvas} width={LARGURA_MEDIDA} height={ALTURA_MEDIDA} aria-hidden="true"
        style={{
          ...ev.mascaraPapelao, left, top, width, height,
        }}
      />
      <span
        ref={refRotulo} {...(linhaB ? { 'data-leitura-linha-b': '' } : { 'data-leitura-retangulo': '' })}
        title="Quanto do retângulo o leitor conta como papelão neste quadro (pintado de rosa)"
        style={{ ...ev.rotuloPapelao, left, top: topoRotulo }}
      />
    </>
  );
}

/** "das 12 marcas automáticas, 11 ficaram…" — a medida de quanto a marcacao automatica acertou. */
function TextoConferencia({ c }) {
  return (
    <>
      Conferência da marcação automática: {c.automaticas === 1 ? 'da 1 marca' : `das ${c.automaticas} marcas`} que
      {' '}ela pôs, <strong>{c.mantidas} {c.mantidas === 1 ? 'ficou' : 'ficaram'}</strong>,
      {' '}{c.apagadas} {c.apagadas === 1 ? 'foi apagada' : 'foram apagadas'} e {c.acrescentadas}
      {' '}{c.acrescentadas === 1 ? 'foi acrescentada' : 'foram acrescentadas'} por quem conferiu.
    </>
  );
}

/** Tempos do video que levam a ele (ate' 10; o resto, contado). */
function Tempos({ lista, aoIr, rotulo = (ms) => emRelogio(ms) }) {
  const MAX = 10;
  return (
    <span style={ev.tempos}>
      {lista.slice(0, MAX).map((item) => {
        const ms = typeof item === 'number' ? item : item.deMs;
        return (
          <button key={ms} type="button" style={ev.itemTempo} onClick={() => aoIr(ms)} title="Levar o vídeo a este ponto">
            {rotulo(item)}
          </button>
        );
      })}
      {lista.length > MAX && <span style={ev.dica}>e mais {lista.length - MAX}</span>}
    </span>
  );
}

/**
 * MARCACAO AUTOMATICA (v2.105.0): o retangulo, a leitura do video e o que
 * ela achou. Marca so' os volumes; quem confere acerta, apaga, acrescenta e
 * marca as paradas com as teclas de sempre.
 */
function MarcacaoAutomatica({
  url, refVideoLeitura, maquina, retangulo, desenhando, automatica, progresso, listaVazia, conferencia,
  agoraMs, podeDesenhar, teste, inicioLeituraMs, aoDesenhar, aoCancelarDesenho, aoTestar, aoLer, aoParar, aoApagar,
  aoIr, lacunasVideo, alvo, aoDesenharB, aoTirarB, aoDistancia,
}) {
  // A CAIXA da conta do entre-pecas: a do cadastro do produto; o analista
  // troca aqui quando a camera e' a do fim da linha (a caixa passa fechada).
  // Nao e' guardada: e' do produto, e o cartao some ao voltar ao preparo.
  const [caixaTexto, setCaixaTexto] = useState(null);
  const caixaMm = caixaTexto != null ? mmDigitado(caixaTexto) : (alvo?.medida > 0 ? alvo.medida : null);
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const { estado, resultado } = automatica;
  const testando = estado === 'lendo' && automatica.modo === 'teste';
  // O andamento do teste e' o do TRECHO dele; o da leitura, o do video todo.
  const pct = (() => {
    if (!progresso) return null;
    if (testando) {
      const total = automatica.fimMs - automatica.inicioMs;
      return total > 0 ? Math.min(100, Math.max(0, Math.round(((progresso.ms - automatica.inicioMs) / total) * 100))) : null;
    }
    return progresso.duracaoMs ? Math.min(100, Math.round((progresso.ms / progresso.duracaoMs) * 100)) : null;
  })();
  // O teste que passou muda o botao principal: testou e pegou, o proximo
  // passo e' marcar o video todo.
  const testeBom = teste.estado === 'pronto' && teste.resultado.veredito === 'ok';
  const segundosTeste = Math.round(TESTE_MS / VELOCIDADE / 1000);
  const botaoDesenhar = (rotulo) => (
    <button type="button" style={ev.link} onClick={aoDesenhar} disabled={!podeDesenhar}>{rotulo}</button>
  );
  return (
    <section style={ev.cartao} aria-label="Marcação automática">
      <h2 style={ev.subtitulo}>Marcação automática</h2>

      {desenhando === 'B' && (
        <>
          <p style={ev.aviso} role="status">
            Linha B: clique e arraste uma faixa fina no mesmo corredor da caixa, um pouco adiante da A (até uns 30 a 40
            cm dela), sobre um ponto fixo da lateral da esteira — a distância real de A até B você mede com trena e
            digita aqui. Deixe o vídeo parado com uma caixa passando: ela tem de ficar quase toda rosa. Esc cancela.
          </p>
          <div style={ev.linhaBotoes}>
            <button type="button" style={est.botaoSecundario} onClick={aoCancelarDesenho}>Cancelar o desenho</button>
          </div>
        </>
      )}
      {desenhando === 'A' && (
        <>
          <p style={ev.aviso} role="status">
            Clique e arraste sobre o vídeo fazendo uma faixa fina sobre a passagem do rolete para o tapete verde,
            atravessando todo o caminho da caixa. A marca é quando o fim da caixa sai dela.
            Deixe o vídeo parado num ponto com caixa passando: enquanto você arrasta, o que o leitor conta como papelão
            fica pintado de rosa, com o % ao lado. A caixa tem de ficar quase toda rosa. Esc cancela.
          </p>
          <div style={ev.linhaBotoes}>
            <button type="button" style={est.botaoSecundario} onClick={aoCancelarDesenho}>Cancelar o desenho</button>
          </div>
        </>
      )}

      {!desenhando && estado === 'lendo' && (
        <>
          <p style={ev.dica} role="status">
            {progresso?.pausado && 'Leitura pausada: esta aba ficou escondida. Volte a ela para continuar.'}
            {!progresso?.pausado && testando
              && `Testando o retângulo de ${emRelogio(automatica.inicioMs)} a ${emRelogio(automatica.fimMs)}${pct != null ? `: ${pct}%` : '…'}${progresso ? ` · ${String(progresso.velocidade).replace('.', ',')}×` : ''}.`}
            {!progresso?.pausado && !testando
              && `Lendo o vídeo${pct != null ? `: ${pct}%` : ''}${progresso ? ` — ${emRelogio(progresso.ms)}${progresso.duracaoMs ? ` de ${emRelogio(progresso.duracaoMs)}` : ''} · ${String(progresso.velocidade).replace('.', ',')}× ` : '…'}`}
            {' '}Deixe esta aba aberta.
          </p>
          {pct != null && (
            <div style={ev.barraProgresso} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div style={{ ...ev.barraProgressoCheia, width: `${pct}%` }} />
            </div>
          )}
          {/* A copia que e' lida: na tela porque o navegador so' entrega
              quadros de video que esta' na pagina. */}
          <video ref={refVideoLeitura} src={url} style={ev.videoLeitura} muted playsInline preload="auto" tabIndex={-1} />
          <div style={ev.linhaBotoes}>
            <button type="button" style={est.botaoSecundario} onClick={aoParar}>
              {testando ? 'Parar o teste' : 'Parar a leitura'}
            </button>
          </div>
        </>
      )}

      {!desenhando && estado !== 'lendo' && !retangulo && (
        <>
          <p style={ev.dica}>
            O app marca os volumes sozinho e você só confere. Desenhe uma faixa fina sobre a passagem do rolete para o
            tapete verde da envolvedora: cada caixa vira uma marca quando o fim dela sai do rolete e entra no tapete — o
            mesmo instante do Enter e do tablet.
          </p>
          <div style={ev.linhaBotoes}>
            <button type="button" style={est.botaoSecundario} onClick={aoDesenhar} disabled={!podeDesenhar}>
              Desenhar o retângulo
            </button>
            {!podeDesenhar && <span style={ev.dica}>Abrindo a imagem do vídeo…</span>}
          </div>
        </>
      )}

      {!desenhando && estado === 'erro' && <div style={est.faixaErro} role="alert">{automatica.erro}</div>}

      {!desenhando && estado !== 'lendo' && retangulo && listaVazia && (
        <>
          {/* Guardado antes da v2.109.0: desenhado para a ENTRADA embaixo do
              filme. Lido pela saida, marcaria outro instante, calado. */}
          {retangulo.evento !== 'saida' && (
            <p style={ev.aviso} role="status">
              Este retângulo foi desenhado antes da versão 2.109.0, para a entrada da caixa embaixo do filme. A marca
              agora é quando o fim da caixa sai do rolete e entra no tapete, como no Enter: redesenhe uma faixa fina
              sobre essa passagem.
            </p>
          )}
          {retangulo.evento === 'saida' ? (
            <>
              <p style={ev.dica}>
                Retângulo da {maquina?.nome || 'máquina'}, guardado neste PC. Sobre o vídeo, o que o leitor conta como
                papelão fica rosa, com o % ao lado: caixa passando, quase toda rosa; sem caixa, perto de 0%.
              </p>
              <p style={ev.dica}>
                <strong>Teste antes</strong>: lê {Math.round(TESTE_MS / 60000)} min a partir de {emRelogio(agoraMs)} (uns
                {' '}{segundosTeste} s) e diz se pegou as caixas — deixe o vídeo num trecho com a linha rodando. O vídeo
                todo vai de {emRelogio(inicioLeituraMs)} até o fim e leva alguns minutos.
              </p>
              {teste.estado === 'erro' && <div style={est.faixaErro} role="alert">{teste.erro}</div>}
              {teste.estado === 'pronto' && <ResultadoTeste r={teste.resultado} aoIr={aoIr} />}
              {teste.estado === 'pronto' && teste.resultado.linhaB && (
                <EsteiraAB linhaB={teste.resultado.linhaB} retangulo={retangulo} caixaMm={caixaMm} alvo={alvo} />
              )}
              <LinhaB
                retangulo={retangulo} alvo={alvo} podeDesenhar={podeDesenhar} caixaTexto={caixaTexto}
                aoCaixa={setCaixaTexto} aoDesenhar={aoDesenharB} aoTirar={aoTirarB} aoDistancia={aoDistancia}
              />
              <div style={ev.linhaBotoes}>
                <button type="button" style={testeBom ? est.botaoSecundario : est.botaoImprimir} onClick={aoTestar}>
                  {teste.estado === 'parado' ? 'Testar o retângulo' : 'Testar de novo'} ({Math.round(TESTE_MS / 60000)} min)
                </button>
                <button type="button" style={testeBom ? est.botaoImprimir : est.botaoSecundario} onClick={aoLer}>
                  {estado === 'erro' ? 'Ler o vídeo de novo' : 'Marcar volumes automaticamente'}
                </button>
                {botaoDesenhar('Redesenhar o retângulo')}
              </div>
            </>
          ) : (
            /* Sem o botao de ler: com o retangulo antigo a leitura marcaria
               outro instante (revisao da v2.109.0). Redesenhar e' o caminho. */
            <div style={ev.linhaBotoes}>
              <button type="button" style={est.botaoImprimir} onClick={aoDesenhar} disabled={!podeDesenhar}>
                Redesenhar o retângulo
              </button>
            </div>
          )}
        </>
      )}

      {!desenhando && estado !== 'lendo' && retangulo && !listaVazia && !conferencia && (
        <p style={ev.dica}>
          A marcação automática começa com a lista vazia. Para usá-la, desfaça as marcas (⌫) ou recomece o vídeo.
          {' '}{botaoDesenhar('Redesenhar o retângulo')}
        </p>
      )}

      {!desenhando && estado !== 'lendo' && conferencia && (
        <>
          {estado === 'pronto' && resultado && (
            <p style={ev.ok} role="status">
              A leitura marcou {volumes(resultado.volumes)}, mais a largada. Confira na lista: clique num tempo
              para ver o vídeo nele; × apaga uma marca, Enter acrescenta.
            </p>
          )}
          {estado === 'pronto' && resultado?.linhaB && (
            <EsteiraAB linhaB={resultado.linhaB} retangulo={retangulo} caixaMm={caixaMm} alvo={alvo} />
          )}
          {estado === 'pronto' && resultado && (
            <p style={ev.dica}>
              Mão ou braço parado no retângulo também tem cor de papelão: se uma marca não mostra o fim de uma caixa
              saindo do rolete, apague-a.
            </p>
          )}
          {/* Leitura de antes da v2.109.0 (rascunho guardado): marcada na ENTRADA. */}
          {resultado && resultado.evento !== 'saida' && (
            <p style={ev.aviso}>
              Esta marcação automática foi feita na entrada da caixa embaixo do filme (antes da versão 2.109.0), não no
              instante do Enter. Para marcar igual ao Enter, apague as marcas, redesenhe o retângulo e leia de novo.
            </p>
          )}
          {resultado?.cortadoNoFim != null && (
            <p style={ev.aviso}>
              Confira a última: algo entrou no retângulo perto do fim e o vídeo acabou antes de dar para ver se era
              caixa. Ela foi marcada:{' '}
              <Tempos lista={[resultado.cortadoNoFim]} aoIr={aoIr} />
            </p>
          )}
          {resultado?.comCaixaNoInicio && resultado.evento !== 'saida' && (
            <p style={ev.dica}>
              A caixa que já estava embaixo do filme no começo da leitura não foi marcada: a entrada dela não foi filmada.
            </p>
          )}
          {resultado?.jaEstava != null && (
            <p style={ev.dica}>
              Algo já estava no retângulo quando a leitura começou e não foi marcado (pode ter sido uma mão): saiu em{' '}
              <Tempos lista={[resultado.jaEstava]} aoIr={aoIr} />. A largada é a primeira caixa que passou inteira — o
              tempo por volume não muda.
            </p>
          )}
          {resultado?.semSaida != null && (
            <p style={ev.dica}>
              A caixa que entrou no retângulo em <Tempos lista={[resultado.semSaida]} aoIr={aoIr} /> não foi marcada:
              o vídeo acabou antes de ela sair.
            </p>
          )}
          {resultado?.suspeitos.length > 0 && (
            <p style={ev.aviso}>
              Confira: {resultado.suspeitos.length === 1 ? 'esta caixa ficou' : 'estas caixas ficaram'} bem mais
              tempo no retângulo que as outras — podem ser duas caixas encostadas:{' '}
              <Tempos lista={resultado.suspeitos} aoIr={aoIr} />
            </p>
          )}
          {resultado?.longos.length > 0 && !lacunasVideo?.suficiente && (
            <p style={ev.aviso}>
              Intervalos longos, onde a linha pode ter parado. Se parou, marque a parada com P:{' '}
              <Tempos lista={resultado.longos} aoIr={aoIr} rotulo={(x) => `${emRelogio(x.deMs)}–${emRelogio(x.ateMs)}`} />
            </p>
          )}
          {resultado?.descartados.length > 0 && (
            <p style={ev.dica}>
              Passagens curtas ignoradas
              {/* O limite sai das passagens deste video; no piso (poucas
                  passagens, ou todas rapidas) ele e' so' o minimo. */}
              {resultado.limiteCurtaMs > PISO_PERMANENCIA_MS
                ? ` (menos de ${formatarSegundos(resultado.limiteCurtaMs)} s no retângulo — o limite sai das passagens deste vídeo)`
                : resultado.limiteCurtaMs ? ` (menos de ${formatarSegundos(resultado.limiteCurtaMs)} s no retângulo, o mínimo)` : ''}
              : pessoa ou reflexo. Se alguma era caixa, marque com Enter no ponto:{' '}
              <Tempos lista={resultado.descartados} aoIr={aoIr} />
            </p>
          )}
          <p style={ev.dica}><TextoConferencia c={conferencia} /></p>
          <div style={ev.linhaBotoes}>
            {!confirmarApagar && (
              <button type="button" style={ev.link} onClick={() => setConfirmarApagar(true)}>
                Apagar as marcas e ler de novo
              </button>
            )}
            {confirmarApagar && (
              <>
                <span style={ev.dica}>Apagar todas as marcas da lista, inclusive as que você acrescentou?</span>
                <button
                  type="button" style={est.botaoSecundario}
                  onClick={() => { setConfirmarApagar(false); aoApagar(); }}
                >
                  Apagar as marcas
                </button>
                <button type="button" style={ev.link} onClick={() => setConfirmarApagar(false)}>Manter</button>
              </>
            )}
          </div>
        </>
      )}
      {!desenhando && estado !== 'lendo' && lacunasVideo?.suficiente && lacunasVideo.lacunas.length > 0 && (
        <LacunasDaMarcacao r={lacunasVideo} aoIr={aoIr} />
      )}
    </section>
  );
}

/**
 * AS LACUNAS DA MARCACAO (v2.112.2): os intervalos maiores que o dobro do
 * passo da linha — a regra do indicador —, clicaveis. So' lista: quem olha o
 * video decide se faltou caixa (Enter) ou se a linha parou (P, com o motivo).
 * Marcar sozinho abria a trava da UEP (ver lacunasDoVideo).
 */
function LacunasDaMarcacao({ r, aoIr }) {
  const n = r.lacunas.length;
  const excesso = r.lacunas.reduce((soma, l) => soma + l.excessoMs, 0);
  return (
    <p style={ev.aviso}>
      {n === 1 ? 'Uma lacuna' : `${n} lacunas`} — intervalo maior que o dobro do passo da linha
      ({formatarSegundos(r.normalMs)} s por volume); {n === 1 ? 'soma' : 'somam'} {duracaoCurta(excesso)} além do passo.
      Confira cada {n === 1 ? 'uma' : 'trecho'} no vídeo: se faltou uma caixa, Enter no ponto; se a linha parou, P com o
      motivo. Lacuna que fica conta como parada que ninguém marcou.{' '}
      <Tempos
        lista={r.lacunas.map((l) => ({ deMs: l.deMs, ateMs: l.ateMs }))} aoIr={aoIr}
        rotulo={(x) => `${emRelogio(x.deMs)}–${emRelogio(x.ateMs)}`}
      />
    </p>
  );
}

/** Numero digitado em mm: inteiro positivo, ou null. */
const mmDigitado = (texto) => {
  const n = Math.round(Number(String(texto ?? '').replace(',', '.')));
  return n > 0 && n <= 20000 ? n : null;
};
/** O retangulo sem a distancia de A ate' B (ela e' entre as duas linhas). */
function linhaSemDistancia(r) {
  const { distanciaMm: _d, ...resto } = r || {};
  return resto;
}
const soLinha = (r) => (r ? {
  x: r.x, y: r.y, largura: r.largura, altura: r.altura,
} : null);
const mesmaLinha = (a, b) => (!a && !b) || Boolean(a && b && ['x', 'y', 'largura', 'altura']
  .every((k) => Math.abs(a[k] - b[k]) < 1e-9));
/**
 * As LINHAS E A DISTANCIA DE UMA LEITURA vao com o atraso (revisao da
 * v2.113.0): o atraso so' vale para as linhas que o mediram. Sem isto, no
 * F5 ou em outra maquina, ele era dividido pela distancia de outras linhas.
 */
function congelarLinhaB(l, lido) {
  if (!l) return null;
  return { ...l, linhas: { a: soLinha(lido), b: soLinha(lido?.b) }, distanciaMm: lido?.distanciaMm ?? null };
}

/**
 * A LINHA B (v2.113.0): desenhar, tirar, a distancia REAL de A ate' B
 * (trena, de centro a centro de duas fitas na lateral fixa da esteira — fica
 * com a maquina) e a caixa no sentido em que anda (do cadastro do PRODUTO,
 * trocada so' nesta tela: no fim da linha ela passa fechada).
 */
function LinhaB({
  retangulo, alvo, podeDesenhar, caixaTexto, aoCaixa, aoDesenhar, aoTirar, aoDistancia,
}) {
  const temB = retanguloValido(retangulo?.b);
  const caixaCadastro = alvo?.medida > 0 ? Math.round(alvo.medida) : null;
  const enterAplica = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } };
  return (
    <div style={ev.esteira} aria-label="Linha B: velocidade e entre-peças">
      <p style={ev.esteiraTitulo}>Velocidade e entre-peças (opcional): a linha B</p>
      {!temB && (
        <>
          <p style={ev.dica}>
            Uma segunda faixa, B, no mesmo corredor da caixa e adiante da A (no sentido em que a caixa anda): o tempo que a
            ponta da caixa leva de A até B, com a distância real entre as duas, dá a velocidade da esteira e o vão entre as
            caixas. Cole duas fitas na lateral fixa da esteira (não na lona), a até 1/3 de caixa + vão uma da outra (uns 30
            cm), meça de centro a centro e desenhe cada linha no centro de uma fita — a lupa ajuda.
          </p>
          <div style={ev.linhaBotoes}>
            <button type="button" style={est.botaoSecundario} onClick={aoDesenhar} disabled={!podeDesenhar}>
              Desenhar a linha B
            </button>
          </div>
        </>
      )}
      {temB && (
        <>
          <label style={ev.esteiraRegua}>
            <span style={ev.dica}>Distância real de A até B, de centro a centro das fitas:</span>
            <input
              type="number" min="1" step="1" inputMode="numeric" style={ev.esteiraCampo} placeholder="mm"
              defaultValue={retangulo.distanciaMm ?? ''} key={`d-${retangulo.distanciaMm ?? ''}`}
              onBlur={(e) => {
                const d = mmDigitado(e.target.value);
                if (d !== (retangulo.distanciaMm ?? null)) aoDistancia(d);
              }}
              onKeyDown={enterAplica}
              aria-label="Distância real de A até B, em mm"
            />
            <span style={ev.dica}>mm (trena)</span>
          </label>
          <label style={ev.esteiraRegua}>
            <span style={ev.dica}>A caixa, no sentido da esteira, tem:</span>
            <input
              type="number" min="1" step="1" inputMode="numeric" style={ev.esteiraCampo} placeholder="mm"
              value={caixaTexto ?? (caixaCadastro ?? '')}
              onChange={(e) => aoCaixa(e.target.value)} onKeyDown={enterAplica}
              aria-label="Comprimento da caixa no sentido da esteira, em mm"
            />
            <span style={ev.dica}>
              mm{caixaTexto == null && caixaCadastro ? ' (do cadastro do produto)' : ''} — no fim da linha, fechada, ela é
              menor.
            </span>
            {caixaTexto != null && caixaCadastro && (
              <button type="button" style={ev.link} onClick={() => aoCaixa(null)}>voltar ao cadastro ({caixaCadastro} mm)</button>
            )}
          </label>
          <div style={ev.linhaBotoes}>
            <button type="button" style={ev.link} onClick={aoDesenhar} disabled={!podeDesenhar}>Redesenhar a linha B</button>
            <button type="button" style={ev.link} onClick={aoTirar}>Tirar a linha B</button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A ESTEIRA PELAS LINHAS A E B (v2.113.0): velocidade, caixa + vao e
 * entre-pecas, ao lado do cadastro. Sem veredito. A distancia e' a das
 * linhas que mediram (congelarLinhaB); a de agora so' quando as linhas sao
 * as mesmas (corrigir um numero digitado errado nao pede ler de novo).
 */
function EsteiraAB({
  linhaB, retangulo, caixaMm, alvo,
}) {
  const n0 = (v) => String(Math.round(v));
  const n1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const n2 = (v) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',');
  const mesmas = mesmaLinha(linhaB.linhas?.a, soLinha(retangulo)) && mesmaLinha(linhaB.linhas?.b, soLinha(retangulo?.b));
  const distanciaMm = mesmas ? (retangulo?.distanciaMm ?? null) : linhaB.distanciaMm;
  const tempo = n1(Math.abs(linhaB.atrasoMs ?? 0) / 1000);
  let problema = null;
  if (linhaB.motivo) problema = `Não deu para medir a velocidade: ${linhaB.motivo}.`;
  else if (linhaB.fraca) {
    problema = `As linhas A e B não viram a mesma coisa passar (correlação ${n2(linhaB.correlacao)}, o mínimo é `
      + `${n2(CORRELACAO_MINIMA)}): ponha as duas no mesmo corredor da caixa, longe de mão, filme ou barra.`;
  } else if (linhaB.invertido) {
    problema = 'A caixa apareceu na B antes da A. Ou as linhas estão trocadas — a B vai ADIANTE da A, no sentido em que a '
      + 'caixa anda —, ou estão longe demais e a B viu a caixa anterior. Confira o sentido e deixe a B a até 1/3 de caixa + '
      + 'vão da A.';
  } else if (linhaB.noLimite) {
    problema = 'A e B estão longe demais: o tempo entre elas chega perto da metade do intervalo entre as caixas, e a caixa '
      + 'se confunde com a seguinte. Deixe a B a até 1/3 de caixa + vão da A e teste de novo.';
  } else if (linhaB.pertoDemais) {
    problema = `A e B estão perto demais: a ponta da caixa leva só ${tempo} s de uma à outra, e a leitura não tem precisão `
      + 'para isso. Afaste a B (uns 30 cm) e teste de novo.';
  }
  const r = problema || !linhaBValida(linhaB) ? null : esteiraPelasLinhas({ ...linhaB, distanciaMm, comprimentoMm: caixaMm });
  const longeDoCadastro = r && alvo?.vel > 0 && Math.abs(r.velocidadeMMin / alvo.vel - 1) > 0.5;
  return (
    <div style={ev.esteira} aria-label="Esteira medida pelas linhas A e B">
      <p style={ev.esteiraTitulo}>A esteira, pelas linhas A e B</p>
      {problema && <p style={ev.aviso} role="alert">{problema}</p>}
      {!problema && !r && (
        <p style={ev.dica}>
          A ponta da caixa leva {tempo} s de A até B. Digite a distância real entre as duas para ver a velocidade e o
          entre-peças.
        </p>
      )}
      {r && (
        <>
          <div style={ev.numeros}>
            <Numero
              rotulo="Velocidade" valor={`${n1(r.velocidadeMMin)} m/min`}
              sub={alvo?.vel > 0 ? `cadastro: ${n1(alvo.vel)} m/min` : 'medida no vídeo'}
            />
            <Numero
              rotulo="Entre-peças" valor={r.entrePecasMm != null ? `≈ ${n0(r.entrePecasMm)} mm` : '—'}
              sub={[
                r.entreDeMm != null ? `de ${n0(r.entreDeMm)} a ${n0(r.entreAteMm)} mm` : null,
                caixaMm > 0 ? null : 'falta a medida da caixa',
                alvo?.entre != null ? `cadastro: ${n0(alvo.entre)} mm` : null,
              ].filter(Boolean).join(' · ') || null}
            />
            <Numero
              rotulo="Caixa + vão" valor={r.passoMm != null ? `${n0(r.passoMm)} mm` : '—'}
              sub={linhaB.intervaloTipicoMs > 0 ? `uma caixa a cada ${n1(linhaB.intervaloTipicoMs / 1000)} s` : null}
            />
          </div>
          {longeDoCadastro && (
            <p style={ev.aviso} role="status">
              A velocidade medida está muito longe do cadastro ({n1(alvo.vel)} m/min): confira a distância digitada e se a B
              não ficou a mais de uma caixa + vão da A — aí a B veria a caixa seguinte e o tempo sairia curto.
            </p>
          )}
          <p style={ev.dica}>
            A ponta da caixa leva {tempo} s de A até B ({n0(distanciaMm)} mm{mesmas ? '' : ', a distância da leitura — as linhas mudaram depois'}):
            velocidade = distância ÷ tempo. Caixa + vão = a velocidade × o intervalo entre as caixas (o do vídeo, com as
            pausas de cada ciclo, se houver); entre-peças = isso − a caixa ({caixaMm > 0 ? `${n0(caixaMm)} mm` : 'sem medida'}).
            O tempo de A até B sai do vídeo inteiro (correlação {n2(linhaB.correlacao)}, de 0 a 1), não de caixa a caixa.
          </p>
          <p style={ev.dica}>
            O entre-peças é o vão que a linha PRATICA neste vídeo, não um padrão — e é a diferença de dois números próximos
            (caixa + vão − caixa): por isso o "≈" e a faixa. Levá-lo ao cadastro faz o tempo-alvo virar o ritmo deste vídeo ÷ a
            eficiência; o padrão é decisão do PPCP. Estes números não vão com a medição salva: anote o que precisar.
          </p>
        </>
      )}
    </div>
  );
}

/** % de papelao para a tela: 0,064 -> "6%". */
const pctPapelao = (v) => `${Math.round(v * 100)}%`;
const caixas = (n) => `${n} ${n === 1 ? 'caixa' : 'caixas'}`;

/**
 * O RESULTADO DO TESTE (v2.112.0): o veredito em palavras, o que fazer, as
 * caixas achadas (clicaveis, para conferir no video) e o sinal do trecho.
 * As contas sao de avaliarTeste (dominio).
 */
function ResultadoTeste({ r, aoIr }) {
  const trecho = `de ${emRelogio(r.inicioMs)} a ${emRelogio(r.fimMs ?? r.inicioMs)}`;
  const niveis = r.base != null ? ` Esteira vazia: ~${pctPapelao(r.base)} de papelão; com caixa: ~${pctPapelao(r.topo)}.` : '';
  let estilo = est.faixaErro;
  let papel = 'alert';
  let texto;
  let depois = null; // o que fazer, em texto normal, embaixo do veredito
  switch (r.veredito) {
    case 'ok':
      estilo = ev.ok; papel = 'status';
      texto = `O retângulo pegou ${caixas(r.caixas)} ${trecho}.`;
      depois = `${niveis.trim()} Confira duas ou três (clique no tempo): cada uma tem de ser o fim de uma caixa saindo do `
        + `rolete. Se estiver certo, marque o vídeo todo — a leitura começa em ${emRelogio(r.inicioMs)} (ou antes, se `
        + 'você voltar o vídeo) e acha os níveis de novo com o vídeo inteiro.';
      break;
    case 'uma':
      estilo = ev.aviso; papel = 'status';
      texto = `Só 1 caixa passou inteira pelo retângulo ${trecho}: pouco para dizer se ele pega (e a leitura não mede `
        + 'com uma caixa só).';
      depois = 'Se passaram mais caixas nesse trecho, o retângulo está fora do caminho delas: redesenhe. Se a linha '
        + 'andou devagar ou parou, teste num trecho com a linha rodando.';
      break;
    case 'nenhuma':
      texto = `Nenhuma caixa passou inteira pela faixa ${trecho}. Se passaram caixas, a faixa não atravessa todo o caminho `
        + 'da caixa: redesenhe. Se a linha estava parada, leve o vídeo a um trecho com a linha rodando e teste de novo.';
      break;
    case 'nada':
      texto = `Em nenhum momento ${trecho} o retângulo teve cor de papelão (no máximo ${pctPapelao(r.maximo)}). Ou nenhuma `
        + 'caixa passou nesse trecho, ou o retângulo está fora do caminho da caixa. Pare o vídeo com uma caixa dentro do '
        + 'retângulo: se ela não fica rosa, redesenhe a faixa na passagem do rolete para o tapete, onde a caixa passa.';
      break;
    case 'sempre':
      texto = `O retângulo teve cor de papelão o tempo todo ${trecho} (nunca abaixo de ${pctPapelao(r.minimo)}). Ou tem `
        + 'algo pardo ou amarelo parado dentro dele (barra, rolete, chão) — pare o vídeo sem caixa, veja o que fica rosa '
        + 'e redesenhe sem pegar isso —, ou uma caixa ficou parada nele com a linha parada: teste num trecho com a linha '
        + 'rodando.';
      break;
    case 'sem-contraste':
      texto = `O retângulo mudou pouco ${trecho} (de ${pctPapelao(r.minimo)} a ${pctPapelao(r.maximo)} de papelão). Ou a `
        + 'caixa cobre só uma parte dele — redesenhe uma faixa fina, só onde a caixa passa (com ela passando, a faixa '
        + 'fica quase toda rosa) —, ou nenhuma caixa passou e o que mexeu foi mão ou reflexo: teste num trecho com a '
        + 'linha rodando.';
      break;
    default:
      texto = 'O trecho é curto demais para testar: volte o vídeo para antes e teste de novo.';
  }
  return (
    <div style={ev.resultadoTeste}>
      <p style={estilo} role={papel}>{texto}</p>
      {depois && <p style={ev.dica}>{depois}</p>}
      {r.grafico.length > 1 && <GraficoTeste r={r} aoIr={aoIr} />}
      {r.marcasMs.length > 0 && (
        <p style={ev.dica}>
          Caixas que o teste marcaria (o fim saindo do rolete): <Tempos lista={r.marcasMs} aoIr={aoIr} />
        </p>
      )}
      {r.descartados.length > 0 && (
        <p style={ev.dica}>
          Passagens curtas que ele ignoraria (mão, reflexo): <Tempos lista={r.descartados} aoIr={aoIr} />
        </p>
      )}
    </div>
  );
}

/**
 * O SINAL DO TESTE: o % de papelao no retangulo ao longo do trecho (0 a
 * 100%, escala fixa — "nunca passou de 9%" tem de se ver), a linha a partir
 * da qual conta caixa e um traco em cada caixa achada. Cada caixa e' um
 * morro; esteira vazia, o chao. Clicar num traco leva o video ao ponto.
 */
function GraficoTeste({ r, aoIr }) {
  const L = 300;
  const A = 60; // o sinal; embaixo dele, a faixa dos tracos das caixas
  const FAIXA = 12;
  const ini = r.inicioMs;
  const fim = Math.max(r.fimMs ?? 0, r.grafico[r.grafico.length - 1].ms, ini + 1);
  const x = (ms) => ((ms - ini) / (fim - ini)) * L;
  const y = (v) => A - Math.min(1, Math.max(0, v)) * A;
  const linha = r.grafico.map((p) => `${x(p.ms).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const descricao = `Papelão no retângulo de ${emRelogio(ini)} a ${emRelogio(fim)}: de ${pctPapelao(r.minimo)} a `
    + `${pctPapelao(r.maximo)}; ${caixas(r.caixas)} ${r.caixas === 1 ? 'achada' : 'achadas'}.`;
  return (
    <figure style={ev.graficoTeste}>
      <figcaption style={ev.graficoTitulo}>% do retângulo com cor de papelão no trecho testado</figcaption>
      <div style={ev.graficoArea}>
        <div style={ev.graficoEixoY} aria-hidden="true"><span>100%</span><span>0%</span></div>
        <svg
          viewBox={`0 0 ${L} ${A + FAIXA}`} preserveAspectRatio="none" style={ev.graficoSvg} role="img"
          aria-label={descricao}
        >
          <line x1="0" x2={L} y1={A} y2={A} style={ev.graficoBase} vectorEffect="non-scaling-stroke" />
          {r.entra != null && (
            <line x1="0" x2={L} y1={y(r.entra)} y2={y(r.entra)} style={ev.graficoCorte} vectorEffect="non-scaling-stroke">
              <title>{`Acima de ${pctPapelao(r.entra)}: caixa no retângulo`}</title>
            </line>
          )}
          <polyline points={linha} style={ev.graficoLinha} vectorEffect="non-scaling-stroke" />
          {r.marcasMs.map((ms) => (
            <g key={ms} style={ev.graficoAlvo} onClick={() => aoIr(ms)}>
              <title>{`Caixa saiu em ${emRelogio(ms)} — clique para ver`}</title>
              <rect x={x(ms) - 3} y="0" width="6" height={A + FAIXA} fill="transparent" />
              <line
                x1={x(ms)} x2={x(ms)} y1={A + 3} y2={A + FAIXA} style={ev.graficoMarca} vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>
      </div>
      <div style={ev.graficoEixoX} aria-hidden="true">
        <span>{emRelogio(ini)}</span>
        <span>{emRelogio(fim)}</span>
      </div>
      <p style={ev.dica}>
        Cada morro é uma caixa passando{r.entra != null ? '; acima do tracejado, conta caixa' : ''}
        {r.marcasMs.length ? '; o traço embaixo é a caixa achada (clique para ver)' : ''}.
      </p>
    </figure>
  );
}

/**
 * Uma MARCACAO GUARDADA na lista do preparo (v2.112.1): o video, a maquina,
 * o produto, o que tem marcado e quando — e o Descartar, que pergunta antes
 * (uma hora de video marcada nao some num clique errado).
 */
function MarcacaoGuardada({ r, quando, aoDescartar }) {
  const [confirmar, setConfirmar] = useState(false);
  const marcas = marcasEmPalavras(r.marcacao);
  // A que chegou e foi mexida no PC JA' ESTA' no sistema; a que tentou
  // salvar sem resposta PODE estar. A linha diz isso antes do Descartar:
  // "nenhuma marca" sozinho parecia lixo para jogar fora.
  const noSistema = r.mexida ? 'já está no sistema' : (r.envioTentado || r.incerto) ? 'pode já estar no sistema' : null;
  return (
    <li style={ev.itemGuardada}>
      <div style={ev.itemGuardadaTexto}>
        <span style={ev.itemGuardadaNome}>{r.nome}</span>
        <span style={ev.dica}>
          {[r.maquinaNome, r.campos?.produto || 'sem produto', marcas || 'nenhuma marca',
            r.atualizadoEm ? `guardada em ${quando(r.atualizadoEm)}` : null, noSistema].filter(Boolean).join(' · ')}
        </span>
        {confirmar && (
          <span style={ev.dica} role="status">
            Descartar as marcas deste vídeo{marcas ? ` (${marcas})` : ''}? Não dá para desfazer.
            {noSistema && ` Uma versão dela ${noSistema}: o aviso fica no vídeo, para não salvar o mesmo trecho duas vezes.`}
          </span>
        )}
      </div>
      <div style={ev.linhaBotoes}>
        {!confirmar && (
          <button
            type="button" style={ev.link} onClick={() => setConfirmar(true)} aria-label={`Descartar a marcação de ${r.nome}`}
          >
            Descartar
          </button>
        )}
        {confirmar && (
          <>
            <button type="button" style={est.botaoSecundario} onClick={aoDescartar}>Descartar as marcas</button>
            <button type="button" style={ev.link} onClick={() => setConfirmar(false)}>Manter</button>
          </>
        )}
      </div>
    </li>
  );
}

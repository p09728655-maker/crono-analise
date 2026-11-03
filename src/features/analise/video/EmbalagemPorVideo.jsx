import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { VERSAO } from '../../../versao.js';
import {
  conferenciaRapida, formatarDuracao, formatarSegundos, leituraPecaAPeca, periodoPorPeca, unidadeDoPosto,
} from '../../../domain/cronoanalise.js';
import { diasProgramados, taktDaMedicao } from '../../../domain/demandaSemanal.js';
import {
  desfazerUltimo, emRelogio, encerrarParadaNoVideo, iniciarParadaNoVideo, inicioSugerido, marcacaoVazia,
  marcarToque, medicaoDoVideo, removerParada, removerVolume,
} from '../../../domain/medicaoPorVideo.js';
import {
  ErroApi, enviarMedicaoPorVideo, lerDemanda, listarCadastroMaquinas,
} from '../../../lib/api.js';
import { produtosDoGrupo } from '../../../lib/maquinas.js';
import { carregarMotivos, useMotivosDoGrupo } from '../../../lib/motivosParada.js';
import { rotuloMotivo } from '../../../domain/crono/paradas.js';
import MenuLateral from '../../../components/MenuLateral.jsx';
import HistoricoVersoes from '../../../components/HistoricoVersoes.jsx';
import EstadoVazio from '../../../components/EstadoVazio.jsx';
import SeletorProduto from '../../../components/SeletorProduto.jsx';
import { motivoSemTakt } from '../../coleta/embalagem/motivoSemTakt.js';
import { GraficoIntervalos } from '../graficos/Intervalos.jsx';
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
const MAX_GUARDADOS = 10;
/** Duracao de parada: no video se marca no segundo, e "< 1 min" esconderia isso. */
const duracaoCurta = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)} s` : formatarDuracao(ms));
const volumes = (n) => `${n} ${n === 1 ? 'volume' : 'volumes'}`;
const chaveDoArquivo = (f) => (f ? `${f.name}|${f.size}|${f.lastModified}` : null);
/** A lista da Embalagem Takt Time mostra os ultimos 30 dias (DIAS em EmbalagemTaktTimePc). */
const DIAS_DA_LISTA = 30;
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
const lerRascunho = (arquivoChave) => lerMapa(CHAVE_RASCUNHOS)[arquivoChave] || null;
const rascunhosGuardados = () => Object.values(lerMapa(CHAVE_RASCUNHOS));
function gravarRascunho(r) {
  gravarMapa(CHAVE_RASCUNHOS, { ...lerMapa(CHAVE_RASCUNHOS), [r.arquivo]: r });
}
function apagarRascunho(arquivoChave) {
  const mapa = lerMapa(CHAVE_RASCUNHOS);
  delete mapa[arquivoChave];
  gravarMapa(CHAVE_RASCUNHOS, mapa);
}
const lerSalvo = (arquivoChave) => lerMapa(CHAVE_SALVOS)[arquivoChave] || null;
function anotarSalvo(arquivoChave, info) {
  gravarMapa(CHAVE_SALVOS, { ...lerMapa(CHAVE_SALVOS), [arquivoChave]: info });
}
/** Envio cujo resultado nao se sabe (rede, tempo esgotado, erro do servidor): pode ter gravado. */
const envioIncerto = (e) => !(e instanceof ErroApi) || e.status >= 500;

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
 * aparelho) e, depois, no PC, o analista assiste e marca: Enter a cada
 * volume que fecha, P para Parou/Voltou, F para Encerrar. A marca sai do
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
  // O ultimo envio de resultado incerto (JSON): se o servidor disser depois
  // que ja' tinha a medicao, so' este conteudo e' que pode estar la'.
  const [incerto, setIncerto] = useState(null);
  const [duplicada, setDuplicada] = useState(false);
  const [motivoPedido, setMotivoPedido] = useState(null); // ms do video em que se apertou P
  const [salvar, setSalvar] = useState({ estado: 'parado', erro: null });
  const refVideo = useRef(null);
  const [agoraMs, setAgoraMs] = useState(0);
  const [tocando, setTocando] = useState(false);
  const [velocidade, setVelocidade] = useState(1);

  /* ---------------------------------------------- cadastro e programa */
  useEffect(() => {
    let vivo = true;
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

  /* --------------------------------------------------------- arquivo */
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const escolherArquivo = (f) => {
    setAviso(null);
    setAvisoPreparar(null);
    setRetomando(false);
    if (!f) return;
    setArquivo(f);
    setMeta({ duracaoS: null, erro: null, pronto: false });
    setUrl(URL.createObjectURL(f));
    // O inicio era do arquivo anterior: o deste vem dos metadados dele. Sem
    // isto, trocar o arquivo errado pelo certo mantinha a data do errado — e
    // a medicao ia para a semana e o takt de outro dia (revisao de 30/10).
    setCampos((c) => ({ ...c, inicio: '' }));
    setRascunho(lerRascunho(chaveDoArquivo(f)));
    setJaSalvo(lerSalvo(chaveDoArquivo(f)));
  };

  const aoCarregarMetadados = () => {
    const v = refVideo.current;
    if (!v) return;
    const duracaoS = Number.isFinite(v.duration) ? v.duration : null;
    setMeta({ duracaoS, erro: null, pronto: true });
    // Sugestao: o arquivo e' gravado no fim da filmagem (ver inicioSugerido).
    // Sem duracao nao ha' como voltar do fim ao comeco: o campo fica vazio.
    setCampos((c) => (c.inicio || !arquivo ? c : { ...c, inicio: paraCampoLocal(inicioSugerido(arquivo.lastModified, duracaoS)) }));
  };
  // A duracao que chega depois (WebM sem duracao no cabecalho, as vezes).
  const aoMudarDuracao = () => {
    const v = refVideo.current;
    if (v && Number.isFinite(v.duration)) setMeta((m) => ({ ...m, duracaoS: v.duration }));
  };

  const continuarRascunho = () => {
    const r = rascunho;
    refMarcacao.current = r.marcacao;
    setMarcacao(r.marcacao);
    setObservacao(r.observacao || '');
    setClientId(r.clientId);
    setIncerto(r.incerto || null);
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
  const descartarRascunho = () => { apagarRascunho(rascunho.arquivo); setRascunho(null); };

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
    setIncerto(null);
    setFimMs(null);
    setAviso(null);
    setEtapa('marcar');
  };

  // O rascunho acompanha cada marca; salva a medicao, ele some.
  useEffect(() => {
    if (!arquivo || !clientId || (etapa !== 'marcar' && etapa !== 'revisar')) return;
    gravarRascunho({
      arquivo: chaveDoArquivo(arquivo), nome: arquivo.name, clientId, campos, marcacao, observacao, incerto,
      maquinaNome: maquina?.nome || null, atualizadoEm: new Date().toISOString(),
    });
  }, [arquivo, clientId, campos, marcacao, observacao, incerto, etapa]);

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
    if (m.largadaMs == null) { setAviso('Dê a largada antes: a parada fica dentro do período.'); return; }
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
    // Parada aberta: o Encerrar fecha ela ali, como no tablet.
    if (m.aberta) {
      const r1 = encerrarParadaNoVideo(m, fim);
      if (r1.aviso) { setAviso(`Ainda não dá para encerrar: ${r1.aviso}`); return; }
      m = r1.marcacao;
      refMarcacao.current = m;
      setMarcacao(m);
    }
    const r = medicaoDoVideo({
      largadaMs: m.largadaMs, toquesMs: m.toques.map((t) => t.ms), paradas: m.paradas,
      fimMs: fim, inicioFilmagem: campos.inicio,
    });
    if (r.motivo) { setAviso(`Ainda não dá para encerrar: ${r.motivo}.`); return; }
    refVideo.current?.pause();
    setFimMs(fim);
    setAviso(null);
    setEtapa('revisar');
  };

  // AS TECLAS — so' na etapa de marcar, e nunca com o cursor num campo.
  useEffect(() => {
    if (etapa !== 'marcar') return undefined;
    const aoTeclar = (e) => {
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
  // O MESMO criterio da lista, do volume a volume e do tablet: o do takt da
  // semana (horas de setup x fracao da semana), nao so' o cadastro do grupo.
  const setupPlanejado = Boolean(takt?.setupPlanejado);
  const numeros = (med) => {
    if (!med) return null;
    const porVolume = periodoPorPeca({
      relogioEntreMarcasMs: med.marcasRelogioMs, volumes: med.pecas,
      setupNoTrechoMs: med.marcasSetupMs, setupPlanejado,
    });
    const leitura = leituraPecaAPeca({ marcasMs: med.marcasMs, taktMs: takt?.taktMs, periodoPorPecaMs: porVolume });
    const calc = conferenciaRapida({ duracaoMs: med.duracaoMs, pecas: med.pecas, paradas: med.paradas });
    return { porVolume, leitura, calc };
  };
  const vivo = numeros(parcial);

  /* ---------------------------------------------------------- salvar */
  /**
   * SALVAR. O client_id torna o reenvio inofensivo — e por isso mesmo o
   * servidor IGNORA o segundo envio com o mesmo id (ON CONFLICT), ainda que
   * o conteudo tenha mudado. Se a resposta do primeiro se perdeu (rede,
   * tempo esgotado), o analista ve' "Nao salvou", corrige, salva — e o banco
   * fica com a versao de antes. A resposta diz quantas eram NOVAS: zero
   * quer dizer que ja' estava la'. Igual ao envio incerto, e' a mesma; diferente,
   * a tela diz que as mudancas nao entraram (revisao de 30/10).
   */
  const salvarMedicao = async ({ comoNova = false } = {}) => {
    const med = final?.medicao;
    if (!med) { setSalvar({ estado: 'parado', erro: 'A medição não está completa: volte a marcar e encerre de novo.' }); return; }
    if (!maquina) { setSalvar({ estado: 'parado', erro: 'Falta a máquina da embalagem: volte a marcar e escolha a máquina.' }); return; }
    const id = comoNova ? crypto.randomUUID() : clientId;
    const dados = {
      clientId: id, maquina: maquina.nome, peca: campos.produto.trim() || null,
      duracaoMs: med.duracaoMs, pecas: med.pecas, ciclosPorPeca: 1, furacaoPassante: false,
      observacao: observacao.trim() || null, paradas: med.paradas,
      marcasMs: med.marcasMs, marcasRelogioMs: med.marcasRelogioMs, marcasSetupMs: med.marcasSetupMs,
      salvoEm: med.salvoEm,
    };
    const conteudo = JSON.stringify({ ...dados, clientId: null });
    setSalvar({ estado: 'enviando', erro: null });
    try {
      const r = await enviarMedicaoPorVideo(dados);
      const jaEstava = Number(r.novos) === 0;
      if (comoNova) setClientId(id);
      apagarRascunho(chaveDoArquivo(arquivo));
      anotarSalvo(chaveDoArquivo(arquivo), { em: new Date().toISOString(), volumes: med.pecas });
      setDuplicada(jaEstava && incerto !== conteudo);
      setIncerto(null);
      setSalvar({ estado: 'parado', erro: null });
      setEtapa('salvo');
    } catch (e) {
      if (envioIncerto(e)) setIncerto(conteudo);
      setSalvar({
        estado: 'parado',
        erro: envioIncerto(e)
          ? `${e.message} A medição pode ter chegado ao servidor: tente salvar de novo antes de mudar qualquer coisa.`
          : e.message,
      });
    }
  };

  const recomecar = () => {
    setArquivo(null);
    setUrl(null);
    setMeta({ duracaoS: null, erro: null, pronto: false });
    setDuplicada(false);
    setIncerto(null);
    setJaSalvo(null);
    setCampos((c) => ({ ...c, produto: '', inicio: '' }));
    refMarcacao.current = marcacaoVazia();
    setMarcacao(refMarcacao.current);
    setFimMs(null);
    setObservacao('');
    setClientId(null);
    setAviso(null);
    setEtapa('preparar');
  };

  /* ------------------------------------------------------------ tela */
  const podeComecar = Boolean(url && !meta.erro && meta.pronto && maquina && inicioValido);
  // Filmagem antiga nao aparece na lista da Embalagem (ultimos 30 dias).
  const foraDaLista = inicioValido && Date.now() - inicioData.getTime() > DIAS_DA_LISTA * 86400000;
  const duracaoVideoMs = meta.duracaoS != null ? meta.duracaoS * 1000 : null;

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
              {duplicada ? (
                /* O servidor ja' tinha esta medicao (o client_id): uma tentativa
                   anterior gravou e a resposta se perdeu. O que mudou depois
                   NAO entrou — dizer "salva" aqui seria mentir. */
                <div style={ev.aviso} role="alert">
                  Esta medição já estava no servidor: uma tentativa anterior chegou, mas a resposta não voltou.
                  O que você mudou depois disso <strong>não entrou</strong>. Confira a medição na lista da Embalagem
                  Takt Time. Se a diferença importa, salve esta versão como uma medição nova e exclua a anterior no
                  relatório Ritmo por máquina.
                  <div style={{ ...ev.linhaBotoes, marginTop: 8 }}>
                    <button
                      type="button" style={est.botaoSecundario} disabled={salvar.estado === 'enviando'}
                      onClick={() => salvarMedicao({ comoNova: true })}
                    >
                      {salvar.estado === 'enviando' ? 'Salvando…' : 'Salvar esta versão como medição nova'}
                    </button>
                  </div>
                  {salvar.erro && <div style={est.faixaErro} role="alert">Não salvou: {salvar.erro}</div>}
                </div>
              ) : (
                <p style={ev.ok} role="status">
                  ✓ Medição salva: {volumes(final?.medicao?.pecas || 0)} de {campos.produto || 'produto não informado'}.
                  {foraDaLista
                    ? ` A filmagem é de mais de ${DIAS_DA_LISTA} dias atrás: a lista da Embalagem Takt Time mostra só os últimos ${DIAS_DA_LISTA} dias, então ela não aparece lá — está no relatório Ritmo por máquina, escolhendo um período maior.`
                    : ' Ela já está na lista da Embalagem Takt Time, com o selo “por vídeo”.'}
                </p>
              )}
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
                    maquinas={carga.maquinas} produtos={produtos} takt={takt} inicioValido={inicioValido}
                    rascunho={rascunho} aoContinuar={continuarRascunho} aoDescartar={descartarRascunho}
                    podeComecar={podeComecar} aoComecar={comecar}
                    retomando={retomando} aviso={avisoPreparar} jaSalvo={jaSalvo} foraDaLista={foraDaLista}
                  />
                )}
                {url && (
                  /* Na revisao o video so' some da tela: desmontado, "Voltar a
                     marcar" recomecaria do segundo zero. */
                  <section style={{ ...ev.cartao, ...(etapa === 'revisar' ? { display: 'none' } : {}) }} aria-label="Vídeo">
                    {/* Sem os controles do navegador: eles roubariam o Espaco e as
                        setas das teclas de marcar. Os daqui fazem o mesmo. */}
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
                    {meta.erro && <div style={est.faixaErro} role="alert">{meta.erro}</div>}
                    {etapa === 'marcar' && (
                      <Controles
                        agoraMs={agoraMs} duracaoMs={duracaoVideoMs} tocando={tocando} velocidade={velocidade}
                        aoPlay={alternarPlay} aoIr={irPara} aoQuadro={quadro} aoVelocidade={trocarVelocidade}
                      />
                    )}
                    {etapa === 'marcar' && (
                      <Acoes
                        marcacao={marcacao} aviso={aviso}
                        aoToque={toque} aoDesfazer={desfazer} aoParou={parou} aoEncerrar={encerrar}
                      />
                    )}
                  </section>
                )}
              </div>

              {etapa === 'marcar' && (
                <Marcas
                  marcacao={marcacao} numeros={vivo} takt={takt} instante={instante}
                  aoIr={irPara}
                  aoRemoverVolume={(ms) => aplicar((m) => removerVolume(m, ms))}
                  aoRemoverParada={(ms) => aplicar((m) => removerParada(m, ms))}
                />
              )}
              {etapa === 'revisar' && final?.medicao && (
                <Revisar
                  medicao={final.medicao} numeros={numeros(final.medicao)} takt={takt}
                  maquina={maquina} produto={campos.produto}
                  observacao={observacao} aoObservacao={setObservacao}
                  salvar={salvar} aoSalvar={salvarMedicao}
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
  arquivo, aoEscolher, meta, campos, aoTrocar, maquinas, produtos, takt, inicioValido,
  rascunho, aoContinuar, aoDescartar, podeComecar, aoComecar, retomando, aviso, jaSalvo, foraDaLista,
}) {
  const motivoTakt = takt && !(takt.taktMs > 0) ? (motivoSemTakt(takt.estado) || 'sem programa da embalagem para esta semana') : null;
  // As marcacoes guardadas de OUTROS videos: continuam guardadas, e a tela
  // diz quais — escolher o mesmo arquivo as traz de volta.
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
        <p style={ev.dica}>
          Marcações em andamento neste PC:{' '}
          {outras.map((r) => `${r.nome} (${volumes(r.marcacao.toques.length)}, ${quando(r.atualizadoEm)})`).join('; ')}.
          Escolha o mesmo arquivo para continuar.
        </p>
      )}

      {jaSalvo && (
        <div style={ev.aviso} role="status">
          Este vídeo já foi salvo neste PC em {quando(jaSalvo.em)} ({volumes(jaSalvo.volumes)}). Salvar de novo cria
          outra medição: o takt e a junção contariam os mesmos volumes duas vezes.
        </div>
      )}

      {rascunho && (
        <div style={ev.aviso} role="status">
          Há uma marcação em andamento deste vídeo ({volumes(rascunho.marcacao.toques.length)}, guardada neste PC
          em {quando(rascunho.atualizadoEm)}). Continuar usa o que foi guardado com ela:{' '}
          {[rascunho.maquinaNome, rascunho.campos.produto || 'sem produto',
            rascunho.campos.inicio ? `início ${new Date(rascunho.campos.inicio).toLocaleString('pt-BR')}` : null]
            .filter(Boolean).join(' · ')}.{' '}
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
        {inicioValido && takt?.taktMs > 0 && (
          <>
            Vale o takt da semana {takt.semana}: <strong>{formatarSegundos(takt.taktMs)} s por volume</strong>
            {diasProgramados(takt.dias) ? ` · ${diasProgramados(takt.dias)}` : ''}.{' '}
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
  marcacao, aviso, aoToque, aoDesfazer, aoParou, aoEncerrar,
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
          type="button" onMouseDown={semFoco} onClick={aoToque}
          style={{ ...ev.acao, ...(largada ? ev.acaoLargada : ev.acaoVolume) }}
        >
          {largada ? 'Largada' : '+1 volume'} <span style={ev.tecla}>Enter</span>
        </button>
        <button type="button" onMouseDown={semFoco} onClick={aoDesfazer} style={ev.acao}>
          Desfazer volume <span style={ev.tecla}>⌫</span>
        </button>
        <button type="button" onMouseDown={semFoco} onClick={aoParou} style={{ ...ev.acao, ...ev.acaoParou }}>
          {marcacao.aberta ? 'Voltou' : 'Parou'} <span style={ev.tecla}>P</span>
        </button>
        <button type="button" onMouseDown={semFoco} onClick={aoEncerrar} style={{ ...ev.acao, ...ev.acaoEncerrar }}>
          Encerrar <span style={ev.tecla}>F</span>
        </button>
      </div>
      {aviso && <p style={ev.aviso} role="alert">{aviso}</p>}
      <p style={ev.teclas}>
        {largada
          ? 'Assista até um volume fechar e aperte Enter: é a largada — ela abre o período e não conta volume, como no tablet. '
          : 'Enter a cada volume que fecha; ⌫ desfaz o último volume marcado (parada sai pelo × da lista). '}
        Espaço pausa · ← → 5 s · , . um quadro · 1 2 3 velocidade 1×, 1,5×, 2× · clique numa marca para voltar a ela.
      </p>
    </>
  );
}

/** A coluna das marcas: os numeros (os mesmos do tablet) e a lista, em ordem de video. */
function Marcas({
  marcacao, numeros, takt, instante, aoIr, aoRemoverVolume, aoRemoverParada,
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
  const acima = takt?.taktMs > 0 && numeros?.porVolume > takt.taktMs;
  const lacunas = numeros?.leitura?.suficiente ? numeros.leitura.lacunas.length : null;
  // As paradas daqui sao intervalos do video (inicio/fim), nao duracoes.
  const parado = paradas.reduce((soma, p) => soma + (p.fimMs - p.inicioMs), 0);
  const ultimo = toques.length ? toques[toques.length - 1].ms : null;
  // Volumes/hora do periodo ate' o ultimo volume, paradas dentro — a conta
  // do tablet (nao e' velocimetro: so' muda quando se marca).
  const volHora = toques.length >= 2 && ultimo > largadaMs ? Math.round((toques.length * 3600000) / (ultimo - largadaMs)) : null;
  const quando = largadaMs != null ? instante(largadaMs) : null;
  return (
    <aside style={{ ...ev.cartao, position: 'sticky', top: 16 }} aria-label="Marcas da medição">
      <div style={ev.numeros}>
        <Numero rotulo="Volumes" valor={String(toques.length)} />
        <Numero
          rotulo={acima ? 'Por vol ▲ takt' : 'Por volume'}
          valor={numeros?.porVolume ? `${formatarSegundos(numeros.porVolume)} s` : '—'}
          atencao={acima}
        />
        <Numero rotulo="Takt" valor={takt?.taktMs > 0 ? `${formatarSegundos(takt.taktMs)} s` : '—'} />
        <Numero rotulo="Vol/h período" valor={volHora != null ? String(volHora) : '—'} sub="até o último volume" />
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
  medicao, numeros, takt, maquina, produto, observacao, aoObservacao, salvar, aoSalvar, aoVoltar,
}) {
  const { porVolume, leitura, calc } = numeros;
  const acima = takt?.taktMs > 0 && porVolume > takt.taktMs;
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
          rotulo={acima ? 'Por vol ▲ takt' : 'Por volume no período'}
          valor={porVolume ? `${formatarSegundos(porVolume)} s` : '—'}
          atencao={acima}
        />
        <Numero rotulo="Takt" valor={takt?.taktMs > 0 ? `${formatarSegundos(takt.taktMs)} s` : '—'} />
        <Numero
          rotulo="Volumes/hora" valor={calc ? String(Math.round(calc.pecasPorHoraBruto)) : '—'}
          sub="da largada ao Encerrar, paradas dentro"
        />
        <Numero rotulo="Lacunas" valor={leitura?.suficiente ? String(leitura.lacunas.length) : '—'} />
        <Numero rotulo="Parado (marcado)" valor={calc?.paradaMs > 0 ? duracaoCurta(calc.paradaMs) : '—'} />
      </div>
      {leitura && !leitura.suficiente && (
        <p style={ev.dica}>Poucos volumes para ler o intervalo: {leitura.motivo}. O tempo por volume vale; as lacunas, ainda não.</p>
      )}
      {leitura && <GraficoIntervalos leitura={leitura} unidade={VOLUME} altura={240} />}
      <label style={ev.campo}>
        <span style={ev.rotulo}>Observação (opcional)</span>
        <textarea
          style={ev.observacao} value={observacao} maxLength={2000}
          onChange={(e) => aoObservacao(e.target.value)}
          aria-label="Observação da medição"
          placeholder="O que o vídeo mostra e o número não diz: troca de operador, falta de caixa…"
        />
      </label>
      {salvar.erro && <div style={est.faixaErro} role="alert">Não salvou: {salvar.erro}</div>}
      <div style={ev.linhaBotoes}>
        <button type="button" style={est.botaoImprimir} onClick={aoSalvar} disabled={salvar.estado === 'enviando'}>
          {salvar.estado === 'enviando' ? 'Salvando…' : 'Salvar medição'}
        </button>
        <button type="button" style={est.botaoSecundario} onClick={aoVoltar} disabled={salvar.estado === 'enviando'}>
          Voltar a marcar
        </button>
      </div>
    </section>
  );
}

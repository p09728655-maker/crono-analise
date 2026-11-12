"""
Leitor de câmera da envolvedora — conta volumes pela cor de papelão.

Olha um retângulo fixo da imagem (a esteira embaixo do rolo de filme) e mede
quanto dele está coberto de papelão. Volume passando = o retângulo enche de
papelão; esteira vazia = quase nada. Cada passagem vira uma linha no CSV do
dia, com a hora em que o volume entrou e saiu do filme.

Não usa IA nem internet: só ffmpeg + Python, no PC da fábrica. Nenhuma imagem
é guardada — só as horas.

Uso (ver LEIA-ME.md):
  python leitor_camera.py --foto                 confere onde está o retângulo
  python leitor_camera.py --diagnostico          mostra o % de papelão a cada segundo
  python leitor_camera.py                        roda na câmera, sem parar
  python leitor_camera.py --arquivo v.dav        vídeo do gravador: a hora vem do próprio .dav
  python leitor_camera.py --arquivo v.mp4 --inicio 10:01:06   outro vídeo: a hora vem da imagem
"""
import argparse
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, unquote

import numpy as np

PASTA = Path(__file__).resolve().parent

# Tamanho em que o retângulo é analisado. Pequeno de propósito: para saber
# "tem papelão ou não" não precisa de resolução, e assim o PC mal sente.
LARG, ALT = 128, 48

# Quanto tempo sem receber imagem até considerar que a câmera caiu.
SEM_IMAGEM_S = 30

# Quanto a leitura pode ficar atrás do relógio (quadros represados) antes de
# reconectar. Rajada depois de um engasgo é normal e se recupera sozinha.
ATRASO_MAX_S = 60

# A pasta do leitor vem primeiro: quem não consegue instalar o ffmpeg no
# Windows só copia o ffmpeg.exe para cá, sem mexer no PATH.
FFMPEG = next((str(p) for p in (PASTA / 'ffmpeg.exe', PASTA / 'ffmpeg') if p.is_file()),
              None) or shutil.which('ffmpeg')

CAMPOS = ('camera', 'retangulo', 'limiar_entra', 'limiar_sai',
          'permanencia_minima_s', 'quadros_por_segundo')

# Intervalo maior que isto entre dois volumes não é ciclo: é noite, fim de
# semana ou turno parado. Almoço e parada comum ficam abaixo e continuam no
# intervalo (por isso a planilha manda usar a mediana).
PAUSA_MAXIMA_MIN = 120

# Usuário:senha da câmera, tirados do config.json, para nunca saírem na tela
# nem no log.
SEGREDOS = []


def guardar_segredos(endereco):
    # Tudo entre "://" e o ÚLTIMO "@". Não usar um leitor de URL comum: senha
    # com "/" ou espaço é lida por ele como início do caminho e escaparia.
    resto = endereco.split('://', 1)[-1]
    if '@' not in resto:
        return
    info = resto.rsplit('@', 1)[0]
    candidatos = {info, unquote(info)}
    if ':' in info:
        senha = info.split(':', 1)[1]
        candidatos |= {senha, unquote(senha), quote(unquote(senha), safe='')}
    # Do mais longo para o mais curto; muito curto não é trocado para não
    # estragar o resto do texto (e senha de 1–2 letras não protege nada).
    SEGREDOS[:] = sorted((c for c in candidatos if len(c) >= 3), key=len, reverse=True)


def sem_senha(texto):
    """O ffmpeg repete o endereço inteiro da câmera nos erros, com usuário e
    senha. Nada que vai para tela ou log pode levar isso."""
    # Troca o texto exato da senha (qualquer caractere, em qualquer pedaço da
    # mensagem) e, por garantia, qualquer "xxx://usuario:senha@".
    for segredo in SEGREDOS:
        texto = texto.replace(segredo, '***')
    # Nome do protocolo com tamanho limitado: texto longo não fica lento.
    return re.sub(r'([A-Za-z][\w+.-]{0,15}://)[^\s/@]+@', r'\1***@', texto)


def parar(msg):
    """Erro que a pessoa precisa corrigir. Sai com código 2: o iniciar.bat para e
    mostra o motivo, em vez de reiniciar a cada 10 s repetindo o mesmo erro."""
    print(sem_senha(msg), file=sys.stderr, flush=True)
    if os.name == 'nt' and 'PROMPT' not in os.environ:
        # Aberto com dois cliques (fora do Prompt e do iniciar.bat, que definem
        # PROMPT): a janela fecharia na hora, antes de dar para ler o motivo.
        try:
            input('\nAperte Enter para fechar.')
        except (EOFError, KeyboardInterrupt):
            pass
    sys.exit(2)


def desligar_selecao_do_console():
    """
    No Prompt do Windows, um clique na janela entra no modo de seleção e PAUSA
    o programa na próxima escrita na tela, até alguém apertar uma tecla. A
    câmera continua mandando imagem, a fila enche, e a leitura para sem
    registro. Desliga esse modo só para esta janela.
    """
    if os.name != 'nt':
        return
    try:
        import ctypes
        k32 = ctypes.windll.kernel32
        entrada = k32.GetStdHandle(-10)  # STD_INPUT_HANDLE
        modo = ctypes.c_uint32()
        if k32.GetConsoleMode(entrada, ctypes.byref(modo)):
            EDICAO_RAPIDA, FLAGS_ESTENDIDAS = 0x40, 0x80
            k32.SetConsoleMode(entrada, (modo.value & ~EDICAO_RAPIDA) | FLAGS_ESTENDIDAS)
    except Exception:
        pass  # sem console (rodando escondido): nada a desligar


def ler_config():
    arq = PASTA / 'config.json'
    if not arq.exists():
        parar('Falta o config.json. Copie config.exemplo.json para config.json e preencha.')
    try:
        # utf-8-sig: o Bloco de Notas antigo grava uma marca invisível no começo.
        cfg = json.loads(arq.read_text(encoding='utf-8-sig'))
    except UnicodeDecodeError:
        parar('O config.json foi salvo numa codificação diferente. No Bloco de Notas: '
              'Salvar como → Codificação: UTF-8.')
    except json.JSONDecodeError as e:
        parar(f'O config.json tem um erro de digitação na linha {e.lineno} '
              '(aspas, vírgula ou chave faltando). Compare com o config.exemplo.json.')
    if not isinstance(cfg, dict):
        parar('O config.json tem que começar com { e terminar com }. Compare com o config.exemplo.json.')
    faltam = [c for c in CAMPOS if c not in cfg]
    if faltam:
        parar('Faltam no config.json: ' + ', '.join(faltam) + '. Compare com o config.exemplo.json.')

    def numero(valor, nome, minimo, maximo, exemplo, inteiro=False):
        # Número escrito entre aspas ("0.30") vira texto e quebraria o leitor
        # só no meio da operação — no 1º volume, perdendo-o.
        ok = (isinstance(valor, (int, float)) and not isinstance(valor, bool)
              and minimo <= valor <= maximo and (not inteiro or float(valor).is_integer()))
        if not ok:
            parar(f'{nome} tem que ser um número de {minimo} a {maximo}, sem aspas '
                  f'(ex.: {exemplo}; decimal com ponto). Compare com o config.exemplo.json.')

    if not isinstance(cfg['camera'], str):
        parar('camera tem que ser o endereço entre aspas. Compare com o config.exemplo.json.')
    r = cfg['retangulo']
    if not isinstance(r, dict):
        parar('retangulo tem que ter x, y, largura e altura. Compare com o config.exemplo.json.')
    for k in ('x', 'y', 'largura', 'altura'):
        numero(r.get(k), f'retangulo.{k}', 0, 1, '0.25')
    if r['x'] + r['largura'] > 1 or r['y'] + r['altura'] > 1:
        parar('O retângulo passa da borda da imagem: confira x+largura e y+altura.')
    numero(cfg['limiar_entra'], 'limiar_entra', 0, 1, '0.30')
    numero(cfg['limiar_sai'], 'limiar_sai', 0, 1, '0.20')
    if not cfg['limiar_sai'] < cfg['limiar_entra']:
        parar('limiar_sai tem que ser menor que limiar_entra.')
    numero(cfg['permanencia_minima_s'], 'permanencia_minima_s', 0, 60, '2.0')
    numero(cfg['quadros_por_segundo'], 'quadros_por_segundo', 1, 30, '10', inteiro=True)
    cfg['quadros_por_segundo'] = int(cfg['quadros_por_segundo'])
    cfg.setdefault('pausa_maxima_min', PAUSA_MAXIMA_MIN)
    numero(cfg['pausa_maxima_min'], 'pausa_maxima_min', 1, 24 * 60, '120')
    if not isinstance(cfg.get('pasta_dados', 'dados'), str):
        parar('pasta_dados tem que ser um nome entre aspas (ex.: "dados").')
    guardar_segredos(cfg['camera'])
    return cfg


def entrada_ffmpeg(cfg, arquivo):
    if arquivo:
        return ['-i', str(arquivo)]
    # TCP em vez de UDP: na rede da fábrica perde menos pacote, e pacote
    # perdido vira borrão na imagem — que pode parecer papelão.
    return ['-rtsp_transport', 'tcp', '-timeout', str(15_000_000), '-i', cfg['camera']]


def ler_dav(arquivo):
    """O que o .dav diz de si: (início, duração em s), ou None se não é .dav.

    Início: data e hora do 1º quadro. O .dav (Intelbras/Dahua) guarda o relógio
    do gravador, sem fuso; o ffmpeg o devolve como se fosse UTC, então lido
    como UTC volta a hora da parede. Conferido num vídeo da envolvedora: o 1º
    quadro bate com a hora escrita na imagem, e daí em diante o .dav fica até
    1 s à frente dela — a mesma precisão de ler a hora na tela, e diferença
    fixa, que a validação desconta. O NOME do arquivo exportado não serve:
    veio 3 s depois do 1º quadro. None se a hora é impossível (gravador com
    relógio zerado): aí vale o --inicio.

    Duração: do 1º ao último pacote, pelo relógio do gravador (None se ele
    volta para trás). Serve para achar salto no relógio — ver aviso_de_salto."""
    r = subprocess.run([FFMPEG, '-nostdin', '-hide_banner', '-i', str(arquivo)],
                       stdin=subprocess.DEVNULL, capture_output=True,
                       text=True, encoding='utf-8', errors='replace')
    if not re.search(r'Input #0, dhav,', r.stderr):
        return None
    inicio = None
    m = re.search(r'start: (\d+(?:\.\d+)?)', r.stderr)
    if m:
        t = datetime.fromtimestamp(float(m.group(1)), timezone.utc).replace(tzinfo=None)
        if datetime(2015, 1, 1) <= t <= datetime.now() + timedelta(days=1):
            inicio = t
    d = re.search(r'Duration: (\d+):(\d\d):(\d\d(?:\.\d+)?)', r.stderr)
    duracao = int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3)) if d else None
    return inicio, duracao


def aviso_de_salto(duracao_dav, video_s):
    """Aviso quando o relógio do .dav e o vídeo lido não batem, ou None.

    Gravação interrompida no meio do .dav (por movimento, queda, dois trechos
    juntados) ou relógio acertado para trás: o ffmpeg emenda as duas pontas
    (salto para frente de mais de 10 s, qualquer volta para trás) e só avisa
    num nível que o leitor não mostra. As horas depois do salto saem erradas
    e, num buraco, o intervalo que o atravessa encurta. Sem salto a diferença
    fica abaixo de 1 s (o relógio do .dav anda de segundo em segundo); 3 s de
    folga."""
    if duracao_dav is not None and abs(duracao_dav - video_s) <= 3:
        return None
    if duracao_dav is not None and duracao_dav > video_s:
        buraco = duracao_dav - video_s
        oque = f'buraco de uns {buraco / 60:.0f} min' if buraco >= 90 else f'buraco de uns {buraco:.0f} s'
        oque += ' sem gravação'
        mais_curto = True
    else:
        # Relógio acertado para trás ou trechos juntados: o vídeo segue
        # contínuo e as durações ficam certas; só a hora deixa de bater.
        oque, mais_curto = 'relógio voltando para trás: acerto de relógio ou trechos juntados', False
    return (f'ATENÇÃO: salto no relógio do .dav ({oque}). As horas depois do salto não '
            'batem com a hora da imagem'
            + (', e o intervalo que atravessa o buraco sai mais curto do que foi' if mais_curto else '')
            + '. Exporte um trecho sem interrupção.')


def filtro_retangulo(cfg):
    r = cfg['retangulo']
    return (f"crop=w=iw*{r['largura']}:h=ih*{r['altura']}:x=iw*{r['x']}:y=ih*{r['y']},"
            f"scale={LARG}:{ALT}")


def fracao_papelao(quadro):
    """Fração do retângulo com cor de papelão (pardo: bem mais vermelho que azul)."""
    q = quadro.astype(np.int16)
    R, G, B = q[..., 0], q[..., 1], q[..., 2]
    return float(((R - B > 35) & (R >= G) & (R > 90)).mean())


class Camera:
    """Lê os quadros do retângulo numa thread, para uma câmera travada não travar o leitor."""

    def __init__(self, cfg, arquivo):
        self.fila = queue.Queue(maxsize=200)
        # -nostdin e stdin fechado: sem isso o ffmpeg lê o teclado do Prompt, e
        # um "q" digitado na janela derruba a câmera.
        cmd = [FFMPEG, '-nostdin', '-v', 'error', *entrada_ffmpeg(cfg, arquivo),
               '-an', '-vf', f"fps={cfg['quadros_por_segundo']},{filtro_retangulo(cfg)}",
               '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']
        self.proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL,
                                     stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.avisos = deque(maxlen=5)
        threading.Thread(target=self._ler, daemon=True).start()
        # Esvazia os avisos do ffmpeg o tempo todo. Câmera com perda de pacote
        # gera aviso sem parar; se ninguém lê, o canal enche, o ffmpeg trava
        # esperando, e a leitura para — horas depois, no meio do turno.
        threading.Thread(target=self._ler_avisos, daemon=True).start()

    def _ler(self):
        tam = LARG * ALT * 3
        while True:
            dados = self.proc.stdout.read(tam)
            if len(dados) < tam:
                self.fila.put(None)  # fim do arquivo ou câmera caiu
                return
            self.fila.put(np.frombuffer(dados, np.uint8).reshape(ALT, LARG, 3))

    def proximo(self):
        try:
            return self.fila.get(timeout=SEM_IMAGEM_S)
        except queue.Empty:
            return None

    def _ler_avisos(self):
        for linha in self.proc.stderr:
            self.avisos.append(linha.decode(errors='replace').strip())

    def erro(self):
        try:
            self.proc.wait(timeout=5)  # deixa o ffmpeg terminar de escrever o motivo
        except subprocess.TimeoutExpired:
            pass
        time.sleep(0.2)
        return sem_senha(' | '.join(self.avisos))[-300:]

    def fechar(self):
        if self.proc.poll() is None:
            self.proc.kill()


def hora(t):
    """HH:MM:SS,d — com décimo de segundo: cortar no segundo inteiro já erra
    até 1 s, o tamanho da tolerância da validação."""
    t = t + timedelta(microseconds=50_000)  # arredonda para o décimo mais próximo
    return f'{t:%H:%M:%S},{t.microsecond // 100_000}'


def gravar_no_disco(arq, texto, modo='a', bom=False):
    """Grava e força a ida para o disco: falta de luz não leva o que já foi contado."""
    with open(arq, modo, encoding='utf-8-sig' if bom else 'utf-8', newline='') as f:
        f.write(texto)
        f.flush()
        os.fsync(f.fileno())


def ja_gravada(arq, linha):
    """
    A linha já está na planilha? Compara só data;entrou;saiu (números, sem
    acento) e lê o arquivo aceitando qualquer codificação: se alguém salvou a
    planilha pelo Excel ("CSV separado por vírgulas" grava em ANSI), ler como
    UTF-8 estrito quebrava a recuperação — e o leitor, em ciclo.
    """
    chave = ';'.join(linha.split(';')[:3]) + ';'
    texto = arq.read_bytes().decode('utf-8', errors='replace')
    return any(l.lstrip('﻿').startswith(chave) for l in texto.splitlines())


def travar_instancia(pasta):
    """
    Um leitor por pasta. Dois ao mesmo tempo (o iniciar.bat rodando e alguém
    abrindo o .py com dois cliques) contavam cada volume duas vezes, sem aviso.
    A trava é do sistema: some sozinha quando o processo morre (queda, X,
    reinício), então nunca fica presa.
    """
    pasta.mkdir(exist_ok=True)
    try:
        trava = open(pasta / 'leitor.trava', 'a+')
        if os.name == 'nt':
            import msvcrt
            trava.seek(0)
            msvcrt.locking(trava.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(trava.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        parar('O leitor já está rodando em outra janela (ou pelo iniciar.bat). '
              'Feche esta: dois ao mesmo tempo contariam cada volume duas vezes.')
    return trava  # fica aberto enquanto o leitor rodar


class Registro:
    """CSV do dia (separador ';' e vírgula decimal: abre direto no Excel em português)."""

    CABECALHO = 'data;entrou;saiu;segundos_no_filme;segundos_desde_anterior;observacao\n'
    # Volumes à espera de a planilha do dia ser liberada (o Excel tranca o CSV
    # aberto). Fica em DISCO, não na memória: janela fechada no X, falta de luz
    # ou reinício do Windows não podem levar o que já foi contado.
    ESPERA = 'volumes_esperando_planilha.txt'

    def __init__(self, cfg, nome_fixo=None, dono_da_fila=False):
        self.pasta = PASTA / cfg.get('pasta_dados', 'dados')
        self.pasta.mkdir(exist_ok=True)
        self.nome_fixo = nome_fixo
        self.espera = self.pasta / self.ESPERA
        self.pendentes = []  # (arquivo, linha, veio_de_execucao_anterior)
        self.travado = False
        # Só o leitor ao vivo — o que segura a trava — lê, grava ou apaga a
        # fila. Diagnóstico e validação com vídeo rodam com a fila vazia e,
        # se mexessem nela, apagariam no fim os volumes de outra execução.
        self.dono_da_fila = dono_da_fila and not nome_fixo
        self.fila_ilegivel = False
        if self.dono_da_fila:
            self._recuperar()
            if self.pendentes:
                self.gravar_pendentes()

    def log(self, msg):
        linha = f'{datetime.now():%Y-%m-%d %H:%M:%S}  {sem_senha(msg)}'
        print(linha, flush=True)
        try:
            with open(self.pasta / 'leitor.log', 'a', encoding='utf-8') as f:
                f.write(linha + '\n')
        except OSError:
            pass  # log é ajuda, não pode derrubar a contagem

    def volume(self, entrou, saiu, desde_anterior, obs=''):
        arq = self.pasta / (self.nome_fixo or f'volumes_{saiu:%Y-%m-%d}.csv')
        num = lambda s: '' if s is None else f'{s:.1f}'.replace('.', ',')
        no_filme = None if entrou is None else (saiu - entrou).total_seconds()
        linha = ';'.join([f'{saiu:%d/%m/%Y}', '' if entrou is None else hora(entrou),
                          hora(saiu), num(no_filme), num(desde_anterior), obs]) + '\n'
        if self.nome_fixo:
            # Vídeo exportado (validação): planilha aberta é só fechar e rodar de novo.
            try:
                gravar_no_disco(arq, (self.CABECALHO if not arq.exists() else '') + linha,
                                bom=not arq.exists())
            except OSError as e:
                parar(f'Não consegui gravar {arq.name} ({e.strerror}). '
                      'Está aberto no Excel? Feche e rode de novo.')
        else:
            self.pendentes.append((arq, linha, False))
            self.gravar_pendentes()
        print(f'  volume  entrou {"   ?    " if entrou is None else hora(entrou)}'
              + ('' if desde_anterior is None else f'   ciclo {num(desde_anterior)} s')
              + (f'   ({obs})' if obs else ''), flush=True)

    def gravar_pendentes(self):
        """Grava o que estiver esperando, na ordem. Se a planilha estiver
        trancada, deixa esperando em disco e tenta de novo depois."""
        while self.pendentes:
            arq, linha, anterior = self.pendentes[0]
            try:
                novo = not arq.exists()
                # Linha recuperada de uma execução que caiu no meio da gravação
                # pode já estar na planilha: não duplica.
                if not (anterior and not novo and ja_gravada(arq, linha)):
                    gravar_no_disco(arq, (self.CABECALHO if novo else '') + linha, bom=novo)
            except OSError as e:
                if not self.travado:
                    self.travado = True
                    self.log(f'não consegui gravar {arq.name} ({e.strerror}) — aberto no Excel? '
                             f'Os volumes esperam em {self.ESPERA} e entram quando ele fechar.')
                break
            self.pendentes.pop(0)
        self._atualizar_espera()
        if self.travado and not self.pendentes:
            self.travado = False
            self.log('planilha liberada: os volumes que esperavam foram gravados.')

    def _atualizar_espera(self):
        if not self.dono_da_fila:
            return
        if self.fila_ilegivel:
            self._recuperar()  # junta os de antes na frente, se agora der para ler
            if self.fila_ilegivel:
                return  # não grava por cima do que não conseguiu ler
        try:
            if self.pendentes:
                tmp = self.espera.with_suffix('.tmp')
                gravar_no_disco(tmp, ''.join(f'{a.name}\t{l}' for a, l, _ in self.pendentes), modo='w')
                os.replace(tmp, self.espera)  # troca inteira: nunca fica pela metade
            elif self.espera.exists():
                self.espera.unlink()
        except OSError as e:
            self.log(f'não consegui guardar os volumes em espera ({e.strerror}): '
                     f'{len(self.pendentes)} volume(s) só na memória até a planilha liberar.')

    def _recuperar(self):
        """Volumes que esperavam a planilha quando o leitor foi fechado. Se a
        fila não puder ser lida agora (antivírus segurando o arquivo), marca e
        não mexe nela até conseguir: gravar por cima apagaria esses volumes."""
        if not self.espera.exists():
            self.fila_ilegivel = False
            return
        try:
            linhas = self.espera.read_text(encoding='utf-8', errors='replace').splitlines(keepends=True)
        except OSError as e:
            if not self.fila_ilegivel:
                self.log(f'não consegui ler {self.ESPERA} ({e.strerror}): os volumes de antes ficam '
                         'lá, e o leitor tenta de novo antes de mexer na fila.')
            self.fila_ilegivel = True
            return
        self.fila_ilegivel = False
        antigos = []
        for item in linhas:
            nome, _, linha = item.partition('\t')
            if nome and linha:
                antigos.append((self.pasta / nome, linha, True))
        # Os de antes vão na frente dos que ainda esperam. Se a fila estava
        # ilegível e a planilha livre, volumes novos já entraram antes deles:
        # a ordem das linhas pode sair trocada, mas cada uma leva a própria hora.
        self.pendentes[:0] = antigos
        self.log(f'{len(antigos)} volume(s) que esperavam a planilha foram recuperados.')

    def fechar(self):
        self.gravar_pendentes()
        if not self.pendentes:
            return
        if not self.fila_ilegivel:
            self.log(f'{len(self.pendentes)} volume(s) esperando a planilha em {self.ESPERA}: '
                     'entram nela na próxima vez que o leitor abrir.')
            return
        # Fila ilegível a execução inteira E planilha travada: estes volumes só
        # existem na memória. Vão para um arquivo à parte, e o log diz a verdade.
        reserva = self.pasta / f'volumes_nao_gravados_{datetime.now():%Y-%m-%d_%H%M%S}.csv'
        try:
            gravar_no_disco(reserva, self.CABECALHO + ''.join(l for _, l, _ in self.pendentes),
                            modo='w', bom=True)
            self.log(f'{len(self.pendentes)} volume(s) não entraram na planilha nem na fila '
                     f'({self.ESPERA} ilegível): estão em {reserva.name}. Copie as linhas para a planilha.')
        except OSError as e:
            self.log(f'{len(self.pendentes)} volume(s) PERDIDOS: planilha travada, fila ilegível '
                     f'e não consegui gravar {reserva.name} ({e.strerror}).')


class Detector:
    """
    Liga quando o papelão passa de limiar_entra e desliga quando cai abaixo de
    limiar_sai. Dois limiares (e não um) para o filme balançando em cima do
    volume não gerar várias marcas para a mesma caixa.
    """

    def __init__(self, cfg, registro):
        self.cfg, self.reg = cfg, registro
        self.janela = deque(maxlen=max(1, round(cfg['quadros_por_segundo'] / 2)))  # média de 0,5 s
        # A média atrasa a leitura em meia janela; desconta isso da hora.
        self.atraso = timedelta(seconds=(self.janela.maxlen - 1) / 2 / cfg['quadros_por_segundo'])
        self.pausa_maxima_s = cfg.get('pausa_maxima_min', PAUSA_MAXIMA_MIN) * 60
        self.ultima_entrada = None
        self.reiniciar(apos_queda=False)

    def reiniciar(self, apos_queda):
        """Depois de uma queda, o que estava na esteira é desconhecido: recomeça do zero."""
        self.janela.clear()
        self.dentro, self.entrou, self.parcial = False, None, False
        self.primeira_leitura = True
        if apos_queda:
            self.ultima_entrada = None  # o intervalo atravessaria a queda: não é ciclo

    def quadro(self, momento, fracao):
        self.janela.append(fracao)
        if len(self.janela) < self.janela.maxlen:
            return
        media = sum(self.janela) / len(self.janela)
        agora = momento - self.atraso

        if self.primeira_leitura:
            self.primeira_leitura = False
            if media > self.cfg['limiar_entra']:
                # Já havia volume embaixo do filme quando o leitor começou:
                # ele conta quando sair, mas a hora de entrada é desconhecida.
                self.dentro, self.parcial = True, True
                return

        if not self.dentro and media > self.cfg['limiar_entra']:
            self.dentro, self.entrou = True, agora
        elif self.dentro and media < self.cfg['limiar_sai']:
            self.dentro = False
            if self.parcial:
                self._registrar(None, agora, 'já estava no filme quando a leitura começou')
            elif (agora - self.entrou).total_seconds() < self.cfg['permanencia_minima_s']:
                self.reg.log(f'descartado: papelão por só {(agora - self.entrou).total_seconds():.1f} s '
                             f'às {agora:%H:%M:%S} (pessoa ou reflexo?)')
            else:
                self._registrar(self.entrou, agora, '')
            self.entrou, self.parcial = None, False

    def _registrar(self, entrou, saiu, obs):
        """
        O intervalo é de ENTRADA a ENTRADA: a mesma marca que o analista usa
        (frente da caixa tocando o tapete verde) e que a validação confere.
        """
        desde = None
        if entrou is not None and self.ultima_entrada is not None:
            desde = (entrou - self.ultima_entrada).total_seconds()
            if desde > self.pausa_maxima_s:
                # Noite, fim de semana, turno parado — por tempo, não por data:
                # turno que atravessa a meia-noite continua com o ciclo certo.
                obs = obs or f'{desde / 3600:.1f} h sem volume antes deste: não é ciclo'
                desde = None
        self.reg.volume(entrou, saiu, desde, obs)
        if entrou is not None:
            self.ultima_entrada = entrou

    def fim(self, momento):
        if self.dentro:
            self.reg.log(f'volume embaixo do filme quando o leitor parou ({momento:%H:%M:%S}): não contado')


def tirar_foto(cfg, arquivo, momento):
    r = cfg['retangulo']
    saida = PASTA / 'foto_camera.jpg'
    cmd = [FFMPEG, '-nostdin', '-v', 'error', '-y']
    if arquivo:
        cmd += ['-ss', str(momento)]
    # Grade de 10 em 10% (linhas amarelas grossas no meio) para ler as frações
    # do config.json direto na foto. Sem texto de propósito: escrever na imagem
    # depende de fonte instalada, e a grade funciona em qualquer PC.
    grade = ('drawgrid=w=iw/10:h=ih/10:t=1:c=white@0.6,'
             'drawbox=x=iw/2-1:y=0:w=3:h=ih:c=yellow@0.9:t=fill,'
             'drawbox=x=0:y=ih/2-1:w=iw:h=3:c=yellow@0.9:t=fill,')
    cmd += [*entrada_ffmpeg(cfg, arquivo), '-frames:v', '1', '-vf',
            grade + f"drawbox=x=iw*{r['x']}:y=ih*{r['y']}:w=iw*{r['largura']}:h=ih*{r['altura']}:color=red:t=3",
            str(saida)]
    resultado = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, text=True)
    if resultado.returncode != 0:
        parar('Não consegui tirar a foto: ' + sem_senha(resultado.stderr.strip())[-300:])
    print(f'Foto salva em {saida}.\n'
          'O retângulo vermelho tem que cobrir o caminho da caixa na envolvedora.\n'
          'Cada linha branca = 10% da imagem; as amarelas marcam o meio (50%).\n'
          'Para mudar: no config.json, x e y = canto de cima à esquerda; largura e altura = tamanho.')


def rodar(cfg, arquivo, inicio, diagnostico, dav=None):
    # dav: o que ler_dav devolveu (None se não é .dav ou é a câmera ao vivo).
    # Ao vivo grava a planilha do dia e a fila: só um leitor por vez. O
    # diagnóstico só olha (não recupera fila nem grava volume) e pode rodar
    # junto, para conferir a câmera sem parar a contagem.
    trava = None
    if not arquivo and not diagnostico:
        trava = travar_instancia(PASTA / cfg.get('pasta_dados', 'dados'))
    # Resultado de vídeo vai para dados\videos\: com o mesmo padrão das
    # planilhas do dia, um vídeo chamado 2026-11-11.mp4 apagava a produção
    # daquele dia e gravava os números do vídeo no lugar.
    if arquivo:
        (PASTA / cfg.get('pasta_dados', 'dados') / 'videos').mkdir(parents=True, exist_ok=True)
    reg = Registro(cfg, nome_fixo=f'videos/{Path(arquivo).stem}.csv' if arquivo else None,
                   dono_da_fila=trava is not None)
    if arquivo and not diagnostico:
        saida = reg.pasta / reg.nome_fixo
        if saida.exists():
            saida.unlink()  # reprocessar o mesmo vídeo substitui, não soma
    try:
        _rodar(cfg, arquivo, inicio, diagnostico, reg, dav)
    finally:
        reg.fechar()  # nenhum volume guardado fica para trás, saia como sair
        if trava:
            trava.close()


def _rodar(cfg, arquivo, inicio, diagnostico, reg, dav):
    det = Detector(cfg, reg)
    fps = cfg['quadros_por_segundo']
    espera = 5
    reg.log('leitor iniciado' + (f' no arquivo {arquivo}' if arquivo else ''))
    while True:
        cam = Camera(cfg, arquivo)
        n, momento, ultimo_print, ancora, motivo = 0, None, -1, None, ''
        while True:
            q = cam.proximo()
            if q is None:
                break
            if arquivo:
                momento = inicio + timedelta(seconds=n / fps)
            else:
                # Hora pelo NÚMERO do quadro, não pela chegada. Depois de um
                # engasgo (rede, PC ocupado) os quadros chegam em rajada, mas
                # cada um continua 1/fps depois do anterior — usar a hora de
                # chegada espremia a caixa em décimos de segundo e ela era
                # descartada. A âncora só desce: fica no quadro que chegou com
                # menos atraso, e assim também corrige a demora de conexão.
                agora = datetime.now()
                base = agora - timedelta(seconds=n / fps)
                if ancora is None or base < ancora:
                    ancora = base
                momento = ancora + timedelta(seconds=n / fps)
                atrasado = (agora - momento).total_seconds()
                if atrasado > ATRASO_MAX_S:
                    motivo = f'leitura {atrasado:.0f} s atrás do relógio (quadros represados)'
                    break
            seg = int(n / fps)
            n += 1
            f = fracao_papelao(q)
            if diagnostico:
                if seg != ultimo_print:
                    ultimo_print = seg
                    barra = '#' * round(f * 40)
                    print(f'{momento:%H:%M:%S}  papelão no retângulo: {f:5.1%}  |{barra:<40}|', flush=True)
                continue
            det.quadro(momento, f)
            espera = 5
            if reg.pendentes and n % (10 * fps) == 0:
                reg.gravar_pendentes()  # Excel fechou? grava sem esperar o próximo volume
        cam.fechar()
        if arquivo:
            if n == 0:
                parar('Não li nenhum quadro do arquivo: ' + cam.erro())
            det.fim(momento)
            reg.log(f'fim do arquivo: {n / fps:.0f} s processados')
            aviso = dav and aviso_de_salto(dav[1], n / fps)
            if aviso:
                reg.log(aviso)
            if not diagnostico:
                print(f'Resultado em {reg.pasta / reg.nome_fixo}')
            return
        # Câmera caiu, não respondeu ou ficou para trás: espera e tenta de novo,
        # cada vez esperando mais (até 1 min). O que estava na esteira é perdido.
        reg.log(f'{motivo or "sem imagem da câmera"} — nova tentativa em {espera} s. {cam.erro()}')
        det.reiniciar(apos_queda=True)
        time.sleep(espera)
        espera = min(espera * 2, 60)


def main():
    ap = argparse.ArgumentParser(description='Conta volumes na envolvedora pela câmera.')
    ap.add_argument('--arquivo', help='processa um vídeo exportado em vez da câmera ao vivo')
    ap.add_argument('--inicio', help='hora da câmera no início do vídeo (HH:MM:SS), para --arquivo')
    ap.add_argument('--foto', action='store_true', help='salva foto_camera.jpg com o retângulo')
    ap.add_argument('--momento', type=float, default=0, help='segundo do vídeo para a --foto')
    ap.add_argument('--diagnostico', action='store_true', help='mostra o %% de papelão a cada segundo')
    args = ap.parse_args()

    if not FFMPEG:
        parar('ffmpeg não encontrado. Instale (LEIA-ME.md, passo 1) e abra um Prompt novo, '
              'ou copie o ffmpeg.exe para esta pasta.')
    cfg = ler_config()
    if not args.arquivo and any(p in cfg['camera'] for p in ('USUARIO:SENHA', 'IP_DO_GRAVADOR')):
        parar('A câmera ainda não está no config.json: troque USUARIO, SENHA e IP_DO_GRAVADOR '
              '(LEIA-ME, passo 3).\nPara testar com um vídeo, no Prompt de Comando:\n'
              '  python leitor_camera.py --arquivo video.dav   (exportado do gravador)\n'
              '  python leitor_camera.py --arquivo video.mp4 --inicio HH:MM:SS')
    if args.arquivo and not Path(args.arquivo).exists():
        parar(f'Arquivo não encontrado: {args.arquivo}')
    if args.foto:
        return tirar_foto(cfg, args.arquivo, args.momento)

    inicio = datetime.combine(datetime.now().date(), datetime.min.time())
    dav = ler_dav(args.arquivo) if args.arquivo else None
    if args.inicio:
        try:
            h = datetime.strptime(args.inicio, '%H:%M:%S').time()
        except ValueError:
            parar('--inicio tem que ser HH:MM:SS, a hora que aparece na imagem da câmera.')
        inicio = datetime.combine(datetime.now().date(), h)
    elif args.arquivo:
        sem_hora = ('as horas contam a partir de 00:00:00.\nPara a hora real, use --inicio '
                    'HH:MM:SS com a hora que aparece na imagem no 1º segundo.')
        if dav and dav[0]:
            inicio = dav[0]
            print(f'Início lido do .dav: {inicio:%d/%m/%Y %H:%M:%S} '
                  '(a hora escrita na imagem pode estar até 1 s atrás).')
        elif dav:
            print('O .dav traz uma hora impossível (relógio do gravador zerado?): ' + sem_hora)
        else:
            print('Este vídeo não traz a hora (só o .dav do gravador traz): ' + sem_hora)
    desligar_selecao_do_console()
    try:
        rodar(cfg, args.arquivo, inicio, args.diagnostico, dav)
    except KeyboardInterrupt:
        print('\nLeitor parado.')
    except Exception:
        # Erro não previsto: fica no log (a janela pode nem estar aberta), e o
        # iniciar.bat reinicia o leitor em 10 s.
        import traceback
        try:
            with open(PASTA / cfg.get('pasta_dados', 'dados') / 'leitor.log', 'a', encoding='utf-8') as f:
                f.write(f'{datetime.now():%Y-%m-%d %H:%M:%S}  ERRO INESPERADO, o leitor fechou:\n'
                        + sem_senha(traceback.format_exc()))
        except OSError:
            pass
        raise


if __name__ == '__main__':
    main()

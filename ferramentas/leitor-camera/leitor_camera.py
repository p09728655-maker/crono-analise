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
  python leitor_camera.py --arquivo v.mp4 --inicio 10:01:06   processa vídeo exportado
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
from datetime import datetime, timedelta
from pathlib import Path

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


def sem_senha(texto):
    """O ffmpeg repete o endereço inteiro da câmera nos erros, com usuário e
    senha. Nada que vai para tela ou log pode levar isso."""
    # Também sem o "rtsp://" na frente: um corte no meio do endereço não pode
    # deixar "usuario:senha@" passar.
    return re.sub(r'(\w+://)?[^\s/@:]*:?[^\s/@]*@(?=[\w.-]+[:/])',
                  lambda m: (m.group(1) or '') + '***@', texto)


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
    except json.JSONDecodeError as e:
        parar(f'O config.json tem um erro de digitação na linha {e.lineno} '
              '(aspas, vírgula ou chave faltando). Compare com o config.exemplo.json.')
    faltam = [c for c in CAMPOS if c not in cfg]
    if faltam:
        parar('Faltam no config.json: ' + ', '.join(faltam) + '. Compare com o config.exemplo.json.')
    r = cfg['retangulo']
    for k in ('x', 'y', 'largura', 'altura'):
        if not isinstance(r.get(k), (int, float)) or not 0 <= r[k] <= 1:
            parar(f'retangulo.{k} tem que ser uma fração da imagem, entre 0 e 1 (ex.: 0.25).')
    if r['x'] + r['largura'] > 1 or r['y'] + r['altura'] > 1:
        parar('O retângulo passa da borda da imagem: confira x+largura e y+altura.')
    if not cfg['limiar_sai'] < cfg['limiar_entra']:
        parar('limiar_sai tem que ser menor que limiar_entra.')
    return cfg


def entrada_ffmpeg(cfg, arquivo):
    if arquivo:
        return ['-i', str(arquivo)]
    # TCP em vez de UDP: na rede da fábrica perde menos pacote, e pacote
    # perdido vira borrão na imagem — que pode parecer papelão.
    return ['-rtsp_transport', 'tcp', '-timeout', str(15_000_000), '-i', cfg['camera']]


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


class Registro:
    """CSV do dia (separador ';' e vírgula decimal: abre direto no Excel em português)."""

    CABECALHO = 'data;entrou;saiu;segundos_no_filme;segundos_desde_anterior;observacao\n'

    def __init__(self, cfg, nome_fixo=None):
        self.pasta = PASTA / cfg.get('pasta_dados', 'dados')
        self.pasta.mkdir(exist_ok=True)
        self.nome_fixo = nome_fixo
        # Linhas que ainda não deu para gravar: o Excel tranca o CSV aberto.
        self.pendentes = []
        self.travado = False

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
        linha = ';'.join([f'{saiu:%d/%m/%Y}', '' if entrou is None else f'{entrou:%H:%M:%S}',
                          f'{saiu:%H:%M:%S}', num(no_filme), num(desde_anterior), obs]) + '\n'
        self.pendentes.append((arq, linha))
        self.gravar_pendentes()
        print(f'  volume  saiu {saiu:%H:%M:%S}'
              + ('' if desde_anterior is None else f'   ciclo {num(desde_anterior)} s')
              + (f'   ({obs})' if obs else ''), flush=True)

    def gravar_pendentes(self):
        """Grava o que estiver guardado, na ordem. Se o CSV estiver trancado
        (aberto no Excel), mantém guardado e tenta de novo depois — sem perder
        volume e sem derrubar o leitor."""
        while self.pendentes:
            arq, linha = self.pendentes[0]
            try:
                novo = not arq.exists()
                with open(arq, 'a', encoding='utf-8-sig' if novo else 'utf-8', newline='') as f:
                    if novo:
                        f.write(self.CABECALHO)
                    f.write(linha)
            except OSError as e:
                if not self.travado:
                    self.travado = True
                    self.log(f'não consegui gravar {arq.name} ({e.strerror}) — aberto no Excel? '
                             'Os volumes ficam guardados e são gravados quando ele fechar.')
                return
            self.pendentes.pop(0)
        if self.travado:
            self.travado = False
            self.log('planilha liberada: os volumes guardados foram gravados.')

    def fechar(self):
        """Saindo com volumes ainda guardados: grava num arquivo à parte."""
        self.gravar_pendentes()
        if not self.pendentes:
            return
        reserva = self.pasta / f'volumes_nao_gravados_{datetime.now():%Y-%m-%d_%H%M%S}.csv'
        try:
            with open(reserva, 'w', encoding='utf-8-sig', newline='') as f:
                f.write(self.CABECALHO)
                f.writelines(linha for _, linha in self.pendentes)
            self.log(f'{len(self.pendentes)} volume(s) não entraram na planilha do dia: '
                     f'estão em {reserva.name}. Copie as linhas para a planilha.')
        except OSError as e:
            self.log(f'{len(self.pendentes)} volume(s) perdidos: não consegui gravar ({e.strerror}).')


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
        self.ultima_saida = None
        self.reiniciar(apos_queda=False)

    def reiniciar(self, apos_queda):
        """Depois de uma queda, o que estava na esteira é desconhecido: recomeça do zero."""
        self.janela.clear()
        self.dentro, self.entrou, self.parcial = False, None, False
        self.primeira_leitura = True
        if apos_queda:
            self.ultima_saida = None  # o intervalo atravessaria a queda: não é ciclo

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
        desde = None if self.ultima_saida is None else (saiu - self.ultima_saida).total_seconds()
        if self.ultima_saida is not None and saiu.date() != self.ultima_saida.date():
            # Com o leitor ligado direto, o 1º volume do dia carregaria a noite
            # (ou o fim de semana) inteira como se fosse ciclo.
            desde, obs = None, obs or '1º volume do dia'
        self.reg.volume(entrou, saiu, desde, obs)
        self.ultima_saida = saiu

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


def rodar(cfg, arquivo, inicio, diagnostico):
    reg = Registro(cfg, nome_fixo=f'volumes_{Path(arquivo).stem}.csv' if arquivo else None)
    if arquivo and not diagnostico:
        saida = reg.pasta / reg.nome_fixo
        if saida.exists():
            saida.unlink()  # reprocessar o mesmo vídeo substitui, não soma
    try:
        _rodar(cfg, arquivo, inicio, diagnostico, reg)
    finally:
        reg.fechar()  # nenhum volume guardado fica para trás, saia como sair


def _rodar(cfg, arquivo, inicio, diagnostico, reg):
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
              '  python leitor_camera.py --arquivo video.mp4 --inicio HH:MM:SS')
    if args.arquivo and not Path(args.arquivo).exists():
        parar(f'Arquivo não encontrado: {args.arquivo}')
    if args.foto:
        return tirar_foto(cfg, args.arquivo, args.momento)

    inicio = datetime.combine(datetime.now().date(), datetime.min.time())
    if args.inicio:
        try:
            h = datetime.strptime(args.inicio, '%H:%M:%S').time()
        except ValueError:
            parar('--inicio tem que ser HH:MM:SS, a hora que aparece na imagem da câmera.')
        inicio = datetime.combine(datetime.now().date(), h)
    desligar_selecao_do_console()
    try:
        rodar(cfg, args.arquivo, inicio, args.diagnostico)
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

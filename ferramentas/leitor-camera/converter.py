"""
Converte o .dav exportado do gravador (SIM Play) em MP4 que o app abre.

O navegador não lê .dav (formato da Intelbras/Dahua), e muitos PCs não tocam o
H.265 que vem dentro dele. Aqui o vídeo vira H.264 em MP4, sem som e com 960
de largura: basta para marcar os volumes e fica perto de 600 MB por hora.

A data do MP4 é acertada para o FIM da gravação. O "Cronometrar por vídeo"
sugere o início da filmagem como "data do arquivo − duração"; com a data da
conversão, a medição entraria na hora errada, e até na semana errada (outro
takt).

Uso: arraste um ou mais .dav em cima do converter.bat, ou
  python converter.py video.dav [outro.dav ...]
Precisa só de Python e ffmpeg (LEIA-ME, passo 1); o numpy não é usado aqui.
"""
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from collections import deque
from datetime import datetime, timedelta, timezone
from pathlib import Path

PASTA = Path(__file__).resolve().parent

# Igual ao leitor: o ffmpeg.exe copiado para esta pasta vem primeiro.
FFMPEG = next((str(p) for p in (PASTA / 'ffmpeg.exe', PASTA / 'ffmpeg') if p.is_file()),
              None) or shutil.which('ffmpeg')

CODIFICAR = ['-an', '-vf', 'scale=960:-2', '-c:v', 'libx264', '-preset', 'veryfast',
             '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']


def cabecalho(arquivo):
    """O que o ffmpeg diz do arquivo: formato, início e duração."""
    r = subprocess.run([FFMPEG, '-nostdin', '-hide_banner', '-i', str(arquivo)],
                       stdin=subprocess.DEVNULL, capture_output=True,
                       text=True, encoding='utf-8', errors='replace')
    return r.stderr


def duracao_s(texto):
    m = re.search(r'Duration: (\d+):(\d\d):(\d\d(?:\.\d+)?)', texto)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else None


def inicio_gravado(texto):
    """Hora do 1º quadro gravada no .dav. Mesma regra de
    leitor_camera.inicio_gravado: relógio do gravador, sem fuso, que o ffmpeg
    devolve como se fosse UTC. None se a hora for impossível (relógio zerado)."""
    m = re.search(r'start: (\d+(?:\.\d+)?)', texto)
    if not m:
        return None
    t = datetime.fromtimestamp(float(m[1]), timezone.utc).replace(tzinfo=None)
    return t if datetime(2015, 1, 1) <= t <= datetime.now() + timedelta(days=1) else None


def aviso_de_salto(duracao_dav, video_s):
    """Mesma regra de leitor_camera.aviso_de_salto. Gravação interrompida no
    meio do .dav, dois trechos juntados ou relógio acertado: o ffmpeg emenda
    as pontas (salto para frente de mais de 10 s, qualquer volta para trás) e
    o MP4 fica mais curto que o relógio. No app, o que vem depois do salto
    ganha hora errada, e a medição que o atravessa perde o buraco: 1 h com
    20 min sem gravação seria medida como 40 min. Sem salto a diferença fica
    abaixo de 1 s; 3 s de folga."""
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
    return (f'ATENÇÃO: salto no relógio do .dav ({oque}). No app, o que vem depois do '
            'salto fica com a hora errada'
            + (', e a medição que atravessa o buraco sai mais curta do que foi' if mais_curto else '')
            + '. Meça só até o salto (a hora escrita na imagem pula) ou exporte outro '
            'trecho sem interrupção.')


def desligar_selecao_do_console():
    """Um clique na janela do Prompt pausa o programa até alguém apertar uma
    tecla — e a conversão pararia junto, sem aviso. Desliga esse modo."""
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
        pass


def andamento(feito_s, total_s, decorrido):
    if not total_s:
        return f'  {feito_s / 60:.0f} min de vídeo convertidos'
    fracao = min(feito_s / total_s, 0.99)  # 100% só quando terminar de verdade
    texto = f'  {fracao:4.0%}'
    if fracao > 0.02 and decorrido > 5:
        falta = decorrido * (1 - fracao) / fracao
        texto += f'  faltam ~{max(1, round(falta / 60))} min'
    return texto


def converter(origem):
    dav = Path(origem)
    print(f'\n{dav.name}')
    if not dav.is_file():
        print('  Não achei este arquivo.')
        return False
    texto = cabecalho(dav)
    if 'Input #0, dhav,' not in texto:
        print('  Não é .dav do gravador: pulei (este conversor é só para .dav).')
        return False
    mp4 = dav.with_suffix('.mp4')
    if mp4.exists():
        # Não sobrescreve: a marcação em andamento no app é guardada pelo
        # nome, tamanho e data do MP4, e um MP4 novo a perderia.
        print(f'  {mp4.name} já existe: pulei. Apague-o se quiser converter de novo.')
        return True
    inicio = inicio_gravado(texto)
    total = duracao_s(texto)
    # Escreve com outro nome e só troca no fim: conversão interrompida não
    # deixa um MP4 pela metade com cara de pronto.
    parcial = mp4.with_name(mp4.stem + '.convertendo.mp4')
    proc = subprocess.Popen(
        [FFMPEG, '-nostdin', '-v', 'error', '-y', '-i', str(dav), *CODIFICAR,
         '-progress', 'pipe:1', '-nostats', str(parcial)],
        stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, encoding='utf-8', errors='replace')
    avisos = deque(maxlen=5)
    # Esvazia os avisos o tempo todo: vídeo com quadro estragado gera aviso sem
    # parar, e com o canal cheio o ffmpeg trava esperando.
    threading.Thread(target=lambda: avisos.extend(l.strip() for l in proc.stderr),
                     daemon=True).start()
    comeco, mostrado = time.monotonic(), ''
    try:
        for linha in proc.stdout:
            if not linha.startswith('out_time_us='):
                continue
            try:
                feito = int(linha.split('=', 1)[1]) / 1e6
            except ValueError:
                continue  # "N/A" no começo
            texto_andamento = andamento(feito, total, time.monotonic() - comeco)
            if texto_andamento != mostrado:
                mostrado = texto_andamento
                print('\r' + texto_andamento.ljust(40), end='', flush=True)
        codigo = proc.wait()
    except KeyboardInterrupt:
        proc.kill()
        proc.wait()
        parcial.unlink(missing_ok=True)
        print('\n  Conversão interrompida; nada foi gravado.')
        raise
    print('\r' + ' ' * 40 + '\r', end='')
    if codigo != 0 or not parcial.is_file() or parcial.stat().st_size == 0:
        parcial.unlink(missing_ok=True)
        print('  A conversão falhou: ' + (' | '.join(avisos)[-300:] or f'código {codigo}'))
        return False
    duracao_mp4 = duracao_s(cabecalho(parcial))
    if inicio and duracao_mp4:
        # +0,5 s: o campo do app corta os milésimos, e a duração lida pelo
        # navegador difere da do ffmpeg em milésimos. Sem a folga, o início
        # saía 10:29:52,999 e o campo mostrava 10:29:52 — 1 s antes.
        # A data vai no arquivo parcial, ANTES do nome final: interrompido
        # entre os dois, sobraria um MP4 "pronto" com a data da conversão.
        fim = inicio + timedelta(seconds=duracao_mp4 + 0.5)
        os.utime(parcial, (time.time(), fim.timestamp()))
    os.replace(parcial, mp4)  # renomear mantém a data
    print(f'  Pronto: {mp4.name} ({mp4.stat().st_size / 1e6:.0f} MB).')
    salto = duracao_mp4 is not None and aviso_de_salto(total, duracao_mp4)
    if salto:
        print('  ' + salto)
    if inicio and duracao_mp4:
        print(f'  No app, o início sugerido será {inicio:%d/%m/%Y %H:%M:%S}: confira com a '
              'hora escrita na imagem no começo do vídeo (pode estar até 1 s atrás).')
    else:
        print('  ATENÇÃO: este .dav não trouxe hora válida (relógio do gravador?). No app, '
              'troque o início da filmagem pela hora escrita na imagem no começo do vídeo.')
    if avisos:
        print('  O ffmpeg avisou (quadro estragado costuma ser só isso): ' + ' | '.join(avisos)[-200:])
    return True


def main():
    if not FFMPEG:
        print('ffmpeg não encontrado. Instale (LEIA-ME, passo 1) ou copie o ffmpeg.exe '
              'para esta pasta.')
        return 2
    arquivos = sys.argv[1:]
    if not arquivos:
        print('Arraste um ou mais arquivos .dav em cima do converter.bat.')
        return 2
    desligar_selecao_do_console()
    try:
        resultados = [converter(a) for a in arquivos]
    except KeyboardInterrupt:
        return 1
    return 0 if all(resultados) else 1


if __name__ == '__main__':
    sys.exit(main())

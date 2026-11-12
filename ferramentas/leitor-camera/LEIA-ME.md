# Leitor de câmera da envolvedora

Lê a câmera Intelbras da envolvedora e grava **uma planilha por dia com a hora
de cada volume**. Roda num PC da fábrica. Não usa internet nem IA e **não
guarda imagem nenhuma**, só as horas.

Como funciona: um retângulo fixo na imagem, em cima do tapete verde embaixo do
filme. Quando a caixa passa, o retângulo enche de cor de papelão; quando sai,
esvazia. Cada enche-esvazia é um volume.

> Isto mede **vazão** (volumes por hora, intervalo entre volumes, tempo
> parado). Não é tempo padrão: não tem fator de ritmo nem tolerância.

---

## 1. Instalar (uma vez)

1. **Python** — python.org → Downloads. Na instalação, marque
   **"Add python.exe to PATH"**.
2. **ffmpeg** — no Prompt de Comando:
   ```
   winget install Gyan.FFmpeg
   ```
   Se o `winget` não existir ou for bloqueado pela TI: baixe
   `ffmpeg-release-essentials.zip` em gyan.dev/ffmpeg/builds, abra o zip, entre
   na pasta `bin` e **copie o `ffmpeg.exe` para dentro desta pasta**
   (`C:\leitor-camera`). O leitor procura ali primeiro; não precisa mexer em
   mais nada do Windows.
3. Feche o Prompt, abra **outro** e rode (o `pip` sozinho pode não existir;
   `python -m pip` funciona sempre):
   ```
   python -m pip install numpy
   ```
   "Requirement already satisfied" quer dizer que já estava instalado.
4. Copie esta pasta para o PC (ex.: `C:\leitor-camera`) e, dentro dela,
   copie `config.exemplo.json` para `config.json`.

Todos os comandos abaixo são rodados **dentro da pasta** (`cd C:\leitor-camera`).

> **Não abra o `iniciar.bat` agora.** Ele é o modo "rodar sempre na câmera"
> (passo 4) e só funciona depois que a câmera estiver no `config.json` e a
> validação tiver passado.

## 2. Validar com vídeo exportado — antes de ligar na câmera

1. Exporte **30 a 60 minutos** seguidos da câmera da envolvedora (canal 5),
   pelo SIM Play (reprodução da câmera Embalagem → baixar o período) ou no
   próprio gravador, num horário de produção normal (sem almoço no meio).
   **Prefira o `.dav`**: o leitor abre direto e ele traz a hora gravada
   (passo 4). Se não abrir, exporte em MP4/AVI.
2. Confira o retângulo num momento em que tem caixa embaixo do filme:
   ```
   python leitor_camera.py --arquivo video.mp4 --foto --momento 30
   ```
   Abra `foto_camera.jpg`. O retângulo vermelho tem que cobrir a caixa no
   tapete verde. Cada linha branca da grade é 10% da imagem; as amarelas são o
   meio (50%). Ajuste no `config.json`: `x` e `y` = canto de cima à esquerda,
   `largura` e `altura` = tamanho, tudo em fração (0,30 = 30%, escrito `0.30`).
3. Veja o sinal:
   ```
   python leitor_camera.py --arquivo video.mp4 --diagnostico
   ```
   Sem caixa o % fica baixo; com caixa, alto. `limiar_entra` e `limiar_sai`
   (no `config.json`) têm que ficar **entre** os dois, com `limiar_sai` menor.
4. Rode a contagem.
   - **`.dav` do gravador:** não precisa de hora. O leitor lê a data e a hora
     gravadas no arquivo e mostra na tela (`Início lido do .dav: ...`).
     Confira com a hora escrita na imagem no começo do vídeo: pode estar até
     1 s atrás, não mais.
     ```
     python leitor_camera.py --arquivo video.dav
     ```
   - **MP4/AVI:** não trazem hora. `--inicio` é a hora que aparece na imagem
     no 1º segundo:
     ```
     python leitor_camera.py --arquivo video.mp4 --inicio 10:01:06
     ```

   **Nunca use a hora do nome do arquivo** que o SIM Play dá: o gravador
   entrega a partir de um quadro antes do pedido (no teste, o nome dizia
   10:29:56 e o vídeo começava em 10:29:53).

   O resultado fica em `dados\videos\video.csv` (pasta separada: nunca se
   mistura com as planilhas do dia).
5. Um analista marca **o mesmo vídeo** à mão no app (Cronometrar por vídeo).
   **O app não abre `.dav`**: converta antes com o `converter.bat`
   ([seção 7](#7-marcar-no-app-um-vídeo-do-gravador)). O MP4 começa no mesmo
   quadro do `.dav`: o segundo *t* do vídeo no app é o início lido pelo
   leitor + *t*. Marque no MP4, rode o leitor no `.dav`.
   A tela diz "Enter a cada volume que fecha"; para esta validação — e para
   todos os analistas, sempre — **"fecha" = a frente da caixa toca o tapete
   verde**. É o instante que o leitor grava na coluna `entrou`, e o intervalo
   da planilha é de entrada a entrada: a validação confere a mesma marca que
   vira o número.
6. Compare **volume a volume**, não pela média. A média do intervalo só
   depende do primeiro e do último volume: um volume perdido e um falso se
   anulam e ela continua igual. Mande o CSV do leitor e a lista "volume a
   volume" da medição manual para fazer o pareamento:
   - **entram** todas as marcas manuais, inclusive a 1ª (a largada também é
     uma caixa tocando o tapete);
   - **ficam de fora** as linhas do leitor com `entrou` vazio e as que caem
     antes da largada ou depois do Encerrar (com 3 s de folga);
   - desconta-se a diferença fixa entre as duas marcações (a mediana de
     `entrou` − marca manual): o leitor marca quando a caixa já cobriu parte
     do retângulo, um pouco depois do toque;
   - cada marca procura a do outro lado mais próxima, **a até 3 s**.

   **Passa se:**
   - pelo menos **98%** das marcas manuais acham par (volume perdido);
   - **nenhuma** linha do leitor dentro da janela fica sem par (volume falso);
   - **95%** dos pares diferem em **até 1 s** (o leitor grava décimos de
     segundo; a folga de 3 s do pareamento é só para achar o par, não para
     aprovar).

   Não compare com o "por volume no período" nem com o tempo "rodando" do app:
   eles descontam setup planejado e paradas marcadas, e o leitor não desconta
   nada.

## 3. Ligar na câmera

1. Peça à TI: o **IP do gravador**, um **usuário só de visualização** (nunca o
   admin) e o **RTSP ligado** no gravador. **Senha só com letras e números**:
   `@`, `#`, `:`, `/`, espaço e outros símbolos quebram o endereço.
2. No `config.json`, em `camera`, troque USUARIO, SENHA e IP. O endereço do
   exemplo é o padrão Intelbras; confirme com a TI para o modelo de vocês.
3. Confira o retângulo **na imagem real** (o enquadramento do gravador é
   diferente do vídeo de celular — refaça o passo 2.2 sem `--arquivo`):
   ```
   python leitor_camera.py --foto
   ```
4. Rode:
   ```
   python leitor_camera.py
   ```
   Cada volume aparece na tela. Para parar: Ctrl+C.

## 4. Deixar rodando sempre

- No PC: Configurações → Energia → suspensão **Nunca**.
- Win+R → digite `shell:startup` → crie ali um **atalho para `iniciar.bat`**.
  O leitor sobe com o Windows e, se fechar por qualquer motivo, reinicia
  sozinho. Se a câmera cair, ele tenta de novo sozinho (até 1 em 1 minuto).

## 5. O que sai

`dados\volumes_AAAA-MM-DD.csv` — abre direto no Excel (e no Power BI):

| coluna | o que é |
|---|---|
| `entrou` | caixa começou a entrar no retângulo (hora com décimo de segundo) |
| `saiu` | caixa saiu do retângulo |
| `segundos_no_filme` | de `entrou` a `saiu` — tempo de máquina, deve ser quase constante |
| `segundos_desde_anterior` | intervalo entre este volume e o anterior (**entrada a entrada**) |
| `observacao` | por que algum campo ficou vazio |

- **Intervalo vazio não é erro**: é o 1º volume depois de **mais de 2 h sem
  volume** (noite, fim de semana, turno parado), o 1º depois de uma queda da
  câmera, ou o que já estava no filme quando a leitura começou. Esses buracos
  **não** viram ciclo. As 2 h podem ser mudadas com `"pausa_maxima_min"` no
  `config.json`. Turno que atravessa a meia-noite continua com o ciclo certo.
- **O intervalo inclui as paradas** (almoço, falta de caixa, setup): a
  **média** dessa coluna não é o ciclo. Para o ciclo típico use a **mediana**;
  intervalo muito acima dela é parada.
- **Abrir a planilha no Excel trava o arquivo.** O leitor não perde nada: os
  volumes esperam em `dados\volumes_esperando_planilha.txt` (gravado em disco
  na hora) e entram na planilha quando o Excel fechar. Se o leitor for fechado,
  faltar luz ou o Windows reiniciar nesse meio-tempo, eles entram na próxima
  vez que o leitor abrir. O log avisa as duas coisas. Melhor ainda: **copie o
  arquivo e abra a cópia**, ou leia pelo Power BI.
- **Não salve a planilha do leitor pelo Excel.** O Excel grava em outro formato
  e as linhas seguintes do leitor ficam com acentos trocados. Para mexer nos
  dados, use "Salvar como" com outro nome.
- **Um leitor por vez.** Se o `iniciar.bat` estiver rodando e alguém abrir
  outro, o segundo avisa e fecha — dois juntos contariam cada volume duas
  vezes. O `--diagnostico` pode rodar junto, para conferir a câmera.
- `dados\leitor.log` registra quedas de câmera, papelão descartado (passou
  menos de 2 s no retângulo: pessoa ou reflexo) e erro inesperado. A senha da
  câmera nunca aparece nele.
- Não clique dentro da janela preta para selecionar texto: o leitor desliga
  esse modo, mas se a janela "congelar", aperte Esc.

## 6. Conferir toda semana

- `python leitor_camera.py --foto` — alguém mexeu na câmera?
- **Total de volumes da semana × ERP.** Diferença acima de 2%: investigar
  antes de usar o número.

## 7. Marcar no app um vídeo do gravador

O "Cronometrar por vídeo" do app não abre `.dav`: o navegador não lê esse
formato, e muitos PCs não tocam o H.265 que vem dentro dele. O `converter.bat`
transforma o `.dav` em MP4 que o app abre.

1. No PC precisa ter **Python** e **ffmpeg** (passo 1; o `numpy` não é
   necessário para converter). Copie para ele, no mínimo, `converter.bat` e
   `converter.py` (e o `ffmpeg.exe`, se o ffmpeg foi copiado em vez de
   instalado).
2. Exporte o período pelo SIM Play (passo 2.1).
3. **Arraste o `.dav` (um ou vários) em cima do `converter.bat`.** O `.mp4` sai
   na mesma pasta do `.dav`, com o mesmo nome. A janela mostra a porcentagem e
   quanto falta; o tempo depende do PC, e 1 hora de vídeo pode levar vários
   minutos. O MP4 sai sem som e com 960 de largura (uns 600 MB por hora).
4. No app, abra o `.mp4`. O **início da filmagem** já vem preenchido com a hora
   gravada no `.dav`: o conversor acerta a data do arquivo para isso. Confira
   com a hora escrita na imagem no começo do vídeo; a imagem pode estar até 1 s
   atrás. **Se o MP4 foi copiado por WhatsApp, e-mail ou download**, a data do
   arquivo se perde e a sugestão sai errada: corrija o campo pela imagem.

- MP4 que já existe não é convertido de novo (a marcação em andamento no app
  está presa àquele arquivo). Para refazer, apague o `.mp4`.
- Fechar a janela no meio não deixa MP4 pela metade com cara de pronto: o
  arquivo só ganha o nome final quando termina. Sobra um `.convertendo.mp4`,
  que pode ser apagado (a próxima conversão também o substitui).

## Limites — o que ele NÃO vê

- **Qual produto** passou: conta volume, não lê etiqueta.
- Caixa que **não passa pela envolvedora** (máquina parada, embalagem manual).
- Embalagem **sem papelão aparente** (caixa branca, plástico): só reconhece cor
  de papelão.
- **Luz muito diferente** (turno da noite, sol na janela) muda o %. Rode o
  `--diagnostico` também no turno da noite antes de confiar.

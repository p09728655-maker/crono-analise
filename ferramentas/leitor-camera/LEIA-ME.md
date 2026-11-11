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
3. Feche o Prompt, abra **outro** e rode:
   ```
   pip install numpy
   ```
4. Copie esta pasta para o PC (ex.: `C:\leitor-camera`) e, dentro dela,
   copie `config.exemplo.json` para `config.json`.

Todos os comandos abaixo são rodados **dentro da pasta** (`cd C:\leitor-camera`).

> **Não abra o `iniciar.bat` agora.** Ele é o modo "rodar sempre na câmera"
> (passo 4) e só funciona depois que a câmera estiver no `config.json` e a
> validação tiver passado.

## 2. Validar com vídeo exportado — antes de ligar na câmera

1. Exporte do gravador **30 a 60 minutos** da câmera da envolvedora (canal 5).
   Arquivo `.dav` normalmente abre direto; se não abrir, exporte em MP4/AVI.
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
4. Rode a contagem. `--inicio` é a hora que aparece na imagem no 1º segundo:
   ```
   python leitor_camera.py --arquivo video.mp4 --inicio 10:01:06
   ```
   O resultado fica em `dados\volumes_video.csv`.
5. Um analista marca **o mesmo vídeo** à mão no app (Cronometrar por vídeo),
   com a regra de sempre: **marcar quando a frente da caixa toca o tapete
   verde**, em todo volume. Essa marca corresponde à coluna `entrou`.
6. Compare **volume a volume**, não pela média. A média do intervalo só
   depende do primeiro e do último volume: um volume perdido e um falso se
   anulam e ela continua igual. Mande o CSV do leitor e a lista "volume a
   volume" da medição manual para fazer o pareamento:
   - desconta-se a diferença fixa entre as duas marcações (a mediana de
     `entrou` − marca manual), porque o leitor marca quando a caixa já cobriu
     parte do retângulo, um pouco depois do toque;
   - cada marca manual procura um volume do leitor a até 1 s, e vice-versa.

   **Passa se:** pelo menos 98% das marcas manuais têm par, **nenhum** volume
   do leitor fica sem par (volume falso) e 95% dos pares diferem em até 1 s.

   Não compare com o "por volume no período" nem com o tempo "rodando" do app:
   eles descontam setup planejado e paradas marcadas, e o leitor não desconta
   nada.

## 3. Ligar na câmera

1. Peça à TI: o **IP do gravador**, um **usuário só de visualização** (nunca o
   admin) e o **RTSP ligado** no gravador. Senha sem `@`, `#` ou `:` — esses
   símbolos quebram o endereço.
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
| `entrou` | caixa começou a entrar no retângulo |
| `saiu` | caixa saiu do retângulo |
| `segundos_no_filme` | de `entrou` a `saiu` — tempo de máquina, deve ser quase constante |
| `segundos_desde_anterior` | intervalo entre este volume e o anterior (saída a saída) |
| `observacao` | por que algum campo ficou vazio |

- **Intervalo vazio não é erro**: é o 1º volume do dia, o 1º depois de uma
  queda da câmera, ou o que já estava no filme quando a leitura começou. A
  noite e o buraco da queda **não** viram ciclo.
- **O intervalo inclui as paradas** (almoço, falta de caixa, setup): a
  **média** dessa coluna não é o ciclo. Para o ciclo típico use a **mediana**;
  intervalo muito acima dela é parada.
- **Abrir a planilha no Excel trava o arquivo.** O leitor não perde nada: guarda
  os volumes e grava quando o Excel fechar (o log avisa). Se o leitor for
  fechado com o Excel aberto, os volumes vão para
  `volumes_nao_gravados_....csv` — copie as linhas para a planilha do dia.
  Melhor: **copie o arquivo e abra a cópia**, ou leia pelo Power BI.
- `dados\leitor.log` registra quedas de câmera, papelão descartado (passou
  menos de 2 s no retângulo: pessoa ou reflexo) e erro inesperado. A senha da
  câmera nunca aparece nele.
- Não clique dentro da janela preta para selecionar texto: o leitor desliga
  esse modo, mas se a janela "congelar", aperte Esc.

## 6. Conferir toda semana

- `python leitor_camera.py --foto` — alguém mexeu na câmera?
- **Total de volumes da semana × ERP.** Diferença acima de 2%: investigar
  antes de usar o número.

## Limites — o que ele NÃO vê

- **Qual produto** passou: conta volume, não lê etiqueta.
- Caixa que **não passa pela envolvedora** (máquina parada, embalagem manual).
- Embalagem **sem papelão aparente** (caixa branca, plástico): só reconhece cor
  de papelão.
- **Luz muito diferente** (turno da noite, sol na janela) muda o %. Rode o
  `--diagnostico` também no turno da noite antes de confiar.

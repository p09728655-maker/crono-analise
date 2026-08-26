# RitmoPatrimar — Estudo de Tempos

Cronoanálise e estudo de tempos para chão de fábrica. **Patrimar Móveis.**

O logotipo vive embutido em base64 (`src/theme/logo.js`), em duas variantes —
uma para fundo claro, outra para fundo escuro, porque a palavra "móveis" é
quase preta e sumiria sobre o grafite do app. Embutido de propósito: o
relatório impresso nunca sai sem a marca por causa de uma requisição que
falhou justamente na hora de imprimir, e funciona offline. Custo: PNG
quantizado em 32 cores, ~6 KB cada.

Coleta de tempos no posto (furadeira, seccionadora, coladeira), cálculo de
tempo padrão, capacidade e estabilidade de processo, com backend próprio e
funcionamento offline.

---

## O que mudou nesta versão

| | Antes | Agora |
|---|---|---|
| Código | 1 HTML de 847 KB, minificado | Projeto Vite + React com `src/` modular |
| Bundle | 847 KB | **58 KB** gzipped |
| Dados | `localStorage` + pendrive | Postgres (Supabase), multiusuário |
| Chave da IA | `sk-ant-...` no navegador | Só no servidor |
| Sem rede | Perde a coleta | Fila local + sincronização automática |
| Testes | Nenhum | 43 de domínio + 14 de API + 17 de navegador |

---

## Duas experiências separadas

Coleta e análise são tarefas diferentes, em posturas diferentes. Misturar as
duas produz uma tela ruim para ambas.

| | `/coleta` | `/analise` |
|---|---|---|
| Onde | celular/tablet, no posto | PC, no escritório |
| Postura | em pé, às vezes de luva | sentado |
| Tarefa | cronometrar ciclo | ler, decidir, imprimir |
| Tema | escuro (luz irregular na fábrica) | claro (igual ao papel) |
| Tela | um botão gigante, sem distração | densidade, tabela e gráficos |

A raiz `/` manda para a experiência certa conforme o aparelho. As duas rotas
seguem acessíveis de qualquer lugar — bloquear criaria beco sem saída quando
o analista quiser conferir um número no chão de fábrica.

### Furadeiras — ritmo do posto (`/coleta/rapida`)

Medição de ritmo **sem cadastro e sem servidor**, do jeito que ela
acontece de verdade: o analista passa pela máquina às 7:00 e toca **Agora**;
volta às 7:10, toca **Agora** de novo, digita as peças que o contador marca
(150) — e a conta sai na hora: 900 pç/h, ciclo médio 4 s. Os horários também
podem ser digitados de cabeça, depois do fato, e a virada de meia-noite
conta como dia seguinte (turno da noite também confere ritmo).

Na mesma tela, o **cronômetro ao vivo** segue como alternativa para quem
fica no posto contando peça a peça (alvo gigante, vibração, guarda de
repique, tela acesa).

**Paradas e setup.** O período quase nunca é só máquina rodando: troca de
gabarito, falta de peça, manutenção. No formulário, `+ Setup / troca` e
`+ Outra parada` marcam quantos minutos do período a máquina ficou parada;
no cronômetro ao vivo, o botão **Parou** pergunta o motivo, cronometra a
parada e **Voltou** a encerra (contar peça fica bloqueado enquanto isso — o
relógio do período continua correndo, porque a parada está *dentro* dele).

Com parada marcada, o ritmo passa a sair do **tempo em que a máquina
rodou** — 100 peças em 30 min com 10 min de setup são 300 pç/h, não 200 —
e o número do período inteiro (200 pç/h) fica ao lado, porque os dois
respondem perguntas diferentes: o primeiro dimensiona capacidade, o segundo
explica o que saiu do posto no turno. Sem parada marcada os dois são o mesmo
número, e toda conferência antiga continua valendo. Setup sai separado das
demais paradas de propósito: é a única que o processo exige, e a ação dele é
SMED — não "atacar a causa da perda".

Os campos **Máquina** e **Peça** e o botão **Salvar** guardam a conferência
no aparelho (localStorage, até 50) **e** a enviam ao banco pelo mesmo
caminho da coleta: fila offline com `client_id` idempotente via `/api/sync`
— salvar nunca espera a rede, e reenviar não duplica. Conferências salvas
antes da sincronização existir sobem sozinhas na próxima abertura da tela
(backfill pela marca `enviada`).

No PC, o botão **Conferências** no topo da Análise abre o relatório
(`/analise/conferencias`): resumo por máquina — medições, ritmo médio
**ponderado pelo tempo** (Σ peças / Σ tempo rodando, não média de taxas),
tempo parado com o setup destacado, disponibilidade, melhor e pior registro
com a peça — mais a tabela completa, filtro por máquina e impressão em
**documento A4 próprio** (não a tela no papel).

O botão **Paradas** de cada linha abre o cadastro no PC: quem confere no
corredor raramente para para digitar o setup, e reconstituir depois — com o
apontamento na mão — é trabalho de escritório. A lista é gravada inteira
(o que está na tela vira o estado final), e a soma nunca pode alcançar o
período: sem tempo de máquina rodando não há ritmo, e a conferência sairia
dos cálculos sem dizer por quê — o botão trava e o servidor recusa.

A tela traz o mesmo tratamento do painel do estudo: **gráfico de ritmo por
máquina** (a barra de amostra insuficiente leva textura hachurada e rótulo,
não só cor) e **Análise com IA** — que recebe o resumo por máquina *com* o
resultado dos critérios, então diz o que ainda não serve de referência em
vez de tirar conclusão de capacidade de uma medição de um minuto.

Cada linha pode ser **arquivada** (sai dos cálculos, continua no banco — o
caso da medição atípica, turno interrompido) ou **excluída** com
confirmação (o caso do registro errado, hora digitada errada). É a mesma
distinção do estudo, pelo mesmo motivo. Setup no meio do período deixou de
ser motivo para arquivar: marca-se a parada e a medição continua contando.

O relatório **se autoavalia** pelos `CRITERIOS_CONFERENCIA`, declarados
antes dos números, na tela e impressos: mínimo de 3 conferências por
máquina, 30 min de tempo total observado, nenhum período menor que 5 min.
Os dois critérios de tempo olham o **tempo produtivo**: meia hora de relógio
com 27 min de setup deixa 3 min de ritmo medido, e é isso que a amostra
tem.
Fora do critério, a máquina aparece carimbada de "amostra insuficiente" —
o número continua visível, nunca passa por referência. Registro oficial,
com FR, tolerância e tempo padrão, continua sendo papel do estudo. Por não
depender de rede, o atalho na lista de coleta fica visível mesmo com a API
fora do ar.

As duas naturezas de coleta são nomeadas pelo **posto**, nunca pelo método:
no menu do PC, **Embalagem e demais postos** (estudos de tempo, ciclo a
ciclo) e **Furadeiras** (ritmo por máquina, peças/hora). A pergunta no chão
de fábrica é "vim medir a embalagem" ou "vim medir a furadeira" — nunca "vim
fazer uma conferência rápida". No código o termo `conferencia` continua: é o
nome da tabela, da rota e do endpoint, e renomear isso órfãozaria dado e
fila offline sem ganho nenhum para quem usa.

No tablet as duas naturezas de coleta convivem na mesma tela e são
rotuladas pelo posto, não pelo método: **Furadeiras — Ritmo da furadeira**
(peças/hora do período) no atalho do topo, e **Embalagem e demais postos —
Estudos de tempo** (ciclo a ciclo, com FR e tolerância) na lista abaixo. A
pergunta no chão de fábrica vem sempre nessa ordem — "vim medir a
furadeira" —, então é o posto que abre a linha.

### Primeira tela: hierarquia pelo fluxo

A tela inicial responde, nesta ordem: **onde estou** (identidade), **o que
fazer agora** (`+ Novo estudo`, a única coisa vermelha do menu e a única
ação em destaque), **quais estudos existem** (produtos com contagem,
arquivados), e **qual é o caminho** — os três pilares como sequência
numerada, ① Coleta → ② Análise → ③ Capacidade, e não como três botões
concorrentes.

Busca, Importar e Chave da IA vivem no bloco **Ferramentas**, no fim do
menu: existem, mas não disputam a atenção. "Ir para a Coleta" fica discreto
no rodapé — a coleta é a primeira etapa de um estudo, não uma quarta ação.

A navegação vive numa **lateral fixa**; a barra horizontal não crescia — a
partir de sete botões ela empurrava o título e quebrava a hierarquia. A
coleta (celular) não tem lateral: lá a tela é pequena e a tarefa é uma só.

### Meta de ciclos: quando parar

A tela de coleta mostra a meta como fração (`7 / 10`) e barra de progresso.
Ao **fechar a meta**, o aparelho vibra e aparece a faixa "Meta atingida" com
o botão **Encerrar** do lado — antes a fração era o único sinal, no meio de
outros três números, e o analista seguia cronometrando "mais um pouco" sem
precisar.

A faixa aponta o caminho de quem quer mais evidência: **outra rodada**, não
esticar a mesma. Rodadas separadas deixam a análise comparar as duas em vez
de misturar. Nada encerra sozinho: quem decide que a coleta acabou é quem
está no posto, e um encerramento automático no meio de um ciclo perderia o
ciclo.

### Arquivar e restaurar

O × da lista **arquiva** o estudo que já tem ciclos (dado de cronometragem
não se refaz) e **apaga** o que não tem nenhum. Arquivado sai da listagem
normal, mas o botão **Arquivados N** no topo — que só aparece quando existe
algum — abre a lista deles com a contagem de ciclos intacta e restaura com
um clique (`PATCH /api/estudos?id=…` com `status: 'coletando'`; a listagem
dos arquivados é `GET /api/estudos?arquivados=1`).

### Importar (PDF do ERP ou template .xlsx)

O botão **Importar** da Análise aceita dois formatos, ambos lidos no
navegador sem biblioteca (PDF via `lib/pdfTexto.js`; planilha via
`lib/xlsxTexto.js`, um leitor de .xlsx de ~150 linhas sobre
`DecompressionStream('deflate-raw')`):

- **PDF "Processos de Produção"** do ERP — um estudo por máquina, uma
  operação por peça, ciclos por peça vindos da estrutura.
- **Template de tempos** (.xlsx, abas Config/Tempos/Paradas — o molde da
  embalagem): as operações viram o estudo (FR, tolerância e meta vêm da
  planilha); tempo zero é molde e não vira dado; tempos preenchidos entram
  como ciclos pela mesma fila offline da coleta (client_id idempotente),
  junto com as paradas. Parada de operação desconhecida vira aviso, não
  some em silêncio.

### Aviso de atualização

Duas situações diferentes, duas mensagens:

**Saiu versão nova enquanto você está com o app aberto.** O build publica
`versao.json` (plugin em `vite.config.js`) e o app pergunta por ele ao abrir,
ao voltar para a aba e a cada 10 minutos. Se o que está no ar difere do que
está rodando, aparece "Nova versão disponível" com **Atualizar agora**. Sem
isso, o tablet do posto — que fica aberto o dia inteiro — seguiria na versão
que baixou de manhã, com erros já corrigidos. **Nunca recarrega sozinho**:
perder o que está sendo digitado é pior que esperar. Resposta ausente ou
inválida (sem rede, ou o rewrite devolvendo `index.html` em desenvolvimento)
significa silêncio, nunca alarme falso.

**Você acabou de carregar uma versão nova.** O deploy troca o app por baixo
do usuário — a tela só "amanhece diferente".
Ao abrir depois de uma atualização, uma faixa no topo da lista diz qual
versão chegou e o que ela traz; "Ver novidades" abre o histórico completo.
A última versão vista fica no `localStorage` por aparelho: o aviso aparece
uma vez e some ao ser visto ou dispensado. Primeira visita não ganha faixa —
usuário novo não tem passado para comparar.

### Paradas do estudo (`/analise/estudo/<id>?aba=paradas`)

Durante a coleta ciclo a ciclo, o botão **Parada** pergunta o motivo e
cronometra o tempo parado. Esse tempo é **descontado do ciclo** — parada não
pode inflar o TO e virar "operação lenta" — e fica registrado à parte, como
perda.

Registrar sem mostrar é trabalho jogado fora, então a aba **Paradas** do
painel lê isso como Pareto: tempo total, quanto representa do tempo com o
cronômetro na mão, os motivos da maior perda para a menor e **a ação que cada
um pede** (SMED no setup, kanban na falta de material, TPM na manutenção).
Motivo sem ação não vira melhoria, por isso a ação vem na mesma linha.

O denominador é o tempo observado (ciclos válidos + paradas), nunca o turno:
o estudo não observou o turno inteiro, e usar essa base daria um número que
parece OEE sem ser. A mesma informação vai para a folha impressa e para a
Análise com IA, que é instruída a tratar parada e lentidão como problemas
diferentes.

O motivo é gravado pelo **código** (`setup`), não pelo rótulo: revisar o
texto na tela não pode quebrar o agrupamento de relatório antigo — e o
rótulo antigo continua sendo reconhecido.

## Relatório impresso

O botão **Imprimir relatório** gera uma folha A4 retrato. Não é a tela levada
ao papel: é um documento próprio, com a informação na ordem que um relatório
técnico exige — identificação, base estatística, resultado, evidência
gráfica, fórmulas e assinaturas.

O relatório declara a própria confiabilidade. Se a amostra não fecha Nievel,
isso vai **impresso e antes dos números**, não escondido: o documento circula
em reunião, e número sem contexto vira decisão errada.

A seção **Paradas registradas na coleta** sai com motivo, ocorrências, tempo,
% do parado e ação recomendada. Quando não houve registro, o documento diz
isso com todas as letras — ausência de registro não é ausência de parada.

Os gráficos são SVG inline — imprimem com nitidez de vetor. A série de
tolerância leva textura hachurada, então continua distinguível em impressão
preto e branco e para quem tem daltonismo.

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha os valores
npm run dev               # front em http://localhost:5173
```

### Testes

```bash
npm test                  # domínio (puro, sem dependências)
npm run test:e2e          # navegador: coleta + análise + impressão
                          # exige `npm run dev` na porta 5199

# Integração da API (exige um Postgres com o schema aplicado)
TEST_DATABASE_URL=postgres://... npx vitest run test/api.integracao.test.js
```

---

## Banco (Supabase)

Projeto **`crono-analise`** (`meqjsdrgwnupvreghxgm`, região `sa-east-1`) já
provisionado, com o schema aplicado e a empresa criada.

Para recriar do zero em outro ambiente:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

```sql
INSERT INTO empresas (nome) VALUES ('Patrimar Móveis') RETURNING id;
```

### RLS: a porta anônima fica fechada

O schema `public` é exposto pelo PostgREST com a chave anônima, que vive no
navegador. Sem RLS, qualquer pessoa com essa chave leria e escreveria todos
os estudos.

Habilitamos RLS **sem policy nenhuma** — isso nega 100% do acesso anônimo. O
backend não passa pelo PostgREST: conecta direto no Postgres com o papel
`postgres`, que ignora RLS por definição.

Verificado, não presumido: `SET ROLE anon; SELECT * FROM estudos` retorna
`permission denied for table estudos`.

> **Use a Transaction Pooler (porta 6543)**, não a conexão direta (5432).
> Cada requisição serverless abre e fecha conexão; pela porta direta o limite
> do banco estoura no primeiro pico de uso.

---

## Deploy (Vercel)

Em **Settings → Environment Variables**:

| Variável | Onde vive | Observação |
|---|---|---|
| `DATABASE_URL` | servidor | Pooler do Supabase, porta 6543 |
| `API_TOKEN` | servidor | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `EMPRESA_ID` | servidor | UUID retornado no passo acima |
| `ANTHROPIC_API_KEY` | servidor | **Nunca** prefixar com `VITE_` |
| `VITE_API_TOKEN` | navegador | Vai para o bundle — ver aviso abaixo |

> ⚠️ **`VITE_API_TOKEN` fica visível no bundle.** Qualquer pessoa com acesso à
> URL consegue lê-lo e chamar a API. Isso é aceitável enquanto o app rodar
> restrito à rede da fábrica, e é o mesmo nível de exposição do modelo
> anterior — mas **não** é autenticação de verdade. Antes de expor o app na
> internet, trocar por login por usuário (a fronteira já está isolada em
> `api/_lib/auth.js`, então a troca não espalha pelo resto do código).

### Tempo da análise com IA

`vercel.json` dá 60 s às funções (`functions["api/**/*.js"].maxDuration`) e
`api/_lib/prazo.js` corta a chamada 8 s antes disso. O corte precisa ser
**nosso**: quando é a Vercel que corta, quem responde é ela — com uma página
de erro em texto, não em JSON —, e o app mostrava "O servidor demorou demais
para responder" sem dizer o que fazer. Cortando antes, a resposta é um 504
com a saída prática ("tente de novo; se repetir, analise um estudo com menos
operações"). Os dois números precisam concordar, e um teste falha se
divergirem.

A análise roda com `effort: 'low'` de propósito: é um diagnóstico sobre
algumas dezenas de números já calculados, não um problema de raciocínio
profundo. Com esforço médio o modelo pensava tempo demais e a função
estourava — uma boa análise que chega vale mais que uma ótima que morre no
timeout. `max_tokens` fica folgado (é teto, não alvo: baixá-lo não acelera
nada, só arrisca cortar no meio), e resposta que bate no teto sai com a
ressalva no fim.

---

## Arquitetura

```
src/
  domain/        fórmulas puras e testáveis (sem React, sem rede)
                 inclui roteiroErp.js: leitura do PDF "Processos de
                 Produção" do ERP → estudo com uma operação por peça
  lib/           fila offline (IndexedDB), cliente HTTP, hooks
                 inclui pdfTexto.js: extração de texto de PDF no
                 navegador, sem biblioteca (DecompressionStream)
  theme/         tokens de design (paleta Patrimar)
  features/
    coleta/      tela de cronometragem no posto (celular)
    analise/     painel, gráficos SVG e relatório A4 (PC)
    estudos/     lista e detalhe de estudo
api/
  _lib/          db, auth, validação, helpers HTTP
  estudos.js     CRUD de estudos
  operacoes.js   CRUD de operações
  sync.js        sincronização em lote da coleta  ← núcleo
  ai/analisar.js proxy da análise com Claude
db/schema.sql
```

### Por que a coleta grava local antes da rede

O ciclo cronometrado não pode ser perdido: a peça já foi produzida, não dá
para pedir que o analista cronometre de novo. Então o fluxo é sempre
**IndexedDB primeiro, rede depois**. Cada item leva um `clientId` (UUID)
gerado no aparelho, e o servidor usa `ON CONFLICT DO NOTHING` sobre ele —
reenviar o mesmo lote não duplica nada.

---

## Fórmulas

| Indicador | Fórmula |
|---|---|
| TO | média dos ciclos válidos (> 200 ms) |
| TN | TO × FR / 100 |
| TP | TN × (1 + tolerância / 100) |
| Capacidade/h | 3.600.000 ÷ TP(ms) |
| CV% | desvio padrão amostral ÷ média × 100 |
| Nievel | n = (1,96 × CV% / 5)² — 95 % de confiança, ±5 % de erro |
| Takt | tempo disponível ÷ quantidade |
| Nº operadores | Σ TP ÷ Takt |
| OEE | Disponibilidade × Desempenho × Qualidade |

### Por que não há carta de controle

A carta ±3σ existiu na tela até ago/2026 e saiu. Duas limitações, ambas
fixadas em teste em `test/dominio.test.js`:

1. **Com n ≤ 10 ela não consegue acusar nada.** O limite matemático é
   `max|x − média| / σ ≤ (n−1)/√n`, que para n = 10 dá 2,85 — menor que 3 por
   construção. Como a meta usual de coleta é ~10 ciclos, ela exibia "estável"
   por construção, não por resultado.
2. **Um outlier grosseiro isolado mascara a si mesmo**, porque infla o próprio
   σ. Uma série de ~1000 ms com um ciclo de 5000 ms eleva o LSC de 1018 ms
   para 5444 ms, e o ponto absurdo passa a caber dentro dos limites.

Somado a isso, ela pedia leitura de CEP para responder o que o analista já
tinha de outro jeito. As duas perguntas que ela ocupava continuam respondidas:

- *"este ciclo saiu do padrão?"* → **detecção robusta (mediana + MAD)** na tela
  de coleta, que não se deixa arrastar por pontos extremos e avisa **na hora**,
  enquanto ainda dá tempo de conferir o posto;
- *"este posto é estável?"* → **CV%** e a classificação de estabilidade, na
  tabela de operações e no relatório impresso.

`cartaDeControle` e `foraDeControle` continuam em `src/domain/estatistica.js`,
testadas: se um dia a evidência estatística for exigida — disputa de tempo
padrão, auditoria —, o caminho certo é trocar o estimador de σ por I-MR
(amplitude móvel ÷ d₂ = 1,128), que elimina o teto `(n−1)/√n` e detecta já com
8–10 pontos. A UI é que não volta sem essa correção.

---

## Ainda não portado do app antigo

- Balanceamento automático entre estações
- Painel de OEE (a fórmula existe em `src/domain/`, falta a tela)
- Exportação para Excel
- Cadastro de usuários e papéis

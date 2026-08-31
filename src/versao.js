/**
 * Historico de versoes — fonte unica.
 *
 * A VERSAO vem do package.json (uma unica fonte; o teste garante que a
 * entrada mais recente daqui bate com ela). O historico e' escrito para o
 * USUARIO: cada item diz o que mudou no trabalho dele, nao qual arquivo
 * foi mexido. E' o que aparece em "Historico de versoes" no app e a
 * versao carimbada no relatorio impresso.
 */
import { version } from '../package.json';

export const VERSAO = version;

export const HISTORICO = [
  {
    versao: '2.52.0',
    data: '2026-08-31',
    titulo: 'A análise pode sair na folha impressa',
    itens: [
      'Caixinha "SAIR NA IMPRESSÃO" no painel da Análise do período: marcada, a análise inteira (leitura geral, por máquina, tendência, entre máquinas e peças, paradas e próximo passo) entra na folha A4, logo depois do Ritmo por máquina — com a nota de que foi gerada automaticamente pelos números.',
      'Desmarcada (o padrão), o papel sai só com os números, como sempre. A escolha fica gravada no navegador: quem imprime com análise hoje não precisa marcar de novo amanhã.',
      'A análise impressa respeita o filtro por máquina, como o resto da folha.',
    ],
  },
  {
    versao: '2.51.0',
    data: '2026-08-31',
    titulo: 'A análise fica mais esperta a cada medição',
    itens: [
      'A Análise do período agora CRESCE com os dados — cada leitura destrava com um mínimo de medições: com 3+ por máquina, mostra ATÉ ONDE DÁ PARA CHEGAR (o melhor período contra a média — meta que o próprio posto já provou); com 4+, mostra a TENDÊNCIA (o ritmo está subindo ou caindo no tempo, comparando as medições mais antigas com as mais recentes); com 3+ da mesma peça, aponta a peça cujo ritmo não se repete.',
      'As paradas ganharam o número que muda conversa: quantas PEÇAS deixaram de sair no tempo parado, ao ritmo médio.',
      'A própria análise diz o que destrava a seguir ("a partir de 4 medições por máquina, mostra a tendência") — dá para ver o relatório ficando mais completo a cada medição registrada.',
      'O bloco MÁQUINAS da lateral (onde se filtra e se escolhe o que imprimir) agora aparece SEMPRE — antes ele sumia quando só uma máquina tinha medição, e o filtro ficava impossível de achar.',
    ],
  },
  {
    versao: '2.50.0',
    data: '2026-08-31',
    titulo: 'A análise sai do algoritmo — sem gastar a chave da IA',
    itens: [
      'A seção virou ANÁLISE DO PERÍODO e é gerada na hora pelos próprios números do relatório: leitura geral, uma linha por máquina (com o que falta para firmar, em palavras), comparação entre máquinas, peça mais rápida × mais lenta, paradas com o maior motivo e o próximo passo. Sem IA, sem custo, funciona sem internet — e sai igual para os mesmos números.',
      'A IA continua disponível, mas como OPÇÃO: um botão discreto no fim da análise, para quem quiser uma segunda leitura em texto corrido. Só esse clique usa a chave.',
      'A análise segue o filtro da lateral: filtrou uma máquina, a leitura é dela.',
    ],
  },
  {
    versao: '2.49.0',
    data: '2026-08-31',
    titulo: 'O relatório das Furadeiras fala português de fábrica',
    itens: [
      'O carimbo "AMOSTRA INSUFICIENTE" sumiu da frente dos números. Máquina medida há pouco tempo leva uma nota discreta em cinza — "ainda em medição" — na tela, no gráfico e no papel. O critério continua o mesmo por trás; só parou de gritar.',
      'Modelo básico, sem jargão: saíram CV%, ciclo do motor, disponibilidade em % e os critérios declarados. Ficou o que qualquer pessoa lê: quantas peças por hora, quanto tempo rodou, quanto ficou parado e por quê.',
      'PEÇAS POR MINUTO em tudo: nos números do topo, no cartão de cada máquina, no Ritmo por peça, na tabela de medições e na folha impressa — ao lado das peças por hora.',
      'O filtro por máquina agora vale para IMPRIMIR: escolha a máquina na lateral e o botão vira "Imprimir esta máquina" — a folha A4 sai só com ela, com o nome no título. "Todas" imprime o relatório completo, como antes.',
      'Os números do topo também seguem o filtro: filtrou a FURADEIRA 16, o ritmo médio, as medições e o tempo parado são os dela.',
    ],
  },
  {
    versao: '2.48.1',
    data: '2026-08-28',
    titulo: 'O relatório ocupa a tela inteira',
    itens: [
      'No PC de tela larga, o relatório das Furadeiras parava numa largura fixa e sobrava uma faixa vazia à direita. O conteúdo agora estica até a borda da janela: os cartões de indicadores, os cartões de máquina, a Referência por peça e o gráfico de ritmo ganham esse espaço.',
    ],
  },
  {
    versao: '2.48.0',
    data: '2026-08-28',
    titulo: 'O cadastro de máquinas ganha impressão própria',
    itens: [
      'Botão IMPRIMIR em Ferramentas > Máquinas: sai um documento A4 dedicado ao cadastro — cada grupo com seu código e suas máquinas, com a situação (ativa/desativada) e os totais. Para conferir com o ERP ou fixar no quadro.',
      'Grupo ainda sem máquina também sai no papel, marcado — ele existe e espera as máquinas dele. Máquina usada só por texto livre não aparece: a nota da folha aponta o caminho ("Trazer das conferências").',
      'No relatório das Furadeiras, o cartão da máquina agora ESTICA quando há poucas máquinas na tela — acabou o buraco à direita ao filtrar uma máquina.',
    ],
  },
  {
    versao: '2.47.0',
    data: '2026-08-28',
    titulo: 'O grupo de máquina sai na impressão',
    itens: [
      'A folha impressa das Furadeiras passou a identificar os GRUPOS: a identificação traz "Grupos de máquina: 0002 · FURADEIRA" e o Resumo por máquina ganhou a coluna Grupo — o papel agora fala a língua do ERP.',
      'Na tela, o cartão de cada máquina mostra o grupo com o código, batendo com o papel.',
      'A ligação é pelo cadastro (Ferramentas > Máquinas): máquina fora do cadastro aparece sem grupo, e a legenda impressa explica.',
    ],
  },
  {
    versao: '2.46.0',
    data: '2026-08-28',
    titulo: 'Grupos de máquina, com o código da fábrica',
    itens: [
      'O cadastro de máquinas ganhou GRUPOS com código no padrão do ERP: 0001 SECCIONADORA, 0002 FURADEIRA... O código identifica e ordena; o nome aparece. Tudo em Ferramentas > Máquinas: criar grupo (com o próximo código sugerido), editar, e vincular cada máquina ao seu grupo.',
      'No celular, a escolha da máquina vem agrupada pelo código: "0002 · FURADEIRA" com as furadeiras dentro. Máquina sem grupo continua valendo — o grupo organiza, não trava.',
      'Excluir um grupo nunca apaga máquina: ela só fica sem grupo. E máquina com conferência registrada segue sem poder ser excluída — desativa.',
      'É o alicerce para a leitura por grupo nos relatórios, quando outros postos além das furadeiras entrarem na medição.',
    ],
  },
  {
    versao: '2.45.0',
    data: '2026-08-28',
    titulo: 'Cadastro de máquinas — o nome sai igual em toda medição',
    itens: [
      'Novo cadastro em Ferramentas > Máquinas, no PC. Máquina era texto livre no celular, e o mesmo posto saía escrito de três jeitos — foi o que dividiu a mesma peça em linhas que não somavam. O cadastro ataca a causa.',
      'Com a lista preenchida, o celular passa a OFERECER as máquinas no Ritmo da furadeira — escolher em vez de digitar. "Outra máquina..." abre o texto livre; sem cadastro (ou sem rede e sem cache), o campo é o de sempre. Nada tranca.',
      '"Trazer das conferências" preenche o cadastro com os nomes que o banco já usou, uma grafia por máquina — ninguém redigita o próprio histórico.',
      'Máquina com conferência registrada não se exclui: DESATIVA — some da escolha e continua nomeando o histórico. Renomear vale para as próximas medições.',
    ],
  },
  {
    versao: '2.44.0',
    data: '2026-08-28',
    titulo: 'O relatório das Furadeiras vira painel',
    itens: [
      'Faixa de resumo no topo, respondendo na ordem certa: REFERÊNCIAS FECHADAS (o número que importa — âmbar enquanto há peça em aberto, verde quando todas fecham), conferências, tempo rodando, disponibilidade e setup do período.',
      'No quadro por peça, "Insuficiente" virou o que falta, em números curtos: "1/3 conf · 12/30 min · 1 curta". O detalhe completo continua no passar do mouse.',
      'Seção nova de PRÓXIMAS AÇÕES: uma linha por peça com o caminho mais curto para a referência (arquivar curtas, quantas conferências e minutos faltam) — quem falta menos vem primeiro. Conferência sem nome de peça também é apontada.',
      'Pareto de PARADAS do período, por motivo, ao lado das ações.',
      'A folha impressa ganhou a linha "Referências por peça: X de Y fechadas" na identificação.',
    ],
  },
  {
    versao: '2.43.1',
    data: '2026-08-28',
    titulo: 'A grafia do nome não divide mais o grupo',
    itens: [
      'Máquina e peça são texto digitado, e o mesmo nome sai de três jeitos: "Princesa Fundo", "princesa fundo ", "princesa  fundo". O agrupamento era pelo texto exato — e a mesma peça aparecia em duas linhas que não somavam: o analista fazia 3 medições e o quadro creditava 1+2 (aconteceu hoje, na Furadeira 16).',
      'Agora o agrupamento ignora maiúscula/minúscula, acento e espaço repetido — na referência por peça, no resumo por máquina e no filtro da lateral. O nome exibido continua como foi digitado.',
      'Nomes realmente diferentes continuam separados: "Furadeira 16" e "Furadeira 12" não se misturam.',
    ],
  },
  {
    versao: '2.43.0',
    data: '2026-08-28',
    titulo: 'Referência por peça — o número que dimensiona lote',
    itens: [
      'O relatório ganhou o quadro "Referência por peça": o ritmo consolidado de cada peça em cada máquina, com conferências, peças, tempo rodando, ritmo ponderado, ciclo do motor e CV%. Na tela e na folha impressa.',
      'O critério mínimo (3 conferências · 30 min rodando) passa a valer PARA A PEÇA nesse quadro. Antes, três medições de peças variadas fechavam o critério da máquina sem nenhuma peça ter referência de verdade — referência emprestada não dimensiona lote.',
      'O CV% ganhou a régua em palavras, no quadro e no cartão da máquina: estável (≤10%), variação moderada (≤20%) ou alta variação — a mesma classificação do estudo de ciclos, em vez do número cru.',
      'Conferência sem nome de peça fica fora do quadro (sem nome não há o que referenciar) — mais um motivo para preencher a peça ao medir.',
    ],
  },
  {
    versao: '2.42.0',
    data: '2026-08-28',
    titulo: 'Filtrou a máquina, o gráfico abre as conferências',
    itens: [
      'Sem filtro, o gráfico segue como era: uma barra por máquina, com a média ponderada — 3 medições em 2 máquinas são 2 barras, porque é assim que máquinas se comparam.',
      'A novidade é ao clicar numa máquina na lateral: o gráfico abre UMA BARRA POR CONFERÊNCIA daquela máquina, da mais antiga para a mais recente, com o horário e a peça embaixo de cada barra. É onde se enxerga qual peça puxa o ritmo para cima ou para baixo.',
      'Na visão aberta, a hachura marca outra coisa — período com menos de 5 min de máquina rodando (rajada, não ritmo) — e a legenda diz isso.',
    ],
  },
  {
    versao: '2.41.0',
    data: '2026-08-28',
    titulo: 'Mais um período — mesma peça',
    itens: [
      'O caminho da referência ficou de um toque: a máquina vira "Referência OK" com 3 conferências e 30 min rodando, e o jeito de medir isso é repetir a mesma peça em períodos separados. Só que "Começar outra peça" apagava o nome e os ciclos — três medições eram três redigitações.',
      'O resultado ganhou o botão "↻ Mais um período — mesma peça": mantém peça e ciclos de furação, emenda a hora inicial na final do período anterior e limpa só as peças e as paradas (que são do período que acabou).',
      '"Começar outra peça" continua logo abaixo, para quando a máquina troca de lote.',
    ],
  },
  {
    versao: '2.40.2',
    data: '2026-08-28',
    titulo: 'Os ciclos de furação chegam inteiros ao PC',
    itens: [
      'A conferência salva com 2 ciclos/pç chegava ao relatório do PC como 1: o envio da fila listava os campos um a um e esqueceu o novo. Aconteceu de verdade — a medição da Furadeira 16 de 28/08 subiu sem os ciclos (o registro no banco foi corrigido à mão).',
      'Corrigido, com um teste que trava o contrato: o que a fila do aparelho carrega chega inteiro ao servidor.',
    ],
  },
  {
    versao: '2.40.1',
    data: '2026-08-28',
    titulo: 'Salvar diz a verdade sobre o envio ao PC',
    itens: [
      'O recibo do botão dizia "SALVA NESTE APARELHO" — e passava a mensagem errada: salvar sempre ENVIOU a conferência para o relatório do PC. Agora ele diz isso: "SALVA — VAI PARA O RELATÓRIO DO PC". A nota explicando o destino, que só existia no cronômetro ao vivo, apareceu também no caminho dos horários.',
      'O rótulo "no PC" da lista marcava quem ENTROU NA FILA, não quem chegou: uma medição presa por falha do servidor aparecia como entregue (aconteceu em 28/08, na janela de uma migração). Agora a lista consulta a fila de verdade — "no PC" só quando o servidor confirmou; até lá, "aguardando envio".',
      'A tela do Ritmo da furadeira passou a empurrar a fila ao abrir. Antes, uma medição que falhou no envio só subia sozinha trocando de tela ou reabrindo o app — a barra de sincronização não aparece na tela cheia.',
    ],
  },
  {
    versao: '2.40.0',
    data: '2026-08-28',
    titulo: 'O número grande é o que saiu do posto',
    itens: [
      'No resultado da conferência, o destaque era o ritmo com a máquina rodando (ex.: 505 pç/h) — e a produção real do período (441 pç/h) ficava pequena, na linha de baixo. Quem olhava a tela lia 505 onde o posto entregou 441.',
      'Invertido: a manchete agora é o que foi PRODUZIDO no período — o número que bate com o contador da máquina. O ritmo com a máquina rodando (o de capacidade) desceu para a linha das paradas, como "Máq. rodando", ao lado do tempo parado.',
      'Sem parada marcada nada muda: os dois ritmos são o mesmo número.',
      'A lista de salvas no aparelho e as peças/min acompanham a manchete: produção do período, não ritmo de máquina.',
    ],
  },
  {
    versao: '2.39.1',
    data: '2026-08-28',
    titulo: 'No iPhone, a seta de voltar sai de baixo do relógio',
    itens: [
      'O app ocupa a tela inteira do iPhone, inclusive a faixa da barra de status — e as telas do celular só reservavam espaço na parte de baixo. O cabeçalho, com a seta de voltar, subia para debaixo do relógio e ficava difícil de tocar.',
      'As telas do aparelho (Ritmo da furadeira, coleta de ciclos, lista de estudos e operações) agora respeitam a área segura também no topo. Em aparelhos sem essa faixa, nada muda.',
    ],
  },
  {
    versao: '2.39.0',
    data: '2026-08-28',
    titulo: 'A conferência aprende os ciclos de furação da peça',
    itens: [
      'Na furadeira, cada peça exige um número de acionamentos do motor: a lateral simples fura num ciclo; há peças em que o motor sobe e depois desce (2 ciclos) e chega a 3. A conferência rápida ganhou esse campo — três botões, 1, 2 ou 3, ao lado do nome da peça.',
      'Com 2 ou 3 ciclos, o resultado mostra também o CICLO DO MOTOR (segundos por acionamento). É o número comparável entre peças: a peça de 2 ciclos rende menos peças/hora sem a máquina estar mais lenta — antes, essa diferença parecia queda de ritmo.',
      'O dado sobe com a conferência e aparece no relatório do PC: coluna "Ciclos/pç" na tabela (tela e impresso), acionamentos e ciclo do motor no cartão da máquina, e a Análise com IA passa a receber os dois — para não confundir peça de furação dupla com posto lento.',
      'Conferências antigas, sem o dado, contam como 1 ciclo por peça — nada muda nos números delas.',
    ],
  },
  {
    versao: '2.38.0',
    data: '2026-08-28',
    titulo: 'Setup cronometrado — e o resultado vem antes da ressalva',
    itens: [
      'O setup da furadeira ganhou cronômetro na conferência rápida: um toque em "Setup / troca" marca o início, o tempo corre na tela e o segundo toque grava os minutos exatos como parada — sem estimar de cabeça. O valor cai na lista já convertido e continua editável; quem prefere digitar de memória usa "Outra parada" e troca o motivo.',
      'Enquanto o setup cronometra, a tela fica acesa e o navegador avisa antes de fechar a página — mesma proteção do cronômetro ao vivo.',
      'No relatório das furadeiras, a primeira conferência já aparece como resultado: a folha impressa mostra o resumo por máquina antes do aviso de amostra, que virou uma nota logo abaixo dos números — na tela, o cartão da máquina diz numa linha o que falta para virar referência.',
      'O critério mínimo não mudou (3 conferências · 30 min · nenhum período menor que 5 min): segue declarado na identificação e na coluna Situação. Ele qualifica o número, não o esconde.',
    ],
  },
  {
    versao: '2.37.0',
    data: '2026-08-27',
    titulo: 'O tablet não apaga estudo — arquiva',
    itens: [
      'No tablet, o × do cartão apagava de vez o estudo que ainda não tinha nenhum ciclo, e a tela avisava isso por escrito: "apagado definitivamente". Só que estudo sem ciclo não é estudo sem trabalho — é o preparo que veio do PC (operações, fator de ritmo, meta, roteiro do ERP). Um toque no posto destruía tudo, sem volta.',
      'Agora, no tablet, remover sempre arquiva: o estudo sai da lista do posto e continua no banco, em Arquivados, de onde volta com um toque.',
      'No PC nada muda: rascunho sem ciclo continua podendo ser excluído, e "Excluir de vez" continua sendo do administrador.',
      'A regra passou a valer também no servidor e no banco — não é só a tela que esconde o botão.',
    ],
  },
  {
    versao: '2.36.1',
    data: '2026-08-27',
    titulo: 'A tela da análise não fica mais meio preta ao abrir',
    itens: [
      'Ao clicar em Analisar, enquanto o estudo carregava, o texto "Carregando estudo..." aparecia num quadro claro que cobria só a parte de cima da janela — o resto ficava preto, com a cor da tela de coleta. Se o estudo demorava (ou o servidor não respondia), a faixa preta ficava lá parada e parecia que o app tinha travado.',
      'A tela de carregamento e a de erro da análise agora ocupam a janela inteira, claras de cima a baixo, como o resto do painel.',
    ],
  },
  {
    versao: '2.36.0',
    data: '2026-08-27',
    titulo: 'A lista de estudos volta a caber na tela',
    itens: [
      'O botão que manda o estudo para o tablet (ou tira dele) estava cortado na borda direita: a coluna de ações tinha espaço para três botões e passou a ter quatro. A coluna cresceu, a tabela ganhou 140px de largura e sobra menos tela vazia à direita.',
      'Os rótulos ficaram curtos — "Ao tablet" e "Só no PC" — para os quatro botões caberem numa linha só. Passando o mouse, a explicação completa continua lá.',
      'Em tela estreita os botões agora descem para a linha de baixo em vez de sumirem cortados.',
    ],
  },
  {
    versao: '2.35.4',
    data: '2026-08-27',
    titulo: 'Quando o servidor não acha o banco, ele diz isso',
    itens: [
      'A causa do "Erro interno" ao entrar era o servidor não conseguir falar com o banco. O aviso agora nomeia o problema e o que configurar, em vez de esconder atrás de uma mensagem genérica.',
    ],
  },
  {
    versao: '2.35.3',
    data: '2026-08-27',
    titulo: 'O erro passa a dizer o que é',
    itens: [
      'Quando algo falha no servidor, a tela mostra o tipo do problema junto da mensagem — antes vinha só "Erro interno", que não permite nem começar a investigar.',
      'A falha também fica registrada no banco, com rota e horário. É o que permite descobrir a causa sem depender de quem estava na frente da tela.',
    ],
  },
  {
    versao: '2.35.2',
    data: '2026-08-27',
    titulo: 'Ajustes depois de fechar a porta antiga',
    itens: [
      'O diagnóstico em /api/status pedia para reconfigurar a chave de acesso antiga — justamente a que acabou de ser removida por segurança. Agora ele avisa o contrário: enquanto ela existir, é ela que deve sair.',
      'O tablet abria três sessões ao mesmo tempo ao ligar. Passou a abrir uma só.',
    ],
  },
  {
    versao: '2.35.1',
    data: '2026-08-27',
    titulo: 'Entrar não depende mais da rede do servidor',
    itens: [
      'A chave que confere o login passou a viajar dentro do próprio servidor. Antes, cada vez que a função "acordava" ela ia buscar essa chave no Supabase — e se essa busca falhasse, entrar dava "Erro interno" sem explicar nada.',
      'Quando algo assim voltar a acontecer, a tela passa a dizer o tipo do problema em vez de só "Erro interno", e /api/status responde se o servidor alcança o Supabase. Diagnóstico deixa de ser adivinhação.',
    ],
  },
  {
    versao: '2.35.0',
    data: '2026-08-27',
    titulo: 'O PC decide o que o tablet vê — e estudo de teste morre de vez',
    itens: [
      'Restaurar um estudo arquivado no PC não o devolve mais à coleta: ele volta como concluído, visível só na análise. O tablet lista apenas o que está EM COLETA.',
      'Cada estudo na tabela do PC ganhou o botão "Enviar ao tablet" / "Tirar do tablet" — é você quem decide quando um estudo volta ao chão de fábrica para pegar mais tempos.',
      'Restaurar NO TABLET continua devolvendo à coleta: ali, restaurar significa "arquivei sem querer o que eu estava medindo".',
      'Estudos arquivados ganharam "Excluir de vez" (só administrador, com confirmação que diz quantos ciclos morrem): é o caminho para apagar estudo de teste, que antes virava lixo eterno no arquivo.',
    ],
  },
  {
    versao: '2.34.0',
    data: '2026-08-26',
    titulo: 'A segurança mudou de lugar: agora ela mora no banco',
    itens: [
      'O PC passou a pedir e-mail e senha. Quem entra é quem o cadastro de Analistas diz que é — e o papel (administrador, analista, leitor) decide o que cada um pode fazer. A senha e a sessão vivem no Supabase Auth, nunca no nosso banco.',
      'O tablet não pede senha nenhuma: ele é PAREADO uma única vez com um código gerado na tela de Analistas, ganha identidade própria de coletor e entra sozinho dali em diante. Revogar um aparelho é um clique na mesma tela.',
      'O token que ficava embutido no próprio site — e abria a API inteira para qualquer pessoa que abrisse a página — saiu do ar. Cada requisição agora carrega um token assinado, verificado no servidor, e as regras de acesso são avaliadas DENTRO do Postgres (RLS), tabela por tabela.',
      'Nada muda no trabalho de coletar: a fila offline, o reenvio sem duplicar e as telas continuam como eram.',
    ],
  },
  {
    versao: '2.33.0',
    data: '2026-08-26',
    titulo: 'O período da conferência agora é um instante, e só',
    itens: [
      'Última etapa da refatoração do período. O horário da conferência era guardado como texto ("07:00") ao lado do instante; agora é só o instante. Texto não subtrai — era por isso que a duração precisava vir gravada à parte e um período que virasse a meia-noite não tinha como ser representado.',
      'Um período que atravessa a meia-noite agora fecha certo: 23:40 às 00:10 são 30 minutos, no dia seguinte. Antes o app não tinha como saber que o fim era do outro dia.',
      'A parada da conferência deixou de existir em dois lugares. Agora mora só na tabela de paradas, e o banco garante que toda parada tem exatamente uma origem — ou uma operação do estudo, ou uma conferência de furadeira.',
      'Nada mudou no tablet. Ele continua mandando o horário do mesmo jeito; quem monta o instante é o servidor.',
    ],
  },
  {
    versao: '2.32.0',
    data: '2026-08-26',
    titulo: 'O analista deixa de ser texto livre',
    itens: [
      'Novo CADASTRO DE ANALISTAS, em Ferramentas, no PC. O motivo é concreto: os estudos gravavam o analista como texto digitado, e a mesma pessoa apareceu como "ODERLI", "ODERLI GARCIA" e "ODERLI SERGIO GARCIA". Qualquer indicador por pessoa contava o Oderli como três. Agora o campo Analista do estudo é uma lista.',
      'Dá para dizer quem está usando o computador — no rodapé do menu, ou dentro da tela de Analistas. Quem se identifica passa a ser o analista sugerido ao criar estudo, e o sistema registra quem criou cada um.',
      'ISSO NÃO TRANCA NADA, e a tela diz isso com todas as letras. O app continua abrindo sem ninguém identificado, como sempre abriu, e o tablet continua entrando direto — de luva, diante da máquina, ninguém vai digitar senha. Serve para o estudo saber de quem ele é, não para barrar acesso.',
      'Os estudos que já existem continuam com o nome digitado e não quebram nada. Para juntar as grafias, abra o estudo, use Editar estudo e escolha o analista na lista — o nome antigo fica à mostra até você ligar.',
      'A senha é opcional: analista que só precisa ser escolhido num estudo não entra no sistema, e exigir senha de quem não usa só produz senha anotada no monitor. Quem tem senha nunca a vê de volta — nem na tela, nem na resposta do servidor.',
    ],
  },
  {
    versao: '2.31.1',
    data: '2026-08-26',
    titulo: 'Salvar diz para onde a conferência vai',
    itens: [
      'A tela do Ritmo da furadeira dizia "Salvar guarda a conferência só neste aparelho". Não era verdade: salvar envia para o relatório das Furadeiras, no PC — e uma medição que ficou no aparelho sem subir sobe sozinha na próxima vez que a tela abrir. Dava para fazer um teste rápido no posto achando que ficava ali, e encontrar o teste no relatório depois. Agora a frase diz o que acontece.',
      'A lista SALVAS NESTE APARELHO passou a marcar cada linha com "no PC" ou "aguardando envio", e explica no topo que o que não subiu vai subir quando houver rede. Antes o aparelho parecia um caderno particular.',
    ],
  },
  {
    versao: '2.31.0',
    data: '2026-08-26',
    titulo: 'Uma fonte só para parada, e período que o banco sabe contar',
    itens: [
      'A parada da conferência era guardada dentro da própria linha e a do estudo numa tabela — duas fontes para a mesma coisa. Agora é uma só, e o banco garante que toda parada tem exatamente uma origem: ou é de uma operação do estudo, ou de uma conferência de furadeira. O Pareto de perdas deixa de precisar juntar duas listas antes de somar.',
      'A hora da conferência virou instante de verdade. Antes era texto ("07:00"), e texto não subtrai: a duração tinha de vir gravada à parte e um período que virasse a meia-noite não tinha como ser representado. Agora dá para o banco calcular, ordenar e validar que o fim vem depois do início.',
      'Conferência feita no cronômetro ao vivo também passou a ter período: o fim é a hora em que você salvou, e o início sai dela menos o tempo cronometrado. Antes essas medições ficavam sem horário nenhum na tela e no relatório.',
      'Nada mudou no tablet. Ele continua mandando o horário e as paradas do mesmo jeito — quem converte é o servidor. Isso é de propósito: um aparelho que passou dias sem rede não pode precisar aprender um formato novo para conseguir enviar o que coletou.',
      'Consertado, no caminho: reenviar a mesma conferência podia duplicar as paradas dela, dobrando o tempo parado do posto no relatório. E seis testes de integração que falhavam há tempos — a lista de paradas estava sendo gravada com a codificação errada.',
    ],
  },
  {
    versao: '2.30.1',
    data: '2026-08-26',
    titulo: 'Erro que explica, e o filtro que não filtrava nada',
    itens: [
      'A tela de Motivos de parada abria com "Erro interno" quando o banco ainda não tinha a tabela nova — mensagem que não diz nem que o problema é de instalação nem o que fazer. Agora ela nomeia a tabela que falta e o comando que resolve, e o app inteiro passa a responder assim para qualquer tabela ausente.',
      'A mesma tela mostrava "Nenhum motivo cadastrado" JUNTO com o erro: duas frases que se contradizem — uma diz que o cadastro está vazio, a outra que não deu para saber. E ainda oferecia gravar os 9 num banco que acabara de recusar a leitura. Agora, quando a leitura falha, aparece só o erro e um "Tentar de novo".',
      'Com um produto só, o filtro por produto sumiu do menu lateral: "Todos 1" e o próprio produto logo abaixo, mesma contagem, eram duas linhas dizendo a mesma coisa. Ficava pior quando o produto se chama TODOS — e chama, porque quem cadastra usa a palavra para dizer "vale para todos os modelos". A tela de coleta já se comportava assim; o menu do PC é que não tinha herdado a regra.',
      'O botão de não filtrar passou a se chamar "Todos os produtos", nas duas telas: o rótulo precisa se distinguir de um produto que por acaso tenha esse nome.',
    ],
  },
  {
    versao: '2.30.0',
    data: '2026-08-26',
    titulo: 'Sair do sistema, motivos de parada e a mesma navegação em toda tela',
    itens: [
      'O tablet ganhou o botão SAIR, no alto da tela inicial. Instalado, o app roda em tela cheia e sem barra de endereço: não havia por onde encerrar o turno. Antes de sair, a confirmação diz quantos registros ainda não subiram — eles ficam gravados no aparelho e não se perdem, mas só chegam ao PC no próximo acesso com rede — e oferece enviar na hora. Confirmado, aparece "Sistema encerrado", e quem chega no turno seguinte toca em Entrar.',
      'Novo CADASTRO DE MOTIVOS DE PARADA, em Ferramentas, no PC. A lista que o tablet oferece quando a máquina para era do código: incluir "falta de energia" ou corrigir a ação recomendada do setup dependia de uma nova versão do app. Agora você cria, renomeia, escreve a ação, reordena e desativa. O cadastro começa vazio e traz os 9 motivos atuais num clique, para você ajustar em cima deles.',
      'Renomear um motivo vale para trás: o histórico inteiro passa a ler o nome novo. O CÓDIGO aparece ao lado, travado — é ele que está gravado em cada parada já registrada, e trocá-lo deixaria o passado sem nome. Motivo que já foi usado não se exclui: desativa. Ele some da coleta e continua nomeando as paradas antigas.',
      'O estudo aberto e o relatório das furadeiras passaram a usar o MESMO menu lateral da primeira tela. Eram duas faixas de navegação empilhadas — cabeçalho no topo com voltar, título e três botões, mais a fileira de abas logo abaixo —, e nenhuma delas parecida com a tela anterior. Agora Yamazumi, Operações, Operadores, Paradas e Sugestões são itens da lateral, junto de Imprimir relatório, Editar estudo e Resumo executivo. O link com ?aba= continua abrindo na seção certa.',
      'No relatório das furadeiras, o filtro por máquina saiu das pílulas acima da tabela e virou lista na lateral, como os produtos na primeira tela.',
    ],
  },
  {
    versao: '2.29.0',
    data: '2026-08-26',
    titulo: 'Dá para remover a chave da IA',
    itens: [
      'Novo botão "Remover chave", em Ferramentas → Chave da IA e também dentro do estudo, ao lado de "Trocar chave". Antes só dava para SUBSTITUIR: para tirar a chave do ar — analista que saiu, chave vazada, conta trocada — não havia caminho na tela.',
      'A confirmação diz o que se perde antes de apagar: a Análise com IA para de funcionar até salvar outra, e nenhum estudo é afetado. Chave definida pelo administrador na Vercel (ANTHROPIC_API_KEY) continua sem botão — essa se remove lá, não aqui.',
    ],
  },
  {
    versao: '2.28.0',
    data: '2026-08-26',
    titulo: 'Sugestões, operadores, capacidade e resumo executivo',
    itens: [
      'Nova aba SUGESTÕES: a lista priorizada do que fazer com os números — alta variação, gargalo acima do Takt, parada que mais custou, tempos subindo ao longo da coleta. Cada uma com o diagnóstico e a AÇÃO ("aplicar SMED e padronizar o plano de troca", "revisar kanban, ponto de pedido e lead time"). O gargalo abre a lista: é o único achado que trava a linha inteira. Nenhuma sugestão manda coletar mais ciclos.',
      'Nova aba OPERADORES: a fórmula escrita na tela (Σ TP ÷ Takt = 3,35 → 4), a contribuição de cada operação em barras, e o campo "quantos você tem hoje" com o veredito — sobram 3, faltam 2, ocupação do time atual. O número informado fica neste computador, por estudo, e não sai no relatório: é simulação do analista.',
      'No Yamazumi, a CAPACIDADE agora é esperado × real: o que o Takt exige, o que o gargalo entrega, o atingimento em % e o déficit ou superávit em peças/hora. Antes o app dizia quanto a linha produz e nunca se aquilo bastava.',
      'Novo botão RESUMO EXECUTIVO ao lado de Imprimir: uma página só, para a reunião de dez minutos — entrega × demanda, o veredito em uma frase, tempo padrão por operação e as 3 ações de alta prioridade. A Folha de Análise continua sendo o documento técnico, agora com as sugestões junto.',
    ],
  },
  {
    versao: '2.27.0',
    data: '2026-08-26',
    titulo: 'Fora a carta de controle',
    itens: [
      'A aba Carta de controle saiu da análise e do relatório impresso. Ela pedia leitura de CEP — limites, sigma, ponto fora de controle — para responder o que você já tem de outro jeito, e com 10 ciclos ela era matematicamente incapaz de sinalizar qualquer coisa: dizia "estável" por construção, não por resultado.',
      'Nada do que se usava se perdeu. Ciclo que fugiu do padrão continua sendo avisado durante a própria coleta, na hora, com o botão de descartar do lado. Estabilidade do posto continua no CV% e na coluna Estabilidade, na tela e no papel.',
      'Saiu junto a mensagem que mandava coletar mais ciclos para a carta funcionar.',
    ],
  },
  {
    versao: '2.26.0',
    data: '2026-08-26',
    titulo: 'Carta de controle sem a bagunça',
    itens: [
      'A escolha da operação na Carta de controle era uma fila de botões com o nome inteiro dentro. Como o nome de operação importada do roteiro é a lista de peças da caixa, oito delas viravam cinco linhas de blocos desalinhados — ocupando mais tela que o próprio gráfico.',
      'Agora é uma linha só: lista suspensa numerada, com setas de anterior/próxima para percorrer as operações sem abrir a lista a cada troca, e a posição ("3 de 8") ao lado. O nome inteiro continua no título da carta, logo abaixo.',
    ],
  },
  {
    versao: '2.25.0',
    data: '2026-08-26',
    titulo: 'Análise com IA para de estourar o tempo',
    itens: [
      'Corrigido o "O servidor demorou demais para responder" na Análise com IA. A análise passou a rodar em modo mais direto — é um diagnóstico sobre números já calculados, não um problema de raciocínio profundo — e o tempo do servidor dobrou, de 30 para 60 segundos.',
      'Se ainda assim estourar, o app agora explica o que fazer ("tente de novo; se repetir, analise um estudo com menos operações") em vez de mostrar o erro cru da hospedagem.',
      'Análise que bate no limite de tamanho passa a sair com a ressalva no fim, em vez de terminar no meio de uma frase parecendo conclusão.',
    ],
  },
  {
    versao: '2.24.0',
    data: '2026-08-26',
    titulo: 'Furadeira e embalagem separadas pelo nome',
    itens: [
      'Saiu o nome "Conferências rápidas". As duas partes passam a ser chamadas pelo posto: no menu do PC, "Embalagem e demais postos — estudos de tempo, ciclo a ciclo" e "Furadeiras — ritmo do posto, peças/hora". No celular o atalho virou "Ritmo da furadeira", e o relatório do PC, "Furadeiras — ritmo por máquina".',
      'A folha impressa acompanhou: "Ritmo das Furadeiras — Folha por Máquina".',
      'As colunas da lista de estudos pararam de desalinhar entre um produto e outro. Cada produto é uma tabela sua e cada uma media as próprias colunas — "EMBALGEM" empurrava a coluna Recurso num grupo e "FUR16" encolhia no outro. Agora a grade é a mesma para a lista inteira, e o olho desce a coluna sem tropeçar.',
      'Nome de estudo comprido corta com reticências e mostra o texto inteiro ao passar o mouse, em vez de esticar a coluna.',
      'Na cronometragem, ao fechar a meta (10 de 10, por exemplo) aparece a faixa "Meta atingida" com o botão Encerrar do lado, e o aparelho vibra na virada. Antes a meta era só uma fração pequena no topo e o analista seguia medindo "mais um pouco" sem precisar. Para medir mais, a faixa aponta o caminho certo: abrir outra Rodada, para a análise comparar as duas em vez de misturar.',
    ],
  },
  {
    versao: '2.23.0',
    data: '2026-08-26',
    titulo: 'As paradas do estudo aparecem',
    itens: [
      'A coleta já registrava a parada com o motivo — e já descontava do ciclo, para não inflar o tempo observado —, mas nenhuma tela mostrava: o dado morria no banco. Agora o painel de análise tem a aba PARADAS, com o tempo total, quanto representa do tempo observado, os motivos em ordem da maior perda para a menor e a ação que cada um pede (SMED no setup, kanban na falta de material, TPM na manutenção).',
      'A tabela de operações ganhou a coluna "Parado", e a faixa de números do topo mostra o tempo parado do estudo.',
      'A folha impressa saiu com a seção "Paradas registradas na coleta": motivo, ocorrências, tempo, % do parado e ação recomendada. Quando não há registro, o documento diz isso com todas as letras — ausência de registro não é ausência de parada.',
      'A Análise com IA passou a receber as paradas por motivo e foi instruída a tratá-las como perda separada: máquina parada não é máquina lenta, e a ação de cada caso é diferente.',
      'A parada passou a ser gravada pelo código do motivo, não pelo texto: revisar o rótulo na tela não quebra mais o agrupamento do relatório.',
    ],
  },
  {
    versao: '2.22.0',
    data: '2026-08-26',
    titulo: 'Paradas e setup na conferência',
    itens: [
      'Agora dá para marcar as PARADAS do período conferido — setup/troca, falta de peça, manutenção, ajuste. O ritmo passa a sair do tempo em que a máquina rodou: 100 peças em 30 min com 10 min de setup são 300 pç/h, e não 200. O número do período inteiro continua ao lado, porque é ele que explica o que saiu do posto no turno.',
      'No cronômetro ao vivo, o botão "Parou" pergunta o motivo e cronometra a parada; "Voltou" encerra. Enquanto a máquina está parada não dá para contar peça — o relógio do período continua correndo, porque a parada está dentro dele.',
      'No PC, cada conferência tem o botão "Paradas": dá para cadastrar o setup depois, com o apontamento na mão, sem precisar arquivar a medição. O resumo por máquina passou a mostrar tempo parado, setup e disponibilidade, e a impressão saiu com as mesmas colunas.',
      'No tablet ficou explícito onde é cada coisa: "Furadeiras — Conferência rápida" no atalho do topo e "Embalagem e demais postos — Estudos de tempo" na lista abaixo.',
      'Conferência antiga, sem parada marcada, continua valendo exatamente como antes: sem parada, o ritmo do período e o da máquina rodando são o mesmo número.',
    ],
  },
  {
    versao: '2.21.0',
    data: '2026-08-26',
    titulo: 'Primeira tela orientada pelo fluxo',
    itens: [
      'A tela inicial foi reorganizada para responder em segundos: onde estou, o que fazer agora, quais estudos existem e qual é o caminho. "+ Novo estudo" virou a única ação em destaque, logo abaixo da identidade — e o único elemento vermelho do menu.',
      'Os três pilares agora aparecem como sequência numerada: ① Coleta → ② Análise → ③ Capacidade, sob o título "Depois de criar, o caminho é este" — fluxo do estudo, não três botões concorrentes.',
      'Busca, Importar e Chave da IA passaram para o bloco Ferramentas, no fim do menu. "Ir para a Coleta" continua disponível, mas discreto no rodapé: a coleta é a primeira etapa de um estudo, não uma quarta ação.',
    ],
  },
  {
    versao: '2.20.0',
    data: '2026-08-26',
    titulo: 'Aviso de versão nova, editar estudo e fim do tremor',
    itens: [
      'Com o app aberto, se sair uma versão nova aparece a faixa "Nova versão disponível" com o botão Atualizar agora. Antes você só descobria ao recarregar por conta própria — o tablet do posto podia passar o dia inteiro numa versão antiga, com erros já corrigidos. A checagem acontece ao abrir, ao voltar para a aba e a cada 10 minutos; o app nunca recarrega sozinho.',
      'Agora dá para corrigir o NOME do estudo, o produto e o posto: antes um erro de digitação ficava para sempre, porque os ajustes só cobriam setor, analista, tolerância e meta — e recriar o estudo custaria os ciclos já cronometrados. Novo botão "Editar" na lista abre a correção direto.',
      'A tela do estudo não treme mais: o detalhe da operação aparecia só ao passar o mouse e crescia a página, o que fazia a barra de rolagem surgir, o gráfico se remedir e a barra sair de baixo do cursor — em ciclo. O detalhe agora tem lugar fixo e o espaço da barra de rolagem fica sempre reservado.',
    ],
  },
  {
    versao: '2.19.0',
    data: '2026-08-26',
    titulo: 'Excluir funciona, impressão igual e caminhos claros',
    itens: [
      'Corrigido o "não consigo excluir": a exclusão sempre chamava o servidor, mas quando ele recusava a tela não dizia nada — o clique parecia não fazer efeito. Agora a falha aparece na tela e dentro da própria janela de confirmação.',
      'A impressão das Conferências virou o mesmo documento da Folha de Análise do estudo: cabeçalho com a marca, identificação, ressalva de confiabilidade antes dos números, legenda em palavras e campos de assinatura.',
      'Ficou claro onde é cada coisa: no menu do PC, "Estudos de tempo — ciclo a ciclo (ex: embalagem)" e "Conferências rápidas — peças/hora por posto (ex: furadeiras)". O relatório de conferências e o atalho do celular também dizem que servem às furadeiras.',
      'No PC a tabela deixou de esticar até a borda: largura limitada e, ao lado, um painel com a visão geral — estudos, ciclos, ciclos por posto, o mais medido e os que ainda estão sem medição.',
      'Logo do menu lateral não distorce mais.',
    ],
  },
  {
    versao: '2.18.0',
    data: '2026-08-26',
    titulo: 'PC com menu lateral e conferências completas',
    itens: [
      'No PC a navegação virou menu lateral, com busca por produto, peça, máquina ou analista — e os produtos viraram lista de verdade em vez de uma fileira de botões no topo.',
      'A tela de Conferências ficou igual à do estudo: gráfico de ritmo por máquina (barra hachurada quando a amostra é insuficiente), Análise com IA e impressão em A4.',
      'Cada conferência agora pode ser arquivada (sai dos cálculos, continua guardada — para medição atípica) ou excluída de vez (para registro errado, com confirmação). O botão "Arquivadas" mostra e restaura as que saíram.',
      'Corrigida a falha "Unexpected token A..." na Análise com IA: a análise estourava o tempo do servidor e o app tentava ler a página de erro como resultado. Agora a chamada cabe no tempo e qualquer falha vem com mensagem clara.',
    ],
  },
  {
    versao: '2.17.0',
    data: '2026-08-26',
    titulo: 'Chave da IA no lugar certo',
    itens: [
      'A chave da API agora tem botão próprio no topo da Análise ("Chave da IA"). Antes ela só existia dentro de um estudo aberto — com a lista vazia, não havia como chegar nela.',
      'O comportamento é o mesmo: a chave vai para o servidor, nunca volta para o navegador, e só os 4 últimos caracteres aparecem para você reconhecer qual está ativa.',
    ],
  },
  {
    versao: '2.16.0',
    data: '2026-08-26',
    titulo: 'Estudos arquivados voltam',
    itens: [
      'Novo botão "Arquivados" no topo da lista, com a contagem: mostra os estudos que saíram da lista e restaura qualquer um com um clique. Antes, arquivar era caminho sem volta dentro do app.',
      'O botão só aparece quando há estudo arquivado, e a tela de lista vazia passou a avisar que existem arquivados a restaurar — em vez de sugerir que não há nada.',
    ],
  },
  {
    versao: '2.15.0',
    data: '2026-08-26',
    titulo: 'Template da embalagem + critérios no relatório',
    itens: [
      'O botão Importar (Análise, no PC) agora aceita também o template de tempos .xlsx da embalagem (abas Config/Tempos/Paradas): as operações viram estudo pronto para cronometrar, e tempos já preenchidos entram como ciclos — sem digitar de novo.',
      'O relatório de Conferências passou a se autoavaliar, como o estudo: mínimo de 3 conferências por máquina, 30 min de tempo total observado e nenhum período menor que 5 min. Máquina fora do critério aparece carimbada de "amostra insuficiente" — na tela e impressa, antes dos números.',
      'A impressão do relatório de Conferências virou documento A4 de verdade: identificação, critérios, resumo por máquina (com CV entre conferências) e o dado bruto — em vez da tela jogada no papel.',
      'Novo botão "Começar outra peça" na conferência rápida: mantém a máquina, emenda a hora inicial na hora final da peça anterior e limpa peça e quantidade — para conferir a linha inteira sem redigitar.',
    ],
  },
  {
    versao: '2.14.0',
    data: '2026-08-26',
    titulo: 'Conferências no banco + estudo por máquina',
    itens: [
      'Conferência salva agora sobe para o banco pelo mesmo caminho da coleta: grava no aparelho primeiro e sincroniza quando há rede — reenviar não duplica.',
      'Novo campo Máquina na conferência (ex: Furadeira 03), ao lado da Peça, para o relatório saber de qual posto veio cada medição.',
      'Novo relatório "Conferências" no PC (botão no topo da Análise): resumo por máquina — medições, ritmo médio ponderado, melhor e pior registro com a peça — mais a tabela completa, com filtro por máquina e impressão.',
    ],
  },
  {
    versao: '2.13.0',
    data: '2026-08-26',
    titulo: 'Salvar conferência com a peça',
    itens: [
      'A conferência rápida ganhou o campo Peça e o botão Salvar: o resultado (peça, horários, período, peças e ritmo) fica guardado no próprio aparelho, numa lista na mesma tela — para comparar depois ou mostrar ao gestor.',
      'As conferências salvas vivem só neste aparelho (até 50, as mais recentes) e podem ser removidas uma a uma. Registro oficial, com tempo padrão, continua sendo o estudo.',
    ],
  },
  {
    versao: '2.12.0',
    data: '2026-08-26',
    titulo: 'Conferência por horários',
    itens: [
      'A conferência rápida agora marca hora inicial e hora final: toque "Agora" ao passar pela máquina (ex: 7:00), toque de novo na volta (7:10), digite as peças (150) e a conta sai na hora — 900 pç/h, ciclo médio 4 s. Também dá para digitar os horários de cabeça, depois do fato.',
      'O cronômetro ao vivo continua na mesma tela, para quem prefere ficar no posto contando peça a peça.',
      'Nova faixa "App atualizado" no topo da lista: quando chega versão nova, ela avisa o que mudou — "Ver novidades" abre o histórico completo. Aparece uma vez por aparelho e some ao ser vista ou dispensada.',
    ],
  },
  {
    versao: '2.11.0',
    data: '2026-08-26',
    titulo: 'Conferência rápida',
    itens: [
      'Nova opção "Conferência rápida" na tela de coleta: cronometre um período diante da máquina sem cadastrar estudo — ex: das 7:00 às 7:10 saíram 150 peças — e veja peças/hora e ciclo médio na hora.',
      'Dá para contar tocando a cada peça ou só cronometrar e digitar o total no fim (lendo o contador da máquina) — o resultado recalcula ao editar.',
      'Funciona sem rede e sem servidor: nada é gravado. Para registrar ciclos e calcular tempo padrão, o caminho continua sendo o estudo.',
    ],
  },
  {
    versao: '2.10.0',
    data: '2026-08-25',
    titulo: 'Análise com IA',
    itens: [
      'Nova seção "Análise com IA" no painel do PC: diagnóstico, gargalo e ações recomendadas a partir dos números do estudo.',
      'A chave da API tem lugar no próprio app — salva uma vez, fica guardada no servidor e nunca volta para o navegador (só os 4 últimos caracteres aparecem, para reconhecer qual chave está ativa).',
      'A coluna Nievel saiu do relatório impresso — o CV% segue na tabela como referência de estabilidade.',
    ],
  },
  {
    versao: '2.9.3',
    data: '2026-08-25',
    titulo: 'Legenda no relatório',
    itens: [
      'O relatório impresso ganhou uma Legenda por extenso: Obs., FR, TO, TN, Cic/pç, TP, CV%, Nievel, Cap/h, Σ TP e Takt explicados em palavras, com a fórmula entre parênteses — para o documento circular em reunião sem precisar de tradutor.',
    ],
  },
  {
    versao: '2.9.2',
    data: '2026-08-25',
    titulo: 'Coleta sem conta de variação',
    itens: [
      'A tela de coleta não mostra mais "Alta variação · referência Nievel: N obs" — a conta lia como pedido de aumentar ciclos sem fim. Quem decide quantos ciclos bastam é a meta do estudo. O CV% continua nos números do topo e no relatório impresso.',
    ],
  },
  {
    versao: '2.9.1',
    data: '2026-08-25',
    titulo: 'Selo verde na hora',
    itens: [
      'Ao terminar a cronometragem, a tela do estudo já mostra a contagem certa e o selo verde — sem sair e abrir de novo. A tela passou a somar os ciclos que ainda estão no aparelho aguardando envio ("N a enviar").',
      'O envio automático agora dispara assim que há ciclo na fila com rede boa — antes ele só reagia à rede cair e voltar.',
      'Nome do estudo importado vem só com o produto — a máquina tem campo próprio (Recurso/Posto).',
    ],
  },
  {
    versao: '2.9.0',
    data: '2026-08-25',
    titulo: 'Meta de ciclos manda',
    itens: [
      'Fim da exigência de aumentar ciclos: atingiu a meta definida no estudo, a amostra fecha. O mínimo de Nievel e o CV% continuam visíveis na tela e no relatório como referência de confiabilidade — mas não seguram mais o estudo.',
    ],
  },
  {
    versao: '2.8.0',
    data: '2026-08-25',
    titulo: 'Celular é coleta',
    itens: [
      'No celular e no tablet o app só abre a Coleta: sem abas de modo, e link de Análise cai na Coleta equivalente. Análise é trabalho de PC.',
      'Na importação, o Recurso/Posto ficou editável: o roteiro sugere a máquina (ex.: FUR16), você escolhe em qual o estudo vai rodar.',
      'Criar ou importar estudo no PC volta para a lista — cair no painel de análise vazio, cheio de avisos, estranhava. No celular segue direto para a coleta.',
    ],
  },
  {
    versao: '2.7.0',
    data: '2026-08-25',
    titulo: 'Importação com o formulário completo',
    itens: [
      'A importação do roteiro agora pede as mesmas informações do cadastro manual: Identificação, Configuração da coleta e Ritmo/Demanda com o Takt calculado — acabou a "versão simples".',
      'Horas disponíveis já vêm preenchidas com a jornada de 8,8 h/dia (8h48min); só digitar a quantidade do dia.',
      'O painel de ritmo é um componente único: o que mudar no cadastro manual muda junto na importação.',
    ],
  },
  {
    versao: '2.6.0',
    data: '2026-08-25',
    titulo: 'Cadastro de Setor',
    itens: [
      'Setor agora tem onde ser preenchido: no novo estudo, na importação do roteiro e nos Ajustes do estudo já criado — e sai no relatório impresso.',
      'Analista também editável nos Ajustes, para corrigir estudo criado sem ele.',
      'Sugestão de setores já usados no cadastro, para não criar "USINAGEM" ao lado de "Usinagem".',
      'Importar roteiro só aparece na Análise — na Coleta não se importa nada, só se cronometra.',
    ],
  },
  {
    versao: '2.5.0',
    data: '2026-08-25',
    titulo: 'Painel inicial e novo estudo em etapas',
    itens: [
      'Tela inicial do PC estruturada: chamada para o primeiro estudo e os três passos do sistema (Coleta, Análise, Capacidade).',
      'Novo estudo em 3 etapas visuais. O Takt Time virou resultado calculado: quantidade por dia × horas disponíveis mostram o ritmo (ex.: 00:42 s/peça).',
      'Navegação Coleta / Análise em abas com o sublinhado vermelho da marca.',
    ],
  },
  {
    versao: '2.4.0',
    data: '2026-08-25',
    titulo: 'Importação do roteiro do ERP',
    itens: [
      'Importa o PDF "Processos de Produção" do ERP e cria o estudo pronto: uma operação por peça, na máquina do roteiro.',
      'Ciclos por peça preenchidos pela quantidade na estrutura — a lateral que entra 2× no produto já chega com 2 ciclos, sem digitação.',
      'Conferência antes de criar, aviso de produto já estudado e peças sem processo visíveis.',
    ],
  },
  {
    versao: '2.3.0',
    data: '2026-08-25',
    titulo: 'Estudos organizados por produto',
    itens: [
      'Lista agrupada por produto, com filtro e sugestão de produto já usado no cadastro.',
      'Botão de remover saiu de cima da contagem de ciclos no celular.',
    ],
  },
  {
    versao: '2.2.0',
    data: '2026-08-25',
    titulo: 'Ciclos por peça e Takt Time',
    itens: [
      'Capacidade corrigida: peça com 3 furações leva 3× o tempo de uma com 1 — antes o sistema superestimava.',
      'Takt Time no cadastro do estudo e desenhado como linha de referência no Yamazumi.',
      'Painel de análise em abas e saída visível em toda tela — sem beco sem saída.',
    ],
  },
  {
    versao: '2.1.0',
    data: '2026-08-25',
    titulo: 'RitmoPatrimar',
    itens: [
      'Nome RitmoPatrimar e logomarca Patrimar embutida no app e no relatório.',
      'Excluir estudo com proteção: com ciclos coletados ele é arquivado, nunca apagado.',
      'Navegação pela URL: Voltar, recarregar e link direto funcionam.',
    ],
  },
  {
    versao: '2.0.0',
    data: '2026-08-25',
    titulo: 'Reconstrução',
    itens: [
      'Coleta no celular separada da análise no PC, com relatório A4 próprio para impressão.',
      'Backend na nuvem (Vercel + Supabase): o estudo aparece no PC na hora, e a coleta grava local primeiro — wifi caindo não perde nem duplica ciclo.',
      'Estatística testada: TO → TN → TP, carta de controle ±3σ, Nievel e CV%.',
    ],
  },
  {
    versao: '1.0',
    data: null,
    titulo: 'RitmoProd original',
    itens: [
      'Aplicativo em arquivo único, rodando do pendrive, sem servidor.',
    ],
  },
];

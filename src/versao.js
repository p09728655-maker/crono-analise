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

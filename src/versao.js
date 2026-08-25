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

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

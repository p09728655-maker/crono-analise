-- RitmoPatrimar — schema Postgres
-- Convencao: tempos em MILISSEGUNDOS (bigint), datas em timestamptz (UTC).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------- empresas
CREATE TABLE IF NOT EXISTS empresas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  documento   text,                       -- CPF (autonomo) ou CNPJ
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  email       text,
  papel       text NOT NULL DEFAULT 'analista'
              CHECK (papel IN ('admin', 'analista', 'leitor')),
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
-- Indice funcional em lower(email): unicidade sem diferenciar caixa, sem
-- depender da extensao citext (que o linter do Supabase sinaliza no schema public).
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unq ON usuarios (lower(email)) WHERE email IS NOT NULL;

-- Senha em scrypt com sal por usuario, quando houver. E OPCIONAL: analista
-- que so' precisa ser escolhido num estudo nao entra no sistema, e criar
-- senha para quem nao usa so' produz senha anotada em post-it.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_hash       text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_salt       text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS atualizado_em    timestamptz NOT NULL DEFAULT now();

-- ----------------------------------------------------------------- sessoes
-- Identificacao do analista no PC. NAO e controle de acesso: o token de
-- servico embutido no bundle abre a API sozinho, porque o tablet entra sem
-- senha, de luva, diante da maquina. Isto responde "quem esta usando este
-- computador" — e e' o que carimba autoria no estudo.
--
-- Guardamos o HASH do token, nao o token: vazar a tabela nao pode entregar
-- sessao valida a ninguem. Mesmo motivo pelo qual a senha tambem nao e
-- guardada em claro.
CREATE TABLE IF NOT EXISTS sessoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  expira_em  timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sessoes_token_unq   ON sessoes (token_hash);
CREATE INDEX        IF NOT EXISTS sessoes_usuario_idx ON sessoes (usuario_id, expira_em DESC);

-- ---------------------------------------------------------------- estudos
CREATE TABLE IF NOT EXISTS estudos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  criado_por     uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  nome           text NOT NULL,
  produto        text,
  -- O nome como foi DIGITADO. Continua existindo como registro historico e
  -- como fonte enquanto o estudo nao for ligado ao cadastro: foi este campo
  -- que produziu tres grafias da mesma pessoa (ODERLI, ODERLI GARCIA,
  -- ODERLI SERGIO GARCIA), e qualquer indicador por analista contava tres.
  analista       text,
  setor          text,
  recurso        text,                    -- posto/maquina (ex.: "Furadeira 03")
  data_estudo    date NOT NULL DEFAULT CURRENT_DATE,
  tolerancia_pct numeric(5,2) NOT NULL DEFAULT 15 CHECK (tolerancia_pct >= 0 AND tolerancia_pct <= 100),
  meta_obs       integer NOT NULL DEFAULT 10 CHECK (meta_obs >= 0),
  takt_time_ms   bigint CHECK (takt_time_ms IS NULL OR takt_time_ms > 0),
  status         text NOT NULL DEFAULT 'coletando'
                 CHECK (status IN ('coletando', 'concluido', 'arquivado')),
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS estudos_empresa_idx ON estudos (empresa_id, atualizado_em DESC);

-- O analista do cadastro. SET NULL, nao CASCADE: apagar um usuario nao pode
-- levar junto os estudos que ele mediu — e o nome antigo sobrevive no texto.
ALTER TABLE estudos ADD COLUMN IF NOT EXISTS analista_id uuid
  REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS estudos_analista_idx ON estudos (analista_id)
  WHERE analista_id IS NOT NULL;

-- ---------------------------------------------------------------- operacoes
CREATE TABLE IF NOT EXISTS operacoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estudo_id   uuid NOT NULL REFERENCES estudos(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  descricao   text,
  fr_pct      numeric(5,2) NOT NULL DEFAULT 100 CHECK (fr_pct > 0 AND fr_pct <= 200),
  -- Quantas vezes a operacao roda por peca. O cronometro mede UM ciclo da
  -- maquina, mas a peca pode exigir varios: na furadeira, uma peca com 3
  -- furacoes leva 3x o tempo de uma com 1. Sem isto a capacidade sai
  -- superestimada pelo fator de ciclos.
  ciclos_por_peca integer NOT NULL DEFAULT 1 CHECK (ciclos_por_peca > 0 AND ciclos_por_peca <= 999),
  ordem       integer NOT NULL DEFAULT 0,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operacoes_estudo_idx ON operacoes (estudo_id, ordem);

-- ------------------------------------------------------------ observacoes
-- Uma linha por ciclo cronometrado. Guardamos o dado BRUTO; nenhuma media,
-- TN ou TP e' persistido — indicador derivado se recalcula, dado bruto nao.
CREATE TABLE IF NOT EXISTS observacoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Chave gerada no CELULAR antes de sair para a rede. E' o que torna o
  -- reenvio idempotente: wifi caindo no chao de fabrica faz o app repetir
  -- o POST, e sem isso o mesmo ciclo entraria duas vezes no estudo.
  client_id    uuid NOT NULL,
  operacao_id  uuid NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
  duracao_ms   bigint NOT NULL CHECK (duracao_ms > 0),
  rodada       smallint NOT NULL DEFAULT 1 CHECK (rodada >= 1),
  descartada   boolean NOT NULL DEFAULT false,
  motivo_descarte text,
  coletado_em  timestamptz NOT NULL,      -- horario real do ciclo, do dispositivo
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS observacoes_client_unq ON observacoes (client_id);
CREATE INDEX IF NOT EXISTS observacoes_operacao_idx ON observacoes (operacao_id, coletado_em);

-- ---------------------------------------------------------------- paradas
-- FONTE OFICIAL de toda parada, das duas naturezas de medicao:
--   operacao_id     -> parada do estudo ciclo a ciclo
--   conferencia_id  -> parada do periodo conferido na furadeira
-- Exatamente UMA das duas, nunca as duas, nunca nenhuma (paradas_origem_chk).
CREATE TABLE IF NOT EXISTS paradas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      uuid NOT NULL,
  operacao_id    uuid REFERENCES operacoes(id) ON DELETE CASCADE,
  -- A FK para conferencias e' adicionada MAIS ABAIXO: aquela tabela ainda
  -- nao existe neste ponto do arquivo.
  conferencia_id uuid,
  motivo         text NOT NULL,
  observacao     text,
  duracao_ms     bigint NOT NULL CHECK (duracao_ms > 0),
  iniciado_em    timestamptz NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
-- Banco que ja existia: a coluna nasceu NOT NULL e a origem passa a ser dupla.
ALTER TABLE paradas ADD COLUMN IF NOT EXISTS conferencia_id uuid;
ALTER TABLE paradas ALTER COLUMN operacao_id DROP NOT NULL;
ALTER TABLE paradas DROP CONSTRAINT IF EXISTS paradas_origem_chk;
ALTER TABLE paradas ADD CONSTRAINT paradas_origem_chk CHECK (
  (operacao_id IS NOT NULL AND conferencia_id IS NULL) OR
  (operacao_id IS NULL     AND conferencia_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS paradas_client_unq ON paradas (client_id);
CREATE INDEX IF NOT EXISTS paradas_operacao_idx ON paradas (operacao_id);
CREATE INDEX IF NOT EXISTS paradas_conferencia_idx ON paradas (conferencia_id)
  WHERE conferencia_id IS NOT NULL;

-- ------------------------------------------------------------ conferencias
-- Conferencia rapida sincronizada do aparelho: hora inicial, hora final e
-- pecas de um periodo observado num posto (ex.: Furadeira 03). Guardamos o
-- dado BRUTO (duracao + pecas); pecas/hora e ciclo medio sao derivados e se
-- recalculam. Nao pertence a estudo nenhum — e' medicao de vazao avulsa,
-- e o relatorio agrupa por maquina e peca.
CREATE TABLE IF NOT EXISTS conferencias (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Gerada no aparelho antes da rede: reenvio da fila offline e' idempotente.
  client_id    uuid NOT NULL,
  empresa_id   uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  maquina      text,                      -- posto conferido (ex.: "Furadeira 03")
  peca         text,
  -- TRANSICAO: hora_inicial/hora_final sao o formato antigo (texto "HH:MM")
  -- e saem no passo 3 da migracao, depois que todo app publicado estiver
  -- lendo os instantes. Ate' la' os dois convivem, e o servidor grava ambos.
  hora_inicial text CHECK (hora_inicial IS NULL OR hora_inicial ~ '^\d{2}:\d{2}$'),
  hora_final   text CHECK (hora_final   IS NULL OR hora_final   ~ '^\d{2}:\d{2}$'),
  -- O periodo como INSTANTE. Texto nao subtrai: com "HH:MM" a duracao tinha
  -- de vir gravada a parte, o banco nao conseguia validar a ordem e um
  -- periodo que atravessa a meia-noite nao tinha representacao possivel.
  iniciado_em   timestamptz,
  finalizado_em timestamptz,
  duracao_ms   bigint  NOT NULL CHECK (duracao_ms > 0),
  pecas        integer NOT NULL CHECK (pecas > 0),
  -- TRANSICAO: as paradas da conferencia moravam AQUI, num jsonb. Duas
  -- fontes para o mesmo conceito (esta coluna e a tabela `paradas`) custavam
  -- dois caminhos de leitura, dois de escrita, e um Pareto de perdas que
  -- precisava unir as duas antes de somar. A fonte oficial agora e a tabela
  -- `paradas`, via paradas.conferencia_id; a coluna sai no passo 3.
  --
  -- O argumento original — "nascem e sobem no mesmo INSERT idempotente" —
  -- continua valendo, e por isso o /api/sync insere a mae e as filhas na
  -- MESMA transacao, e so' insere filhas quando a mae foi de fato criada.
  paradas      jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(paradas) = 'array'),
  salvo_em     timestamptz NOT NULL,      -- horario real do aparelho
  -- Medicao atipica (turno interrompido, lote de teste) sai dos calculos sem
  -- sumir do banco. Registro ERRADO — hora digitada errada — e' excluido de
  -- vez. Setup no meio do periodo nao e' motivo para arquivar desde que ha'
  -- a coluna `paradas`: marca-se a parada e a medicao continua valendo.
  arquivada    boolean NOT NULL DEFAULT false,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conferencias_client_unq ON conferencias (client_id);
CREATE INDEX IF NOT EXISTS conferencias_empresa_idx ON conferencias (empresa_id, salvo_em DESC);
CREATE INDEX IF NOT EXISTS conferencias_ativas_idx ON conferencias (empresa_id, arquivada, salvo_em DESC);
-- Banco que ja existia: `CREATE TABLE IF NOT EXISTS` acima e' no-op, entao as
-- colunas novas precisam vir por ALTER. Sem isto, rodar este arquivo como
-- migracao falha no indice logo abaixo.
ALTER TABLE conferencias ADD COLUMN IF NOT EXISTS iniciado_em   timestamptz;
ALTER TABLE conferencias ADD COLUMN IF NOT EXISTS finalizado_em timestamptz;

-- Converte o horario de texto para instante. A data vem de salvo_em lida no
-- fuso da fabrica — "07:00" e' 07:00 no chao de fabrica, nao em UTC. Roda uma
-- vez: quem ja tem instante nao e' tocado.
UPDATE conferencias SET
  iniciado_em = ((salvo_em AT TIME ZONE 'America/Sao_Paulo')::date
                 + hora_inicial::time) AT TIME ZONE 'America/Sao_Paulo',
  finalizado_em = ((salvo_em AT TIME ZONE 'America/Sao_Paulo')::date
                 + hora_final::time) AT TIME ZONE 'America/Sao_Paulo'
 WHERE hora_inicial IS NOT NULL AND hora_final IS NOT NULL AND iniciado_em IS NULL;

-- Periodo que atravessa a meia-noite: o fim caiu no dia seguinte.
UPDATE conferencias SET finalizado_em = finalizado_em + interval '1 day'
 WHERE finalizado_em IS NOT NULL AND finalizado_em < iniciado_em;

CREATE INDEX IF NOT EXISTS conferencias_iniciado_idx ON conferencias (empresa_id, iniciado_em DESC);

-- A FK que ficou pendente la em cima, agora que conferencias existe.
ALTER TABLE paradas DROP CONSTRAINT IF EXISTS paradas_conferencia_id_fkey;
ALTER TABLE paradas ADD CONSTRAINT paradas_conferencia_id_fkey
  FOREIGN KEY (conferencia_id) REFERENCES conferencias(id) ON DELETE CASCADE;

-- Traz para a tabela as paradas que ainda estiverem no jsonb da conferencia.
-- Idempotente: conferencia que ja tem parada em linha nao e' tocada de novo.
INSERT INTO paradas (client_id, conferencia_id, motivo, observacao, duracao_ms, iniciado_em)
SELECT gen_random_uuid(), c.id,
       p->>'motivo',
       nullif(p->>'observacao', ''),
       (p->>'duracaoMs')::bigint,
       coalesce(c.iniciado_em, c.salvo_em)
  FROM conferencias c
  CROSS JOIN LATERAL jsonb_array_elements(c.paradas) AS p
 WHERE jsonb_array_length(c.paradas) > 0
   AND (p->>'duracaoMs')::bigint > 0
   AND NOT EXISTS (SELECT 1 FROM paradas x WHERE x.conferencia_id = c.id);
ALTER TABLE conferencias DROP CONSTRAINT IF EXISTS conferencias_periodo_chk;
ALTER TABLE conferencias ADD CONSTRAINT conferencias_periodo_chk
  CHECK (iniciado_em IS NULL OR finalizado_em IS NULL OR finalizado_em > iniciado_em);

-- ------------------------------------------------------- motivos_parada
-- Cadastro dos MOTIVOS de parada — a lista mestre que a coleta oferece e o
-- relatorio interpreta.
--
-- Ate' aqui os nove motivos moravam no codigo (src/domain/cronoanalise.js):
-- incluir "falta de energia" ou trocar a acao recomendada de setup exigia
-- deploy. Agora quem conhece o chao de fabrica cadastra no PC.
--
-- O CODIGO e' imutavel depois de criado, e por isso ele e' curto e sem
-- acento: e' ele que fica gravado em cada parada (tabela `paradas` e no
-- jsonb de `conferencias`). Renomear o rotulo e' seguro — o historico
-- inteiro passa a ler o nome novo; trocar o codigo orfanaria o passado.
--
-- A ACAO nao e' enfeite: e' o que a aba Sugestoes recomenda quando aquele
-- motivo domina o tempo parado. Motivo sem acao vira diagnostico sem
-- tratamento.
CREATE TABLE IF NOT EXISTS motivos_parada (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  codigo        text NOT NULL CHECK (codigo ~ '^[a-z][a-z0-9_]{1,39}$'),
  rotulo        text NOT NULL CHECK (length(btrim(rotulo)) BETWEEN 1 AND 60),
  acao          text,
  ordem         integer NOT NULL DEFAULT 0,
  -- Motivo que saiu de uso e' DESATIVADO, nao apagado: some da coleta e
  -- continua nomeando as paradas que ja' foram registradas com ele.
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS motivos_parada_codigo_unq ON motivos_parada (empresa_id, codigo);
CREATE INDEX IF NOT EXISTS motivos_parada_empresa_idx ON motivos_parada (empresa_id, ordem, criado_em);

-- ------------------------------------------------------------ configuracoes
-- Par chave/valor por empresa. Hoje guarda a chave da API de IA salva pelo
-- app (quando nao ha ANTHROPIC_API_KEY no ambiente). O valor NUNCA volta
-- inteiro para o navegador — a API devolve so' os 4 ultimos caracteres.
CREATE TABLE IF NOT EXISTS configuracoes (
  empresa_id    uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  chave         text NOT NULL,
  valor         text NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, chave)
);

-- ---------------------------------------------------------------- comentarios
-- client_id ja foi lido como "identificador do aparelho". Nao e: e uma chave
-- por LINHA, e o UNIQUE em cima dela e o que impede o ciclo de entrar duas
-- vezes quando o wifi cai no meio do envio. Fica escrito no proprio banco,
-- para quem abrir o schema sem ler o codigo.
COMMENT ON COLUMN observacoes.client_id IS
  'Chave de idempotencia da linha, gerada no aparelho ANTES de ir para a rede. Uma por registro — NAO identifica aparelho. E o que torna o reenvio da fila offline seguro: o indice UNIQUE recusa a repeticao.';
COMMENT ON COLUMN paradas.client_id      IS 'Idem observacoes.client_id: chave de idempotencia por linha, nao identificador de aparelho.';
COMMENT ON COLUMN conferencias.client_id IS 'Idem observacoes.client_id: chave de idempotencia por linha, nao identificador de aparelho.';
COMMENT ON COLUMN paradas.conferencia_id IS
  'Parada de uma conferencia rapida (ritmo da furadeira). Exclusiva com operacao_id: toda parada tem exatamente uma origem — ver paradas_origem_chk.';

-- ------------------------------------------------------------------ gatilho
CREATE OR REPLACE FUNCTION toca_atualizado_em() RETURNS trigger AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

DROP TRIGGER IF EXISTS estudos_touch ON estudos;
CREATE TRIGGER estudos_touch BEFORE UPDATE ON estudos
  FOR EACH ROW EXECUTE FUNCTION toca_atualizado_em();

DROP TRIGGER IF EXISTS usuarios_touch ON usuarios;
CREATE TRIGGER usuarios_touch BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION toca_atualizado_em();

DROP TRIGGER IF EXISTS motivos_parada_touch ON motivos_parada;
CREATE TRIGGER motivos_parada_touch BEFORE UPDATE ON motivos_parada
  FOR EACH ROW EXECUTE FUNCTION toca_atualizado_em();

-- ------------------------------------------------------------------- RLS
-- O schema `public` e exposto pelo PostgREST com a chave anonima, que vive
-- no navegador. Sem RLS, qualquer pessoa com essa chave leria e escreveria
-- todos os estudos.
--
-- Habilitamos RLS SEM policy nenhuma: nega 100% do acesso anonimo. O backend
-- do app nao passa pelo PostgREST — conecta direto no Postgres com o papel
-- `postgres`, que ignora RLS por definicao. A API segue funcionando.
--
-- Verificado: `SET ROLE anon; SELECT * FROM estudos` retorna
-- "permission denied for table estudos".
ALTER TABLE empresas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE estudos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE operacoes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE paradas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE conferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivos_parada ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes        ENABLE ROW LEVEL SECURITY;

-- Defesa em camadas: remove tambem os grants diretos dos papeis expostos.
REVOKE ALL ON empresas, usuarios, estudos, operacoes, observacoes, paradas, conferencias,
  configuracoes, motivos_parada, sessoes
  FROM anon, authenticated;

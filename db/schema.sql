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

-- ---------------------------------------------------------------- estudos
CREATE TABLE IF NOT EXISTS estudos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  criado_por     uuid REFERENCES usuarios(id) ON DELETE SET NULL,
  nome           text NOT NULL,
  produto        text,
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
CREATE TABLE IF NOT EXISTS paradas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL,
  operacao_id  uuid NOT NULL REFERENCES operacoes(id) ON DELETE CASCADE,
  motivo       text NOT NULL,
  observacao   text,
  duracao_ms   bigint NOT NULL CHECK (duracao_ms > 0),
  iniciado_em  timestamptz NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS paradas_client_unq ON paradas (client_id);
CREATE INDEX IF NOT EXISTS paradas_operacao_idx ON paradas (operacao_id);

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
ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

-- Defesa em camadas: remove tambem os grants diretos dos papeis expostos.
REVOKE ALL ON empresas, usuarios, estudos, operacoes, observacoes, paradas, configuracoes
  FROM anon, authenticated;

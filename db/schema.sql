-- RitmoProd — schema Postgres
-- Convencao: tempos em MILISSEGUNDOS (bigint), datas em timestamptz (UTC).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

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
  email       citext,
  papel       text NOT NULL DEFAULT 'analista'
              CHECK (papel IN ('admin', 'analista', 'leitor')),
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unq ON usuarios (email) WHERE email IS NOT NULL;

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

-- ------------------------------------------------------------------ gatilho
CREATE OR REPLACE FUNCTION toca_atualizado_em() RETURNS trigger AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS estudos_touch ON estudos;
CREATE TRIGGER estudos_touch BEFORE UPDATE ON estudos
  FOR EACH ROW EXECUTE FUNCTION toca_atualizado_em();

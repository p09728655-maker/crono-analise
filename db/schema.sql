-- RitmoPatrimar — schema Postgres
-- Convencao: tempos em MILISSEGUNDOS (bigint), datas em timestamptz (UTC).
--
-- ORDEM IMPORTA num banco que ja' esta' no ar: este arquivo contem passos
-- DESTRUTIVOS do fim das migracoes (derrubar hora_inicial/hora_final, a
-- autenticacao propria e a tabela sessoes). Aplique-o junto com — ou depois
-- de — publicar a versao que nao usa mais essas colunas (v2.34+). Instalacao
-- nova pode rodar o arquivo inteiro sem pensar.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------------------- identidade (auth)
-- A FONTE OFICIAL de identidade e' o Supabase Auth: senha, sessao e emissao
-- de token vivem no schema `auth`, que o Supabase mantem. `usuarios` aqui e'
-- so' PERFIL (nome, papel, empresa) — mesma linha, mesmo id, um para um.
--
-- Num Postgres local (teste/dev), o schema `auth` nao existe. Este bloco
-- cria o MINIMO que a API escreve e que as politicas leem, para os testes
-- de integracao provarem o mesmo comportamento. No Supabase ele nao faz
-- absolutamente nada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (
      instance_id        uuid,
      id                 uuid PRIMARY KEY,
      aud                text,
      role               text,
      email              text,
      encrypted_password text,
      email_confirmed_at timestamptz,
      created_at         timestamptz,
      updated_at         timestamptz,
      raw_app_meta_data  jsonb,
      raw_user_meta_data jsonb,
      confirmation_token text,
      recovery_token     text,
      email_change_token_new text,
      email_change       text,
      is_sso_user        boolean DEFAULT false,
      is_anonymous       boolean DEFAULT false
    );
    CREATE TABLE auth.identities (
      id             uuid PRIMARY KEY,
      user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      provider_id    text,
      provider       text,
      identity_data  jsonb,
      last_sign_in_at timestamptz,
      created_at     timestamptz,
      updated_at     timestamptz
    );
    CREATE TABLE auth.sessions (
      id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
    );
    -- A mesma definicao do Supabase: o "quem" sai das claims do JWT que a
    -- API poe na transacao (request.jwt.claims).
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $f$ SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $f$;
  END IF;
END $$;

-- A API chama extensions.crypt/gen_salt (bcrypt, o formato que o GoTrue
-- confere). No Supabase o pgcrypto ja' mora em `extensions`; num banco local
-- ele acabou de nascer em `public` — muda de casa aqui.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'extensions' AND p.proname = 'crypt'
  ) THEN
    ALTER EXTENSION pgcrypto SET SCHEMA extensions;
  END IF;
END $$;

-- Papeis que o Supabase ja' tem e um banco local nao: as politicas de RLS
-- abaixo sao concedidas a `authenticated`, entao ele precisa existir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

-- ---------------------------------------------------------------- empresas
CREATE TABLE IF NOT EXISTS empresas (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  documento   text,                       -- CPF (autonomo) ou CNPJ
  criado_em   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- usuarios
-- PERFIL de uma conta do Supabase Auth: id = auth.users.id, um para um.
-- Senha NAO mora aqui — nunca mais. 'coletor' e' o papel do TABLET pareado
-- (api/dispositivos.js): um aparelho com identidade propria, que so' coleta.
CREATE TABLE IF NOT EXISTS usuarios (
  id          uuid PRIMARY KEY,
  empresa_id  uuid NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome        text NOT NULL,
  email       text,
  papel       text NOT NULL DEFAULT 'analista'
              CHECK (papel IN ('admin', 'analista', 'leitor', 'coletor')),
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
-- Indice funcional em lower(email): unicidade sem diferenciar caixa, sem
-- depender da extensao citext (que o linter do Supabase sinaliza no schema public).
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unq ON usuarios (lower(email)) WHERE email IS NOT NULL;

-- Banco que ja' existia: o CHECK antigo nao conhecia 'coletor', e o id tinha
-- DEFAULT proprio (agora ele vem SEMPRE do auth.users).
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_papel_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check
  CHECK (papel IN ('admin', 'analista', 'leitor', 'coletor'));
ALTER TABLE usuarios ALTER COLUMN id DROP DEFAULT;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso_em timestamptz;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS atualizado_em    timestamptz NOT NULL DEFAULT now();
-- Perfil profissional, do desenho de cadastro do PCP. Nenhum obrigatorio:
-- quem nao souber o cargo de alguem nao pode ficar impedido de cadastra-lo.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS area  text;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS setor text;

-- A tela de Analistas lista os ativos da empresa a cada abertura. Parcial
-- porque inativo quase nunca e' consultado.
CREATE INDEX IF NOT EXISTS usuarios_empresa_idx ON usuarios (empresa_id) WHERE ativo;

-- O laco com a identidade oficial: perfil sem conta nao existe. So' entra
-- quando todo usuario ja' tem a conta correspondente (fase B da migracao) —
-- num banco novo, e' imediato.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM usuarios u
     WHERE NOT EXISTS (SELECT 1 FROM auth.users a WHERE a.id = u.id)
  ) THEN
    RAISE NOTICE 'usuarios_auth_fkey adiada: ha usuario sem conta no auth.users. Ligue-os antes (fase B).';
  ELSE
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_auth_fkey;
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_auth_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- A autenticacao propria (scrypt + tabela sessoes) saiu: era um segundo
-- sistema de login dentro de `public`, exatamente o que o Supabase Auth ja'
-- faz. Derrubar perde no maximo a senha e a sessao de teste da transicao.
ALTER TABLE usuarios DROP COLUMN IF EXISTS senha_hash;
ALTER TABLE usuarios DROP COLUMN IF EXISTS senha_salt;
DROP TABLE IF EXISTS sessoes;

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
  -- "_legado" no nome diz o que ele e': registro do passado, nao o vinculo.
  analista_legado text,
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

-- Banco que ja' existia: o texto digitado passa a se chamar pelo que e'.
-- Renomear (e nao remover) preserva a unica autoria que os estudos antigos
-- tem, ate' cada um ser ligado a um usuario pela tela Editar estudo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'estudos' AND column_name = 'analista'
  ) THEN
    ALTER TABLE estudos RENAME COLUMN analista TO analista_legado;
  END IF;
END $$;

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
  -- O periodo como INSTANTE. Texto nao subtrai: com "HH:MM" (o formato
  -- antigo, hora_inicial/hora_final) a duracao tinha de vir gravada a parte,
  -- o banco nao conseguia validar a ordem e um periodo que atravessa a
  -- meia-noite nao tinha representacao possivel.
  --
  -- O APARELHO CONTINUA MANDANDO "HH:MM" — e' o que ele sabe dizer, e mexer
  -- nisso obrigaria o tablet que passou dias sem rede a falar uma lingua
  -- nova. Quem compoe o instante e' o servidor, em /api/sync.
  iniciado_em   timestamptz,
  finalizado_em timestamptz,
  duracao_ms   bigint  NOT NULL CHECK (duracao_ms > 0),
  pecas        integer NOT NULL CHECK (pecas > 0),
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
-- As colunas do formato antigo, para o UPDATE de conversao logo abaixo
-- encontrar o que converter num banco que ainda nao passou pelo passo 1.
ALTER TABLE conferencias ADD COLUMN IF NOT EXISTS hora_inicial text;
ALTER TABLE conferencias ADD COLUMN IF NOT EXISTS hora_final   text;
ALTER TABLE conferencias ADD COLUMN IF NOT EXISTS paradas jsonb NOT NULL DEFAULT '[]'::jsonb;

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

-- ------------------------------------------------- passo 3 da migracao
-- Derruba o formato antigo, DEPOIS de a conversao acima ter rodado e de as
-- paradas terem virado linha. E' a ultima etapa da refatoracao do periodo:
-- ate' aqui as duas formas conviviam para um deploy poder voltar atras.
--
-- Nao ha' o que perder: iniciado_em/finalizado_em carregam o mesmo periodo
-- com mais precisao, e a parada da conferencia agora e' linha na tabela
-- `paradas`, alcancada por conferencia_id.
ALTER TABLE conferencias DROP COLUMN IF EXISTS hora_inicial;
ALTER TABLE conferencias DROP COLUMN IF EXISTS hora_final;
ALTER TABLE conferencias DROP COLUMN IF EXISTS paradas;

-- A partir daqui todo periodo tem os dois instantes. O DO guarda o caso de
-- um banco com linha antiga sem conversao: melhor deixar a coluna aceitando
-- nulo do que a migracao inteira falhar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM conferencias WHERE iniciado_em IS NULL OR finalizado_em IS NULL
  ) THEN
    ALTER TABLE conferencias ALTER COLUMN iniciado_em   SET NOT NULL;
    ALTER TABLE conferencias ALTER COLUMN finalizado_em SET NOT NULL;
  END IF;
END $$;

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
-- A seguranca MORA AQUI, nao na tela. A API verifica o JWT do Supabase e
-- entra na transacao como o papel `authenticated`, com as claims em
-- request.jwt.claims (api/_lib/db.js) — dai' em diante e' o banco que
-- decide, linha a linha, o que aquele usuario alcanca. Um WHERE esquecido
-- em qualquer consulta nova nao expoe dado de outra empresa: o Postgres
-- barra sozinho.
--
-- Papeis do sistema (usuarios.papel):
--   admin    tudo da propria empresa, inclusive os segredos (configuracoes)
--   analista mede e escreve o dominio; nao mexe em cadastro nem segredo
--   leitor   so' le
--   coletor  o TABLET pareado: coleta (estudos, operacoes, ciclos, paradas,
--            conferencias) e nada de administracao

-- As funcoes que sustentam tudo. SECURITY DEFINER nao e' enfeite: sem ele,
-- a politica de `usuarios` consultaria `usuarios` e entraria em recursao
-- infinita. search_path = '' fecha a porta de sequestro de esquema.
CREATE OR REPLACE FUNCTION public.empresa_atual()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT empresa_id FROM public.usuarios WHERE id = auth.uid() AND ativo
$$;

CREATE OR REPLACE FUNCTION public.papel_atual()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT papel FROM public.usuarios WHERE id = auth.uid() AND ativo
$$;

-- Coletar = registrar medicao e montar estudo. Inclui o tablet.
CREATE OR REPLACE FUNCTION public.pode_coletar()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.papel_atual() IN ('admin', 'analista', 'coletor')
$$;

-- Escrever de ANALISE (arquivar conferencia, marcar parada no PC, descartar
-- ciclo): trabalho de gente, nao de aparelho.
CREATE OR REPLACE FUNCTION public.pode_escrever()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT public.papel_atual() IN ('admin', 'analista')
$$;

-- A empresa chega pelo estudo — uma funcao evita repetir o EXISTS.
CREATE OR REPLACE FUNCTION public.estudo_e_meu(p_estudo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.estudos e
                  WHERE e.id = p_estudo AND e.empresa_id = public.empresa_atual())
$$;

CREATE OR REPLACE FUNCTION public.operacao_e_minha(p_operacao uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.operacoes o
                    JOIN public.estudos e ON e.id = o.estudo_id
                  WHERE o.id = p_operacao AND e.empresa_id = public.empresa_atual())
$$;

-- A origem da parada e' exclusiva (paradas_origem_chk): uma funcao cobre as duas.
CREATE OR REPLACE FUNCTION public.parada_e_minha(p_operacao uuid, p_conferencia uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE
    WHEN p_operacao IS NOT NULL THEN public.operacao_e_minha(p_operacao)
    WHEN p_conferencia IS NOT NULL THEN EXISTS (
      SELECT 1 FROM public.conferencias c
       WHERE c.id = p_conferencia AND c.empresa_id = public.empresa_atual())
    ELSE false END
$$;

-- Estudo sem nenhum ciclo coletado: e' o unico que nao-admin pode APAGAR —
-- a mesma regra que a API sempre teve (com ciclo, arquiva; sem, exclui).
CREATE OR REPLACE FUNCTION public.estudo_sem_ciclos(p_estudo uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.observacoes ob
      JOIN public.operacoes o ON o.id = ob.operacao_id
     WHERE o.estudo_id = p_estudo)
$$;

ALTER TABLE empresas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios       ENABLE ROW LEVEL SECURITY;
ALTER TABLE estudos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE operacoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE observacoes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE paradas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conferencias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE motivos_parada ENABLE ROW LEVEL SECURITY;

-- empresas: cada um ve so' a sua. Criar empresa e' operacao de plataforma,
-- fora do alcance de usuario.
DROP POLICY IF EXISTS empresas_le ON empresas;
CREATE POLICY empresas_le ON empresas FOR SELECT TO authenticated
  USING (id = public.empresa_atual());
DROP POLICY IF EXISTS empresas_admin_atualiza ON empresas;
CREATE POLICY empresas_admin_atualiza ON empresas FOR UPDATE TO authenticated
  USING (id = public.empresa_atual() AND public.papel_atual() = 'admin')
  WITH CHECK (id = public.empresa_atual());

-- usuarios: a empresa inteira se ve (a tela de Analistas e a escolha do
-- analista no estudo dependem disso). Cada um edita o proprio perfil;
-- cadastro, papel e ativacao sao de admin.
DROP POLICY IF EXISTS usuarios_le ON usuarios;
CREATE POLICY usuarios_le ON usuarios FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual());
DROP POLICY IF EXISTS usuarios_admin_cria ON usuarios;
CREATE POLICY usuarios_admin_cria ON usuarios FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.empresa_atual() AND public.papel_atual() = 'admin');
DROP POLICY IF EXISTS usuarios_atualiza ON usuarios;
CREATE POLICY usuarios_atualiza ON usuarios FOR UPDATE TO authenticated
  USING (empresa_id = public.empresa_atual()
         AND (id = auth.uid() OR public.papel_atual() = 'admin'))
  WITH CHECK (empresa_id = public.empresa_atual());
DROP POLICY IF EXISTS usuarios_admin_apaga ON usuarios;
CREATE POLICY usuarios_admin_apaga ON usuarios FOR DELETE TO authenticated
  USING (empresa_id = public.empresa_atual() AND public.papel_atual() = 'admin');

-- estudos: quem coleta cria e edita. Apagar estudo COM ciclos e' so' de
-- admin — e' a perda irrecuperavel do sistema (CASCADE leva os ciclos).
DROP POLICY IF EXISTS estudos_le ON estudos;
CREATE POLICY estudos_le ON estudos FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual());
DROP POLICY IF EXISTS estudos_cria ON estudos;
CREATE POLICY estudos_cria ON estudos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.empresa_atual() AND public.pode_coletar());
DROP POLICY IF EXISTS estudos_atualiza ON estudos;
CREATE POLICY estudos_atualiza ON estudos FOR UPDATE TO authenticated
  USING (empresa_id = public.empresa_atual() AND public.pode_coletar())
  WITH CHECK (empresa_id = public.empresa_atual());
DROP POLICY IF EXISTS estudos_apaga ON estudos;
CREATE POLICY estudos_apaga ON estudos FOR DELETE TO authenticated
  USING (empresa_id = public.empresa_atual()
         AND (public.papel_atual() = 'admin'
              OR (public.pode_coletar() AND public.estudo_sem_ciclos(id))));

-- operacoes: estrutura do estudo — quem coleta monta e desmonta.
DROP POLICY IF EXISTS operacoes_le ON operacoes;
CREATE POLICY operacoes_le ON operacoes FOR SELECT TO authenticated
  USING (public.estudo_e_meu(estudo_id));
DROP POLICY IF EXISTS operacoes_escreve ON operacoes;
CREATE POLICY operacoes_escreve ON operacoes FOR ALL TO authenticated
  USING (public.estudo_e_meu(estudo_id) AND public.pode_coletar())
  WITH CHECK (public.estudo_e_meu(estudo_id) AND public.pode_coletar());

-- observacoes: o ciclo NASCE de quem coleta; descartar (UPDATE) e' decisao
-- de analise; apagar de vez, so' admin.
DROP POLICY IF EXISTS observacoes_le ON observacoes;
CREATE POLICY observacoes_le ON observacoes FOR SELECT TO authenticated
  USING (public.operacao_e_minha(operacao_id));
DROP POLICY IF EXISTS observacoes_cria ON observacoes;
CREATE POLICY observacoes_cria ON observacoes FOR INSERT TO authenticated
  WITH CHECK (public.operacao_e_minha(operacao_id) AND public.pode_coletar());
DROP POLICY IF EXISTS observacoes_atualiza ON observacoes;
CREATE POLICY observacoes_atualiza ON observacoes FOR UPDATE TO authenticated
  USING (public.operacao_e_minha(operacao_id) AND public.pode_escrever())
  WITH CHECK (public.operacao_e_minha(operacao_id));
DROP POLICY IF EXISTS observacoes_admin_apaga ON observacoes;
CREATE POLICY observacoes_admin_apaga ON observacoes FOR DELETE TO authenticated
  USING (public.operacao_e_minha(operacao_id) AND public.papel_atual() = 'admin');

-- paradas: nascem na coleta (tablet inclusive); corrigir e apagar sao da
-- analise no PC (a lista de paradas da conferencia regrava inteira).
DROP POLICY IF EXISTS paradas_le ON paradas;
CREATE POLICY paradas_le ON paradas FOR SELECT TO authenticated
  USING (public.parada_e_minha(operacao_id, conferencia_id));
DROP POLICY IF EXISTS paradas_cria ON paradas;
CREATE POLICY paradas_cria ON paradas FOR INSERT TO authenticated
  WITH CHECK (public.parada_e_minha(operacao_id, conferencia_id) AND public.pode_coletar());
DROP POLICY IF EXISTS paradas_atualiza ON paradas;
CREATE POLICY paradas_atualiza ON paradas FOR UPDATE TO authenticated
  USING (public.parada_e_minha(operacao_id, conferencia_id) AND public.pode_escrever())
  WITH CHECK (public.parada_e_minha(operacao_id, conferencia_id));
DROP POLICY IF EXISTS paradas_apaga ON paradas;
CREATE POLICY paradas_apaga ON paradas FOR DELETE TO authenticated
  USING (public.parada_e_minha(operacao_id, conferencia_id) AND public.pode_escrever());

-- conferencias: nascem na coleta; arquivar/marcar parada e' analise;
-- excluir medicao e' admin — a operacao sem volta deste relatorio.
DROP POLICY IF EXISTS conferencias_le ON conferencias;
CREATE POLICY conferencias_le ON conferencias FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual());
DROP POLICY IF EXISTS conferencias_cria ON conferencias;
CREATE POLICY conferencias_cria ON conferencias FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.empresa_atual() AND public.pode_coletar());
DROP POLICY IF EXISTS conferencias_atualiza ON conferencias;
CREATE POLICY conferencias_atualiza ON conferencias FOR UPDATE TO authenticated
  USING (empresa_id = public.empresa_atual() AND public.pode_escrever())
  WITH CHECK (empresa_id = public.empresa_atual());
DROP POLICY IF EXISTS conferencias_admin_apaga ON conferencias;
CREATE POLICY conferencias_admin_apaga ON conferencias FOR DELETE TO authenticated
  USING (empresa_id = public.empresa_atual() AND public.papel_atual() = 'admin');

-- motivos_parada: todo mundo le (a coleta precisa da lista), so' admin mexe
-- — e' a lista que da' nome a toda parada ja' registrada.
DROP POLICY IF EXISTS motivos_le ON motivos_parada;
CREATE POLICY motivos_le ON motivos_parada FOR SELECT TO authenticated
  USING (empresa_id = public.empresa_atual());
DROP POLICY IF EXISTS motivos_admin ON motivos_parada;
CREATE POLICY motivos_admin ON motivos_parada FOR ALL TO authenticated
  USING (empresa_id = public.empresa_atual() AND public.papel_atual() = 'admin')
  WITH CHECK (empresa_id = public.empresa_atual() AND public.papel_atual() = 'admin');

-- configuracoes: GUARDA SEGREDO (a chave da IA). Nem o leitor nem o
-- analista enxergam — e o codigo de pareamento tambem mora aqui.
DROP POLICY IF EXISTS configuracoes_admin ON configuracoes;
CREATE POLICY configuracoes_admin ON configuracoes FOR ALL TO authenticated
  USING (empresa_id = public.empresa_atual() AND public.papel_atual() = 'admin')
  WITH CHECK (empresa_id = public.empresa_atual() AND public.papel_atual() = 'admin');

-- Contraintuitivo e importante: `authenticated` PRECISA do GRANT para a
-- politica ter o que filtrar. Sem GRANT o Postgres recusa antes de olhar a
-- politica — e "permission denied" onde se esperava "0 linhas" leva a
-- diagnosticar o problema errado. `anon` fica sem nada: nao existe acesso
-- anonimo neste sistema.
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON empresas, usuarios, estudos, operacoes,
  observacoes, paradas, conferencias, configuracoes, motivos_parada TO authenticated;
REVOKE ALL ON empresas, usuarios, estudos, operacoes, observacoes, paradas,
  conferencias, configuracoes, motivos_parada FROM anon;

# RitmoProd — Estudo de Tempos

Cronoanálise e estudo de tempos para chão de fábrica. **Patrimar Móveis.**

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

## Rodando localmente

```bash
npm install
cp .env.example .env      # preencha os valores
npm run dev               # front em http://localhost:5173
```

### Testes

```bash
npm test                  # domínio (puro, sem dependências)
npm run test:e2e          # navegador — exige `npm run dev` na porta 5199

# Integração da API (exige um Postgres com o schema aplicado)
TEST_DATABASE_URL=postgres://... npx vitest run test/api.integracao.test.js
```

---

## Banco (Supabase)

1. Crie o projeto em [supabase.com](https://supabase.com).
2. Aplique o schema em **SQL Editor**:

   ```bash
   psql "$DATABASE_URL" -f db/schema.sql
   ```

3. Crie a empresa e guarde o UUID — ele vai em `EMPRESA_ID`:

   ```sql
   INSERT INTO empresas (nome) VALUES ('Patrimar Móveis') RETURNING id;
   ```

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

---

## Arquitetura

```
src/
  domain/        fórmulas puras e testáveis (sem React, sem rede)
  lib/           fila offline (IndexedDB), cliente HTTP, hooks
  theme/         tokens de design (paleta Patrimar)
  features/
    coleta/      tela de cronometragem no posto
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

### Duas limitações da carta ±3σ, documentadas em teste

1. **Com n ≤ 10 a carta não consegue acusar nada.** O limite matemático é
   `max|x − média| / σ ≤ (n−1)/√n`, que para n = 10 dá 2,85 — menor que 3 por
   construção. Como a meta usual de coleta é ~10 ciclos, a carta só começa a
   funcionar a partir de n = 11.
2. **Um outlier grosseiro isolado mascara a si mesmo**, porque infla o próprio
   σ. Uma série de ~1000 ms com um ciclo de 5000 ms eleva o LSC de 1018 ms
   para 5444 ms, e o ponto absurdo passa a caber dentro dos limites.

Por isso a tela de coleta usa **detecção robusta (mediana + MAD)**, que não se
deixa arrastar por pontos extremos e avisa o analista na hora, enquanto ainda
dá tempo de descartar o ciclo.

---

## Ainda não portado do app antigo

- Gráfico Yamazumi e balanceamento de linha
- Painel de OEE (a fórmula existe em `src/domain/`, falta a tela)
- Exportação para Excel e relatórios de impressão
- Cadastro de usuários e papéis

# Versão anterior (referência)

`index-5-logo2.html` é o app original: um bundle React+Vite de 847 KB já
compilado e minificado, sem código-fonte e sem sourcemap.

Está preservado aqui **apenas como referência** para portar as telas que
ainda faltam (Yamazumi, balanceamento, OEE, exportação Excel, relatórios
de impressão, cadastro de usuários).

Não é servido em produção: o `vercel.json` publica `dist/`, gerado pelo build.

Cuidado ao consultá-lo: a versão original guardava a chave da API Anthropic
no `localStorage` do navegador. Esse comportamento **não** deve ser portado.

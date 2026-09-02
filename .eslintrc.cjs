/**
 * O minimo que o build nao pega: variavel usada sem existir.
 *
 * O Vite empacota `faixaHoraria(x)` sem reclamar mesmo que ninguem tenha
 * importado faixaHoraria — o erro so' aparece quando a janela abre, na mao
 * do usuario. Foi assim que uma refatoracao deixou o cadastro de paradas
 * sem abrir. Este arquivo existe para o `npm run lint` acusar isso antes
 * do commit; nao e' guia de estilo.
 */
module.exports = {
  root: true,
  parserOptions: { ecmaVersion: 2023, sourceType: 'module', ecmaFeatures: { jsx: true } },
  env: { browser: true, node: true, es2023: true },
  plugins: ['react'],
  settings: { react: { version: '18.3' } },
  rules: {
    'no-undef': 'error',
    'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true }],
    'no-dupe-keys': 'error',
    'no-unreachable': 'error',
    'react/jsx-uses-vars': 'error',
    'react/jsx-no-undef': 'error',
  },
};

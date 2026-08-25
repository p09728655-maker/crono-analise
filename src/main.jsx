import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LimiteDeErro from './components/LimiteDeErro.jsx';

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    {/* Uma excecao de renderizacao viraria tela branca sem isto. */}
    <LimiteDeErro>
      <App />
    </LimiteDeErro>
  </StrictMode>,
);

/**
 * Rotas que nao dependem de aparelho (as demais vivem no e2e de navegacao,
 * porque a raiz decide por window/matchMedia e precisa de navegador).
 */
import { describe, expect, it } from 'vitest';
import { analisarCaminho, caminhos } from '../src/lib/dispositivo.js';

describe('conferencia rapida na URL', () => {
  it('/coleta/rapida abre a conferencia, sem estudo nenhum', () => {
    const r = analisarCaminho('/coleta/rapida');
    expect(r).toEqual({ modo: 'coleta', tela: 'rapida', estudoId: null, operacaoId: null });
  });

  it('aceita barra final e maiusculas, como as outras rotas', () => {
    expect(analisarCaminho('/coleta/rapida/').tela).toBe('rapida');
    expect(analisarCaminho('/Coleta/Rapida').tela).toBe('rapida');
  });

  it('caminhos.rapida monta a URL canonica', () => {
    expect(caminhos.rapida()).toBe('/coleta/rapida');
  });

  it('/analise/conferencias abre o relatorio por maquina', () => {
    const r = analisarCaminho('/analise/conferencias');
    expect(r).toEqual({ modo: 'analise', tela: 'conferencias', estudoId: null, operacaoId: null });
    expect(caminhos.conferencias()).toBe('/analise/conferencias');
  });

  it('query string nao quebra a rota — o "?editar=1" da lista precisa chegar', () => {
    const id = 'b17e849c-da3f-4d8c-a262-81e8748c589b';
    const r = analisarCaminho(`/analise/estudo/${id}?editar=1`);
    expect(r.tela).toBe('estudo');
    expect(r.estudoId).toBe(id);
    expect(r.padrao).toBeUndefined();
    // Ancora tambem nao pode derrubar a rota.
    expect(analisarCaminho('/coleta/rapida#topo').tela).toBe('rapida');
    expect(analisarCaminho('/analise?utm=x').tela).toBe('lista');
  });

  it('nao engole a lista nem a rota de estudo', () => {
    expect(analisarCaminho('/coleta').tela).toBe('lista');
    const id = 'b17e849c-da3f-4d8c-a262-81e8748c589b';
    expect(analisarCaminho(`/coleta/estudo/${id}`).tela).toBe('estudo');
  });
});

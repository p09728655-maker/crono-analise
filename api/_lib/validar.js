/**
 * Validacao de entrada. Toda a API passa por aqui antes de tocar o banco.
 * As checagens espelham as CHECK constraints do schema, para o usuario
 * receber 400 com mensagem util em vez de 500 vindo do Postgres.
 */
import { erroValidacao } from './http.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuid(valor, campo) {
  if (typeof valor !== 'string' || !UUID_RE.test(valor)) {
    throw erroValidacao(`Campo "${campo}" deve ser um UUID valido`);
  }
  return valor;
}

export function texto(valor, campo, { obrigatorio = false, max = 500 } = {}) {
  if (valor == null || valor === '') {
    if (obrigatorio) throw erroValidacao(`Campo "${campo}" e obrigatorio`);
    return null;
  }
  const s = String(valor).trim();
  if (obrigatorio && !s) throw erroValidacao(`Campo "${campo}" e obrigatorio`);
  if (s.length > max) throw erroValidacao(`Campo "${campo}" excede ${max} caracteres`);
  return s || null;
}

export function inteiro(valor, campo, { min = -Infinity, max = Infinity, padrao = null } = {}) {
  if (valor == null || valor === '') return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw erroValidacao(`Campo "${campo}" deve ser um numero inteiro`);
  }
  if (n < min || n > max) throw erroValidacao(`Campo "${campo}" deve estar entre ${min} e ${max}`);
  return n;
}

export function decimal(valor, campo, { min = -Infinity, max = Infinity, padrao = null } = {}) {
  if (valor == null || valor === '') return padrao;
  const n = Number(valor);
  if (!Number.isFinite(n)) throw erroValidacao(`Campo "${campo}" deve ser numerico`);
  if (n < min || n > max) throw erroValidacao(`Campo "${campo}" deve estar entre ${min} e ${max}`);
  return n;
}

export function dataIso(valor, campo, { padrao = null } = {}) {
  if (!valor) return padrao;
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) throw erroValidacao(`Campo "${campo}" nao e uma data valida`);
  return d.toISOString();
}

export function lista(valor, campo, { max = 500 } = {}) {
  if (!Array.isArray(valor)) throw erroValidacao(`Campo "${campo}" deve ser uma lista`);
  if (valor.length > max) {
    throw erroValidacao(`Campo "${campo}" excede o limite de ${max} itens por requisicao`);
  }
  return valor;
}

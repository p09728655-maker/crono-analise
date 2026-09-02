/** "26/08 10:45" — curto o bastante para caber na linha do historico. */
export function dataCurta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** A hora de agora, como o campo <input type="time"> escreve: "07:05". */
export function agoraHM() {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

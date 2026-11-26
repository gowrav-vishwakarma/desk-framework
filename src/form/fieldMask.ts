/**
 * A field mask is a pattern, one character per position: `A` a letter, `9` a digit, `*` either.
 * What is typed or pasted is read in order and each character goes to the next open position if it fits;
 * a character that does not fit is dropped, and the position waits for one that does. Anything that is not a
 * letter or digit (spaces, dashes) is dropped. Letters are upper-cased when the pattern takes letters.
 * The result is never longer than the pattern. The framework names no formats: a product keeps its own patterns.
 */
export function applyDeskMask(value: string, pattern: string): string {
  const letters = /[A*]/.test(pattern);
  const text = letters ? value.toUpperCase() : value;
  let out = '';
  for (const char of text) {
    if (out.length >= pattern.length) break;
    const want = pattern[out.length];
    const digit = char >= '0' && char <= '9';
    const letter = char >= 'A' && char <= 'Z';
    if ((want === '9' && digit) || (want === 'A' && letter) || (want === '*' && (digit || letter)))
      out += char;
  }
  return out;
}

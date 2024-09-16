export function toBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const length = bytes.byteLength;

  for (let i = 0; i < length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

export function generateId(prefix) {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}`;
}

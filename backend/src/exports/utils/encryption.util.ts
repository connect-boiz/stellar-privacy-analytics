export function decrypt(row: any) {
  return {
    ...row,
    data: row.data.replace('encrypted-', 'decrypted-'),
  };
}
export async function* chunkReader(chunkSize = 1000) {
  let i = 0;
  while (i < 10000) {
    const chunk = Array.from({ length: chunkSize }, (_, idx) => ({
      id: i + idx,
      data: `encrypted-${i + idx}`,
    }));

    yield chunk;
    i += chunkSize;
  }
}
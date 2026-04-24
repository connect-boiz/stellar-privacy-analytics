// Web Worker for client-side file hashing
// This runs in a separate thread to avoid blocking the UI

self.addEventListener('message', async (e) => {
  const { type, file } = e.data;

  if (type === 'hash') {
    try {
      const hash = await calculateFileHash(file);
      self.postMessage({ type: 'complete', hash });
    } catch (error) {
      self.postMessage({ type: 'error', error: error.message });
    }
  }
});

async function calculateFileHash(file: File): Promise<string> {
  const chunkSize = 64 * 1024 * 1024; // 64MB chunks
  const chunks = Math.ceil(file.size / chunkSize);
  let hash = await crypto.subtle.digest('SHA-256', new ArrayBuffer(0));

  for (let i = 0; i < chunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunk = file.slice(start, end);
    
    // Calculate hash for this chunk
    const chunkBuffer = await chunk.arrayBuffer();
    const chunkHash = await crypto.subtle.digest('SHA-256', chunkBuffer);
    
    // Combine with previous hash
    const combined = new Uint8Array(hash.byteLength + chunkHash.byteLength);
    combined.set(new Uint8Array(hash), 0);
    combined.set(new Uint8Array(chunkHash), hash.byteLength);
    
    hash = await crypto.subtle.digest('SHA-256', combined.buffer);
    
    // Report progress
    const progress = Math.round(((i + 1) / chunks) * 100);
    self.postMessage({ type: 'progress', progress });
  }

  // Convert hash to hex string
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

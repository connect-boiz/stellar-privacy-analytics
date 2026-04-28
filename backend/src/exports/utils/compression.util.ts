import * as zlib from 'zlib';
import * as fs from 'fs';

export function compress(filePath: string) {
  const gzip = zlib.createGzip();
  const input = fs.createReadStream(filePath);
  const output = fs.createWriteStream(filePath + '.gz');

  input.pipe(gzip).pipe(output);

  return filePath + '.gz';
}
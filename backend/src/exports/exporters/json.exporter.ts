import * as fs from 'fs';

export class JsonExporter {
  private path = `export-${Date.now()}.json`;
  private stream = fs.createWriteStream(this.path);
  private first = true;

  constructor() {
    this.stream.write('[');
  }

  async write(rows: any[]) {
    for (const row of rows) {
      if (!this.first) this.stream.write(',');
      this.stream.write(JSON.stringify(row));
      this.first = false;
    }
  }

  async close() {
    this.stream.write(']');
    this.stream.end();
    return this.path;
  }
}
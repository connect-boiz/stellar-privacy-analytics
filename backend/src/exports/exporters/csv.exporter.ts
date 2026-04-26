import * as fs from 'fs';

export class CsvExporter {
  private path = `export-${Date.now()}.csv`;
  private stream = fs.createWriteStream(this.path);

  async write(rows: any[]) {
    for (const row of rows) {
      this.stream.write(Object.values(row).join(',') + '\n');
    }
  }

  async close() {
    this.stream.end();
    return this.path;
  }
}
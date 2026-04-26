import { ParquetWriter, ParquetSchema } from 'parquetjs';

export class ParquetExporter {
  private writer;
  private path = `export-${Date.now()}.parquet`;

  async init() {
    const schema = new ParquetSchema({
      id: { type: 'INT64' },
      data: { type: 'UTF8' },
    });

    this.writer = await ParquetWriter.openFile(schema, this.path);
  }

  async write(rows: any[]) {
    if (!this.writer) await this.init();

    for (const row of rows) {
      await this.writer.appendRow(row);
    }
  }

  async close() {
    await this.writer.close();
    return this.path;
  }
}
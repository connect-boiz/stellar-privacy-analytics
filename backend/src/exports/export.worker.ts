import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ExportRepository } from './export.repository';
import { chunkReader } from './utils/chunk-reader';
import { decrypt } from './utils/encryption.util';
import { CsvExporter } from './exporters/csv.exporter';
import { JsonExporter } from './exporters/json.exporter';
import { ParquetExporter } from './exporters/parquet.exporter';

@Processor('export-queue')
export class ExportWorker extends WorkerHost {
  constructor(private readonly repo: ExportRepository) {
    super();
  }

  async process(job: Job<{ exportId: string }>) {
    const exportJob = await this.repo.findOne({
      where: { id: job.data.exportId },
    });

    if (!exportJob) return;

    try {
      exportJob.status = 'processing';
      await this.repo.save(exportJob);

      const writer = this.getWriter(exportJob.format);

      let processed = 0;
      const total = 100000; // mock total

      for await (const chunk of chunkReader()) {
        if (exportJob.paused) return;

        const decrypted = chunk.map((row) => decrypt(row));

        await writer.write(decrypted);

        processed += chunk.length;

        exportJob.progress = Math.round((processed / total) * 100);
        await this.repo.save(exportJob);
      }

      const filePath = await writer.close();

      exportJob.status = 'completed';
      exportJob.filePath = filePath;

      await this.repo.save(exportJob);
    } catch (err) {
      exportJob.status = 'failed';
      exportJob.error = err.message;

      await this.repo.save(exportJob);
      throw err;
    }
  }

  private getWriter(format: string) {
    if (format === 'csv') return new CsvExporter();
    if (format === 'json') return new JsonExporter();
    return new ParquetExporter();
  }
}
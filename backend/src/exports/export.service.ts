import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ExportRepository } from './export.repository';
import { CreateExportDto } from './dto/create-export.dto';
import { Response } from 'express';
import * as fs from 'fs';

@Injectable()
export class ExportService {
  constructor(
    private readonly exportRepo: ExportRepository,
    @InjectQueue('export-queue') private queue: Queue,
  ) {}

  async createExport(dto: CreateExportDto) {
    const job = await this.exportRepo.save({
      ...dto,
      status: 'pending',
    });

    await this.queue.add('export-job', { exportId: job.id });

    return job;
  }

  async getExportStatus(id: string) {
    const job = await this.exportRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException();
    return job;
  }

  async downloadFile(id: string, res: Response) {
    const job = await this.exportRepo.findOne({ where: { id } });

    if (!job || job.status !== 'completed') {
      throw new NotFoundException('File not ready');
    }

    const stream = fs.createReadStream(job.filePath);
    stream.pipe(res);
  }
}
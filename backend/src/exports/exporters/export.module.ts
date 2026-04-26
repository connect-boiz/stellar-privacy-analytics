import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExportEntity } from './export.entity';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { ExportRepository } from './export.repository';
import { ExportWorker } from './export.worker';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExportEntity]),
    BullModule.registerQueue({
      name: 'export-queue',
    }),
  ],
  controllers: [ExportController],
  providers: [ExportService, ExportRepository, ExportWorker],
})
export class ExportModule {}
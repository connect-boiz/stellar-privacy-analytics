import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ExportEntity } from './export.entity';

@Injectable()
export class ExportRepository extends Repository<ExportEntity> {
  constructor(private dataSource: DataSource) {
    super(ExportEntity, dataSource.createEntityManager());
  }
}
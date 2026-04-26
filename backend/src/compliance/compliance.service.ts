import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ComplianceScan } from './entities/compliance-scan.entity';
import { Violation } from './entities/violation.entity';
import { ComplianceRule } from './entities/compliance-rule.entity';

@Injectable()
export class ComplianceService {
  constructor(
    @InjectQueue('compliance-queue') private queue: Queue,

    @InjectRepository(ComplianceScan)
    private scanRepo: Repository<ComplianceScan>,

    @InjectRepository(Violation)
    private violationRepo: Repository<Violation>,

    @InjectRepository(ComplianceRule)
    private ruleRepo: Repository<ComplianceRule>,
  ) {}

  async runScan(regulation: string) {
    return this.queue.add('run-scan', { regulation });
  }

  async getDashboard() {
    const scans = await this.scanRepo.find();

    const grouped = {};

    for (const scan of scans) {
      grouped[scan.regulation] = {
        score: scan.score,
        status: scan.status,
      };
    }

    return grouped;
  }

  async createRule(data: Partial<ComplianceRule>) {
    return this.ruleRepo.save(data);
  }
}
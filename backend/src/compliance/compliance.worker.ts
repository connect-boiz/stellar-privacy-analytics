import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ComplianceRule } from './entities/compliance-rule.entity';
import { Violation } from './entities/violation.entity';
import { ComplianceScan } from './entities/compliance-scan.entity';

import { RuleExecutor } from './rules-engine/rule.executor';
import { ScoreService } from './services/score.service';
import { AlertService } from './services/alert.service';

@Processor('compliance-queue')
export class ComplianceWorker extends WorkerHost {
  constructor(
    @InjectRepository(ComplianceRule)
    private ruleRepo: Repository<ComplianceRule>,

    @InjectRepository(Violation)
    private violationRepo: Repository<Violation>,

    @InjectRepository(ComplianceScan)
    private scanRepo: Repository<ComplianceScan>,

    private ruleExecutor: RuleExecutor,
    private scoreService: ScoreService,
    private alertService: AlertService,
  ) {
    super();
  }

  async process(job: Job<{ regulation: string }>) {
    const rules = await this.ruleRepo.find({
      where: { regulation: job.data.regulation, active: true },
    });

    let allViolations: Violation[] = [];

    for (const rule of rules) {
      const violations = await this.ruleExecutor.run(rule);
      allViolations.push(...violations);
    }

    await this.violationRepo.save(allViolations);

    const score = this.scoreService.calculate(allViolations);

    const scan = await this.scanRepo.save({
      regulation: job.data.regulation,
      score,
      status: score > 80 ? 'passed' : 'failed',
    });

    await this.alertService.send(allViolations);

    return scan;
  }
}
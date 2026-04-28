import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';

import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { ComplianceWorker } from './compliance.worker';

import { Regulation } from './entities/regulation.entity';
import { ComplianceRule } from './entities/compliance-rule.entity';
import { ComplianceScan } from './entities/compliance-scan.entity';
import { Violation } from './entities/violation.entity';

import { RuleExecutor } from './rules-engine/rule.executor';
import { ScoreService } from './services/score.service';
import { AlertService } from './services/alert.service';
import { ReportService } from './services/report.service';
import { LegalDbService } from './services/legal-db.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Regulation,
      ComplianceRule,
      ComplianceScan,
      Violation,
    ]),
    BullModule.registerQueue({
      name: 'compliance-queue',
    }),
  ],
  controllers: [ComplianceController],
  providers: [
    ComplianceService,
    ComplianceWorker,
    RuleExecutor,
    ScoreService,
    AlertService,
    ReportService,
    LegalDbService,
  ],
})
export class ComplianceModule {}
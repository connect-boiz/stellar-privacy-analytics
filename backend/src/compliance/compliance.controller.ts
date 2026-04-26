import { Controller, Post, Body, Get } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { RunScanDto } from './dto/run-scan.dto';
import { CreateRuleDto } from './dto/create-rule.dto';

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly service: ComplianceService) {}

  @Post('scan')
  runScan(@Body() dto: RunScanDto) {
    return this.service.runScan(dto.regulation);
  }

  @Get('dashboard')
  getDashboard() {
    return this.service.getDashboard();
  }

  @Post('rules')
  createRule(@Body() dto: CreateRuleDto) {
    return this.service.createRule(dto);
  }
}
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Res,
} from '@nestjs/common';
import { ExportService } from './export.service';
import { CreateExportDto } from './dto/create-export.dto';
import { Response } from 'express';

@Controller('exports')
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  create(@Body() dto: CreateExportDto) {
    return this.exportService.createExport(dto);
  }

  @Get(':id')
  getStatus(@Param('id') id: string) {
    return this.exportService.getExportStatus(id);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    return this.exportService.downloadFile(id, res);
  }
}
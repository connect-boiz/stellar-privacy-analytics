import { Controller, Post, Body } from '@nestjs/common';
import { SearchIndexService } from './search-index.service';
import { CreateIndexDto } from './dto/create-index.dto';
import { SearchDto } from './dto/search.dto';

@Controller('search-index')
export class SearchIndexController {
  constructor(private readonly service: SearchIndexService) {}

  @Post()
  create(@Body() dto: CreateIndexDto) {
    return this.service.create(dto);
  }

  @Post('search')
  search(@Body() dto: SearchDto) {
    return this.service.search(dto.indexId, dto.query);
  }
}
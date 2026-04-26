import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SearchIndex } from './entities/index.entity';
import { SearchIndexService } from './search-index.service';
import { SearchIndexController } from './search-index.controller';
import { IndexStorageService } from './storage/index-storage.service';

@Module({
  imports: [TypeOrmModule.forFeature([SearchIndex])],
  providers: [SearchIndexService, IndexStorageService],
  controllers: [SearchIndexController],
})
export class SearchIndexModule {}
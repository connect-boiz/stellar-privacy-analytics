import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

import { SearchIndex } from './entities/index.entity';
import { CreateIndexDto } from './dto/create-index.dto';
import { IndexStorageService } from './storage/index-storage.service';
import { InvertedIndexer } from './indexers/inverted.indexer';
import { BloomIndexer } from './indexers/bloom.indexer';
import { LSHIndexer } from './indexers/lsh.indexer';

@Injectable()
export class SearchIndexService {
  constructor(
    @InjectRepository(SearchIndex)
    private repo: Repository<SearchIndex>,
    private storage: IndexStorageService,
  ) {}

  async create(dto: CreateIndexDto) {
    const index = await this.repo.save({
      ...dto,
      status: 'building',
    });

    const mockData = ['hello world', 'secure search', 'encrypted data'];

    let built;

    if (dto.type === 'inverted') {
      built = new InvertedIndexer().build(mockData);
    } else if (dto.type === 'bloom') {
      built = new BloomIndexer().build(mockData);
    } else {
      built = new LSHIndexer().build(mockData);
    }

    const path = this.storage.save(index.id, built);

    index.status = 'ready';
    index.storagePath = path;

    return this.repo.save(index);
  }

  async search(indexId: string, query: string) {
    const index = await this.repo.findOneBy({ id: indexId });

    const data = this.storage.load(index.storagePath);

    let result;

    if (index.type === 'inverted') {
      result = new InvertedIndexer().search(data, query);
    } else if (index.type === 'bloom') {
      result = new BloomIndexer().search(data, query);
    } else {
      result = new LSHIndexer().search(data, query);
    }

    return result;
  }
}
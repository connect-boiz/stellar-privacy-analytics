import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type IndexType = 'inverted' | 'bloom' | 'lsh';

@Entity('search_indexes')
export class SearchIndex {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  datasetId: string;

  @Column()
  name: string;

  @Column()
  type: IndexType;

  @Column({ default: 'pending' })
  status: 'pending' | 'building' | 'ready' | 'failed';

  @Column({ nullable: true })
  storagePath: string;

  @CreateDateColumn()
  createdAt: Date;
}
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('index_configs')
export class IndexConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  indexId: string;

  @Column('json')
  config: any;
}
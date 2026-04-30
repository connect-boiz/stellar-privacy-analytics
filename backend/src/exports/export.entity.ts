import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed';

@Entity('exports')
export class ExportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  format: 'csv' | 'json' | 'parquet';

  @Column({ default: 'pending' })
  status: ExportStatus;

  @Column({ nullable: true })
  filePath: string;

  @Column({ default: 0 })
  progress: number;

  @Column({ default: 0 })
  retries: number;

  @Column({ nullable: true })
  error: string;

  @Column({ default: false })
  paused: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
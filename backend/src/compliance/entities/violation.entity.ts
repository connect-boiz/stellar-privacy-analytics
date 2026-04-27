import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('compliance_violations')
export class Violation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  violationId: string;

  @Column()
  scanId: string;

  @Column()
  ruleId: string;

  @Column()
  ruleName: string;

  @Column()
  severity: 'critical' | 'high' | 'medium' | 'low';

  @Column('text')
  description: string;

  @Column('jsonb', { nullable: true })
  affectedResources: string[];

  @Column()
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';

  @CreateDateColumn()
  detectedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  resolvedAt: Date;

  @Column({ nullable: true })
  resolvedBy: string;

  @Column('text', { nullable: true })
  resolutionNotes: string;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('compliance_scans')
export class ComplianceScan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  scanId: string;

  @Column()
  regulation: string;

  @Column()
  status: 'compliant' | 'non-compliant' | 'partial' | 'error';

  @Column('int')
  score: number;

  @Column('jsonb', { nullable: true })
  violations: any[];

  @Column('jsonb', { nullable: true })
  recommendations: string[];

  @Column('jsonb', { nullable: true })
  auditTrail: any[];

  @CreateDateColumn()
  timestamp: Date;

  @Column({ default: false })
  alertGenerated: boolean;
}

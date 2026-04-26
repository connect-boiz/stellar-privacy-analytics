import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('compliance_rules')
export class ComplianceRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  regulation: string;

  @Column()
  name: string;

  @Column()
  description: string;

  @Column()
  severity: 'low' | 'medium' | 'high';

  @Column()
  query: string;

  @Column({ default: true })
  active: boolean;
}
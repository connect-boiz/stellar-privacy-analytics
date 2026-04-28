import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('regulations')
export class Regulation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: 'GDPR' | 'CCPA' | 'HIPAA';

  @Column()
  description: string;
}
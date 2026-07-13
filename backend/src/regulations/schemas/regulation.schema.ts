import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { RegulationStatus } from './regulation-status.enum';
import { Subject } from '../../subjects/schemas/subject.schema';
import { RegulationScope } from './regulation-scope.schema';

@Entity('regulations')
@Unique(['code'])
export class Regulation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'date', nullable: true })
  effectiveDate: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: RegulationStatus.ACTIVE,
  })
  status: RegulationStatus;

  @OneToMany(() => Subject, (subject) => subject.regulation)
  subjects: Subject[];

  @OneToMany(() => RegulationScope, (scope) => scope.regulation, {
    cascade: true,
    eager: false,
  })
  scopes: RegulationScope[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Regulation } from '../../regulations/schemas/regulation.schema';
import { Subject } from './subject.schema';

@Entity('subject_mapping_entries')
@Index('IDX_sme_regulationId', ['regulationId'])
@Index('IDX_sme_subjectId', ['subjectId'])
@Unique('UQ_sme_assignment_scope', [
  'regulationId',
  'subjectId',
  'collegeId',
  'courseId',
  'branchId',
  'batch',
  'yearOfStudy',
  'semester',
  'sectionKey',
])
export class SubjectMappingEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  regulationId: number;

  @ManyToOne(() => Regulation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'regulationId' })
  regulation: Regulation;

  @Column({ type: 'int' })
  subjectId: number;

  @ManyToOne(() => Subject, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column({ type: 'int' })
  collegeId: number;

  @Column({ type: 'varchar', length: 255 })
  collegeName: string;

  @Column({ type: 'int' })
  courseId: number;

  @Column({ type: 'varchar', length: 255 })
  courseName: string;

  @Column({ type: 'int' })
  branchId: number;

  @Column({ type: 'varchar', length: 255 })
  branchName: string;

  @Column({ type: 'varchar', length: 50 })
  batch: string;

  @Column({ type: 'int' })
  yearOfStudy: number;

  @Column({ type: 'int' })
  semester: number;

  /** `all` = every section / no section split; `selected` = only `sections` */
  @Column({ type: 'varchar', length: 20, default: 'all' })
  sectionMode: 'all' | 'selected';

  /** Section names when sectionMode is `selected`; empty when `all` */
  @Column({ type: 'simple-json', nullable: true })
  sections: string[] | null;

  /** Unique helper: `*` for all, otherwise sorted section names joined by `|` */
  @Column({ type: 'varchar', length: 255, default: '*' })
  sectionKey: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

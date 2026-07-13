import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Regulation } from '../../regulations/schemas/regulation.schema';
import { Subject } from './subject.schema';

@Entity('subject_mapping_entries')
@Unique([
  'regulationId',
  'subjectId',
  'collegeId',
  'courseId',
  'branchId',
  'batch',
  'yearOfStudy',
  'semester',
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

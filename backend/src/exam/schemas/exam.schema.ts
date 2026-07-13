import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Regulation } from '../../regulations/schemas/regulation.schema';
import { Subject } from '../../subjects/schemas/subject.schema';
import { ExamType, ExamStatus } from './exam.enums';

@Entity('exams')
export class Exam {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 30, default: ExamType.REGULAR })
  type: ExamType;

  @Column({ type: 'int' })
  regulationId: number;

  @ManyToOne(() => Regulation)
  @JoinColumn({ name: 'regulationId' })
  regulation: Regulation;

  @Column({ type: 'varchar', length: 100 })
  course: string;

  @Column({ type: 'varchar', length: 100 })
  branch: string;

  @Column({ type: 'varchar', length: 50 })
  batch: string;

  @Column({ type: 'int' })
  semester: number;

  @Column({ type: 'varchar', length: 30, default: ExamStatus.DRAFT })
  status: ExamStatus;

  @Column({ type: 'date', nullable: true })
  examinationStartDate: string;

  @Column({ type: 'date', nullable: true })
  examinationEndDate: string;

  @Column({ type: 'date', nullable: true })
  applicationStartDate: string;

  @Column({ type: 'date', nullable: true })
  applicationEndDate: string;

  @Column({ type: 'date', nullable: true })
  lateFeeStartDate: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  packageFee: number;

  @Column({ type: 'text', nullable: true })
  instructions: string;

  @Column({ type: 'text', nullable: true })
  rejectionRemarks: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  approvedBy: string;

  @Column({ type: 'datetime', nullable: true })
  approvedAt: Date;

  @Column({ type: 'datetime', nullable: true })
  publishedAt: Date;

  @OneToMany(() => ExamSubject, (es) => es.exam, { cascade: true, eager: true })
  examSubjects: ExamSubject[];

  @OneToMany(() => LateFeeSlab, (slab) => slab.exam, { cascade: true, eager: true })
  lateFeeSlabs: LateFeeSlab[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('exam_subjects')
export class ExamSubject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  examId: number;

  @ManyToOne(() => Exam, (exam) => exam.examSubjects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  @Column({ type: 'int' })
  subjectId: number;

  @ManyToOne(() => Subject, { eager: true })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  fee: number;
}

@Entity('late_fee_slabs')
export class LateFeeSlab {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  examId: number;

  @ManyToOne(() => Exam, (exam) => exam.lateFeeSlabs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  @Column({ type: 'int' })
  fromDay: number;

  @Column({ type: 'int' })
  toDay: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;
}

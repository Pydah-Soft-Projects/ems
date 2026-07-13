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
import { SubjectType, SubjectStatus } from './subject.enums';

@Entity('subjects')
@Unique(['regulationId', 'code'])
export class Subject {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  regulationId: number;

  @ManyToOne(() => Regulation, (regulation) => regulation.subjects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'regulationId' })
  regulation: Regulation;

  @Column({ type: 'int', nullable: true })
  collegeId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  collegeName: string | null;

  @Column({ type: 'int', nullable: true })
  courseId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  courseName: string | null;

  @Column({ type: 'int', nullable: true })
  branchId: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  branchName: string | null;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'int', default: 1 })
  yearOfStudy: number;

  @Column({ type: 'int', nullable: true })
  semester: number | null;

  @Column({ type: 'varchar', length: 20, default: SubjectType.THEORY })
  type: SubjectType;

  @Column({ type: 'decimal', precision: 4, scale: 1, default: 0 })
  credits: number;

  @Column({ type: 'int', default: 0 })
  internalMarks: number;

  @Column({ type: 'int', default: 0 })
  externalMarks: number;

  @Column({ type: 'int', default: 0 })
  totalMarks: number;

  @Column({ type: 'varchar', length: 20, default: SubjectStatus.ACTIVE })
  status: SubjectStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

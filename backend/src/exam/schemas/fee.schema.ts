import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Exam } from './exam.schema';
import { ExamType, FeeStatus } from './exam.enums';

@Entity('exam_fee_records')
export class ExamFeeRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  examId: number;

  @ManyToOne(() => Exam)
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  /** Enrollment type chosen by the student (regular / supply / …) */
  @Column({ type: 'varchar', length: 30, default: ExamType.REGULAR })
  examType: ExamType;

  /** Placeholder until SDMS integration */
  @Column({ type: 'varchar', length: 50 })
  studentRollNumber: string;

  @Column({ type: 'varchar', length: 150 })
  studentName: string;

  @Column({ type: 'simple-json' })
  selectedSubjectIds: number[];

  @Column({ type: 'simple-json' })
  feeBreakdown: { subjectId: number; subjectCode: string; fee: number }[];

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  baseFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  lateFee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 20, default: FeeStatus.PENDING })
  status: FeeStatus;

  @Column({ type: 'date', nullable: true })
  dueDate: string;

  @OneToMany(() => Payment, (p) => p.feeRecord)
  payments: Payment[];

  @OneToOne(() => ExamApplication, (app) => app.feeRecord)
  application?: ExamApplication | null;

  @CreateDateColumn()
  createdAt: Date;
}

/**
 * Student enrollment for an exam (type + subjects + consent). Creates the fee record.
 * One application per student per exam type (Regular and Supply can both exist).
 */
@Entity('exam_applications')
@Index('IDX_exam_applications_examId', ['examId'])
@Index('UQ_exam_app_enrollment', ['examId', 'studentRollNumber', 'examType'], {
  unique: true,
})
export class ExamApplication {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  examId: number;

  @ManyToOne(() => Exam)
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  @Column({ type: 'varchar', length: 30, default: ExamType.REGULAR })
  examType: ExamType;

  @Column({ type: 'varchar', length: 50 })
  studentRollNumber: string;

  @Column({ type: 'varchar', length: 150 })
  studentName: string;

  @Column({ type: 'simple-json' })
  selectedSubjectIds: number[];

  @Column({ type: 'simple-json' })
  feeBreakdown: { subjectId: number; subjectCode: string; fee: number }[];

  @Column({ type: 'boolean', default: false })
  declarationAccepted: boolean;

  @Column({ type: 'boolean', default: false })
  consentAccepted: boolean;

  @Column({ type: 'int' })
  feeRecordId: number;

  @OneToOne(() => ExamFeeRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'feeRecordId' })
  feeRecord: ExamFeeRecord;

  @CreateDateColumn()
  submittedAt: Date;
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  feeRecordId: number;

  @ManyToOne(() => ExamFeeRecord, (fr) => fr.payments)
  @JoinColumn({ name: 'feeRecordId' })
  feeRecord: ExamFeeRecord;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amountPaid: number;

  @Column({ type: 'varchar', length: 20 })
  paymentMode: string;

  @Column({ type: 'varchar', length: 30 })
  paymentMethod: string;

  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  receiptNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transactionReference: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  collectedBy: string | null;

  /** Logged-in staff username/email who recorded the payment */
  @Column({ type: 'varchar', length: 150, nullable: true })
  collectorUsername: string | null;

  @Column({ type: 'text', nullable: true })
  remarks: string | null;

  @Column({ type: 'text', nullable: true })
  gatewayResponse: string;

  @CreateDateColumn()
  paidAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Exam } from './exam.schema';
import { FeeStatus } from './exam.enums';

@Entity('exam_fee_records')
export class ExamFeeRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  examId: number;

  @ManyToOne(() => Exam)
  @JoinColumn({ name: 'examId' })
  exam: Exam;

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

  @CreateDateColumn()
  createdAt: Date;
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
  transactionReference: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  collectedBy: string;

  @Column({ type: 'text', nullable: true })
  gatewayResponse: string;

  @CreateDateColumn()
  paidAt: Date;
}

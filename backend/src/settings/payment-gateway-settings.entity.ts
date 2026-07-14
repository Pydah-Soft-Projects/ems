import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Single-row (practically) payment gateway credentials for the exam portal. */
@Entity('payment_gateway_settings')
export class PaymentGatewaySettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  razorpayKeyId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  razorpayKeySecret: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  razorpayWebhookSecret: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

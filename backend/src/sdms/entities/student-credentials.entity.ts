import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * SDMS student portal credentials (student_database.student_credentials).
 * Passwords are bcrypt hashes ($2a$10$..., cost 10) — never plaintext.
 */
@Entity('student_credentials')
export class SdmsStudentCredentials {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'student_id', unique: true })
  studentId: number;

  @Column({ type: 'varchar', length: 100, name: 'admission_number', nullable: true })
  admissionNumber: string | null;

  /** Login username — usually admission number, or PIN when distinct */
  @Column({ type: 'varchar', length: 100 })
  username: string;

  @Column({ type: 'varchar', length: 255, name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'datetime', name: 'created_at', nullable: true })
  createdAt: Date | null;

  @Column({ type: 'datetime', name: 'updated_at', nullable: true })
  updatedAt: Date | null;

  @Column({ type: 'datetime', name: 'last_login', nullable: true })
  lastLogin: Date | null;

  @Column({ type: 'int', name: 'login_count', default: 0 })
  loginCount: number;
}

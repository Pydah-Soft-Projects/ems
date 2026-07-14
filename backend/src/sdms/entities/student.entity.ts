import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { SdmsStudentSection } from './student-section.entity';

@Entity('students')
export class SdmsStudent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  college: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  course: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  branch: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  batch: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  section: string | null;

  @Column({ type: 'tinyint', name: 'current_year', default: 1 })
  currentYear: number;

  @Column({ type: 'tinyint', name: 'current_semester', default: 1 })
  currentSemester: number;

  @Column({ type: 'varchar', length: 255, name: 'student_name' })
  studentName: string;

  @Column({ type: 'varchar', length: 100, name: 'admission_number', nullable: true })
  admissionNumber: string | null;

  @Column({ type: 'varchar', length: 50, name: 'pin_no', nullable: true })
  pinNo: string | null;

  @Column({ type: 'varchar', length: 20, name: 'student_mobile', nullable: true })
  studentMobile: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'preferred_mobile_number',
    nullable: true,
  })
  preferredMobileNumber: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 50, name: 'student_status', nullable: true })
  studentStatus: string | null;

  @OneToOne(() => SdmsStudentSection, (section) => section.student)
  studentSection: SdmsStudentSection | null;
}

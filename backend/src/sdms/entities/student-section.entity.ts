import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SdmsStudent } from './student.entity';
import { SdmsCourseBranch } from './course-branch.entity';

@Entity('student_sections')
export class SdmsStudentSection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'student_id', unique: true })
  studentId: number;

  @OneToOne(() => SdmsStudent, (student) => student.studentSection)
  @JoinColumn({ name: 'student_id' })
  student: SdmsStudent;

  @Column({ type: 'int', name: 'branch_id' })
  branchId: number;

  @ManyToOne(() => SdmsCourseBranch, (branch) => branch.studentSections)
  @JoinColumn({ name: 'branch_id' })
  branch: SdmsCourseBranch;

  @Column({ type: 'varchar', length: 32 })
  batch: string;

  @Column({ type: 'varchar', length: 64, name: 'section_name' })
  sectionName: string;

  @Column({ type: 'tinyint', name: 'is_manual', default: 0 })
  isManual: number;
}

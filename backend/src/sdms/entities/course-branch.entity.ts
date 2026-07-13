import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SdmsCourse } from './course.entity';
import { SdmsStudentSection } from './student-section.entity';

@Entity('course_branches')
export class SdmsCourseBranch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'course_id' })
  courseId: number;

  @ManyToOne(() => SdmsCourse, (course) => course.branches)
  @JoinColumn({ name: 'course_id' })
  course: SdmsCourse;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({ type: 'tinyint', name: 'total_years', nullable: true })
  totalYears: number | null;

  @Column({ type: 'tinyint', name: 'semesters_per_year', nullable: true })
  semestersPerYear: number | null;

  @Column({ type: 'json', name: 'year_semester_config', nullable: true })
  yearSemesterConfig: { year: number; semesters: number }[] | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => SdmsStudentSection, (section) => section.branch)
  studentSections: SdmsStudentSection[];
}

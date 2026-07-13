import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SdmsCollege } from './college.entity';
import { SdmsCourseBranch } from './course-branch.entity';

@Entity('courses')
export class SdmsCourse {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'college_id', nullable: true })
  collegeId: number | null;

  @ManyToOne(() => SdmsCollege, (college) => college.courses)
  @JoinColumn({ name: 'college_id' })
  college: SdmsCollege | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  level: string | null;

  @Column({ type: 'tinyint', name: 'total_years', default: 4 })
  totalYears: number;

  @Column({ type: 'tinyint', name: 'semesters_per_year', default: 2 })
  semestersPerYear: number;

  @Column({ type: 'json', name: 'year_semester_config', nullable: true })
  yearSemesterConfig: { year: number; semesters: number }[] | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => SdmsCourseBranch, (branch) => branch.course)
  branches: SdmsCourseBranch[];
}

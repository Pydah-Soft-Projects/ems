import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { SdmsCourseBranch } from './course-branch.entity';
import { SdmsAcademicYear } from './academic-year.entity';

@Entity('branch_academic_years')
export class SdmsBranchAcademicYear {
  @PrimaryColumn({ type: 'int', name: 'branch_id' })
  branchId: number;

  @PrimaryColumn({ type: 'int', name: 'academic_year_id' })
  academicYearId: number;

  @ManyToOne(() => SdmsCourseBranch)
  @JoinColumn({ name: 'branch_id' })
  branch: SdmsCourseBranch;

  @ManyToOne(() => SdmsAcademicYear)
  @JoinColumn({ name: 'academic_year_id' })
  academicYear: SdmsAcademicYear;

  @Column({ type: 'timestamp', name: 'created_at', nullable: true })
  createdAt: Date | null;
}

import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('semesters')
export class SdmsSemester {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'college_id', nullable: true })
  collegeId: number | null;

  @Column({ type: 'int', name: 'course_id' })
  courseId: number;

  @Column({ type: 'int', name: 'academic_year_id' })
  academicYearId: number;

  @Column({ type: 'tinyint', name: 'year_of_study' })
  yearOfStudy: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  batch: string | null;

  @Column({ type: 'tinyint', name: 'semester_number' })
  semesterNumber: number;

  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate: string | null;
}

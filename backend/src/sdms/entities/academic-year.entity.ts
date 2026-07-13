import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('academic_years')
export class SdmsAcademicYear {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 20, name: 'year_label' })
  yearLabel: string;

  @Column({ type: 'date', name: 'start_date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', name: 'end_date', nullable: true })
  endDate: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;
}

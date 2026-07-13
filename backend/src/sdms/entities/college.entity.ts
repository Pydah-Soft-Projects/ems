import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { SdmsCourse } from './course.entity';

@Entity('colleges')
export class SdmsCollege {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => SdmsCourse, (course) => course.college)
  courses: SdmsCourse[];
}

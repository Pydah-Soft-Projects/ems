import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Regulation } from './regulation.schema';

@Entity('regulation_scopes')
@Unique(['regulationId', 'collegeId', 'courseId', 'batch'])
export class RegulationScope {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  regulationId: number;

  @ManyToOne(() => Regulation, (regulation) => regulation.scopes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'regulationId' })
  regulation: Regulation;

  /** SDMS colleges.id — reference only, read from student DB */
  @Column({ type: 'int' })
  collegeId: number;

  @Column({ type: 'varchar', length: 255 })
  collegeName: string;

  /** SDMS courses.id */
  @Column({ type: 'int' })
  courseId: number;

  @Column({ type: 'varchar', length: 255 })
  courseName: string;

  /** Admission batch year from SDMS (e.g. 2026) */
  @Column({ type: 'varchar', length: 50 })
  batch: string;

  @CreateDateColumn()
  createdAt: Date;
}

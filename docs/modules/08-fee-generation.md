# Module: Examination Fee Generation

## Overview (Workflow 8)

Auto-creates fee records for eligible students after publication.

## Eligibility (from doc — requires SDMS)

Student must match: regulation, course, branch, batch, semester, active status.

**Current phase:** Manual student list passed on publish or via `generate-fees` endpoint.

## Fee calculation

### Subject-wise
Sum of fees for selected subjects.

### Package
When **all** exam subjects selected → `min(subjectWiseTotal, packageFee)`.

## Fee record fields

| Field | Description |
|-------|-------------|
| `studentRollNumber` | Student ID (SDMS later) |
| `studentName` | Student name |
| `selectedSubjectIds` | Subjects in fee |
| `feeBreakdown` | Per-subject fee detail |
| `baseFee` | Calculated base |
| `lateFee` | Applied after due date (future scheduler) |
| `totalAmount` | Final payable |
| `status` | `pending` \| `paid` |
| `dueDate` | Application end date |

## API

| Method | Path |
|--------|------|
| POST | `/exams/:id/generate-fees` |
| GET | `/fees/records?examId=&rollNumber=` |

## Storage

Currently MySQL `exam_fee_records`. Doc specifies MongoDB for transactions — migrate later.

## Frontend (planned)

Fee records table per examination

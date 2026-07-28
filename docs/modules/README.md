# EMS Module Index

Reference documentation for the Examination Management System (EMS), derived from `Examination Management System.docx` and current implementation.

## Implementation status

| Module | Doc | Backend | Frontend | Status |
|--------|-----|---------|----------|--------|
| [Auth](./01-auth.md) | ✅ | ✅ | ✅ | Done |
| [Regulations](./02-regulations.md) | ✅ | ✅ | ✅ | Done |
| [Subjects](./03-subjects.md) | ✅ | ✅ | ✅ | Done |
| [Subject Mapping](./04-subject-mapping.md) | ✅ | ✅ | ✅ | Done |
| [Examination Creation](./05-examination-creation.md) | ✅ | ✅ | ✅ | Done |
| [Examination Approval](./06-examination-approval.md) | ✅ | ✅ | ✅ | Done |
| [Examination Publication](./07-examination-publication.md) | ✅ | ✅ | ✅ | Done |
| [Fee Generation](./08-fee-generation.md) | ✅ | ✅ | ✅ | Desk via Fees page |
| [Fee Payment](./09-fee-payment.md) | ✅ | ✅ | ✅ | Done (offline desk) |
| [Self Online Payment](./18-self-online-payment.md) | ✅ | ✅ | ✅ | UPI QR + PDF reconcile |
| [Canara UPI Collection](./19-canara-upi-collection.md) | ✅ | ✅ | ✅ | Dynamic QR + callback/sync |
| [Late Fee & Fine](./10-late-fee.md) | ✅ | ✅ | ✅ | Pay-time slabs |
| [Hall Tickets](./11-hall-tickets.md) | ✅ | ⏳ | ⏳ | Planned |
| [Marks & Results](./12-marks-results.md) | ✅ | ⏳ | ⏳ | Planned |
| [Reports & Analytics](./13-reports-analytics.md) | ✅ | ⏳ | ⏳ | Planned |
| [Notifications](./14-notifications.md) | ✅ | ⏳ | ⏳ | Planned |
| [Audit Logs](./15-audit-logs.md) | ✅ | ⏳ | ⏳ | Planned |
| [RBAC](./16-rbac.md) | ✅ | ⏳ | ⏳ | Planned (Super Admin only now) |
| [SDMS Integration](./17-sdms-integration.md) | ✅ | ✅ | ✅ | Read-only wired |

## Dependency order

```
Auth → Regulations → Subjects → Subject Mapping → Exam Creation
  → Approval → Publication → Fee Generation → Payments
  → Hall Tickets → Marks → Results
```

Cross-cutting: Notifications, Audit, Reports, RBAC, SDMS sync.

## Tech stack (current)

| Layer | Technology |
|-------|------------|
| Frontend | Next.js + TypeScript |
| Backend | Node.js + Express + TypeScript |
| EMS DB | MySQL (`examination_portal`) |
| Student DB | MySQL (`student_database`) — read-only, later |
| Auth (Super Admin) | HRMS MongoDB |
| Payments (future) | MongoDB transaction store per doc |

## API base

- Local: `http://localhost:4000/api`
- Swagger: `http://localhost:4000/api/docs`

# Module: Subject Mapping

## Overview (Workflow 4)

Maps regulation subjects onto academic scopes from the regulation + SDMS (college, programme, branch, batch, year, semester, sections).

**One table:** `subject_mapping_entries`. Two UI assignment styles write the same rows, so edits stay in sync.

## Assignment styles (synced)

### 1. Scope → subjects (daily-life / default)

1. Regulation  
2. College → programme → branch → batch  
3. Year + semester (from SDMS; optional years labelled)  
4. Sections: **All** (default) or multi-select when branch has sections  
5. Multi-select subjects for that scope  
6. Save via `PUT /subject-mappings/scope` (replace/sync subjects for that scope)

### 2. Subject → scopes

1. Multi colleges / programmes / batches from regulation scope  
2. Rows: subject + branch + year + semester + sections  
3. Save via `POST /subject-mappings` (bulk create rows)

### Edit

Opens the **full Scope → subjects** dialog (all fields editable). Sibling subjects on the same scope are pre-selected. Save replaces that scope (moves old rows if scope fields changed).

## List views

- **By scope** — one row per academic scope with subject list (Edit scope)  
- **Flat rows** — one row per subject×scope assignment  

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/subject-mappings` | Bulk create assignments |
| PUT | `/subject-mappings/scope` | Sync subjects for one scope |
| GET | `/subject-mappings` | List entries |
| PATCH | `/subject-mappings/:id` | Update one entry |
| DELETE | `/subject-mappings/:id` | Delete one entry |

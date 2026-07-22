'use strict';

const { AppError } = require('../common/errors');
const { config } = require('../config');
const {
  HrmsUserModel,
  HrmsEmployeeModel,
  isHrmsConnected,
} = require('./hrms-user.model');
const { operationLogger, sanitize } = require('../common/logger');
const {
  ALL_PRIVILEGE_KEYS,
  SYSTEM_SUPER_ADMIN_ROLE_NAME,
  normalizePrivilegeList,
  hasPrivilege,
} = require('./permissions');

const BOOTSTRAP_SUPER_ADMIN_EMAIL = (
  config.ems?.bootstrapSuperAdminEmail || 'ravi@pydahsoft.in'
).toLowerCase();
const log = operationLogger('user-management');

class UsersService {
  constructor(roleRepo, userRepo, auditRepo) {
    this.roleRepo = roleRepo;
    this.userRepo = userRepo;
    this.auditRepo = auditRepo;
  }

  normalizeEmail(email) {
    return String(email ?? '')
      .trim()
      .toLowerCase();
  }

  isBootstrapEmail(email) {
    return this.normalizeEmail(email) === BOOTSTRAP_SUPER_ADMIN_EMAIL;
  }

  isHrmsSuperAdmin(user) {
    if (!user) return false;
    const expected = config.hrms.superAdminRole
      .toLowerCase()
      .replace(/\s+/g, '_');
    const roles = [
      user.role,
      ...(Array.isArray(user.roles) ? user.roles : []),
    ]
      .filter(Boolean)
      .map((r) => String(r).toLowerCase().replace(/\s+/g, '_'));
    return roles.some(
      (r) => r === expected || r === 'superadmin' || r === 'super_admin',
    );
  }

  isHrmsUserActive(user) {
    if (!user) return false;
    if (user.isActive === false) return false;
    if (user.is_active === false) return false;
    if (String(user.status ?? '').toLowerCase() === 'inactive') return false;
    return true;
  }

  extractOrgRef(value) {
    if (value == null || value === '') {
      return { id: null, label: null };
    }
    if (typeof value === 'object') {
      const id = value._id || value.id || null;
      const name = value.name || value.title || null;
      const code = value.code || null;
      return {
        id: id ? String(id) : null,
        label: name ? (code ? `${name} (${code})` : String(name)) : null,
      };
    }
    return { id: String(value), label: null };
  }

  sanitizeHrmsUser(user, source = 'user', linkedEmployee = null, orgNames = {}) {
    if (!user) return null;
    const isEmployee = source === 'employee';
    const employee = isEmployee ? user : linkedEmployee;
    const departmentRef = this.extractOrgRef(employee?.department_id);
    const divisionRef = this.extractOrgRef(employee?.division_id);
    const designationRef = this.extractOrgRef(employee?.designation_id);
    return {
      id: user._id.toString(),
      source,
      employeeNumber: String(
        (isEmployee ? user.emp_no : linkedEmployee?.emp_no ?? user.employeeId) ??
          '',
      ).trim() || null,
      email: this.normalizeEmail(user.email || linkedEmployee?.email),
      name:
        (isEmployee ? user.employee_name : user.name) ||
        linkedEmployee?.employee_name ||
        user.email ||
        null,
      phone:
        String(employee?.phone_number ?? user.phone_number ?? '').trim() || null,
      gender: String(employee?.gender ?? '').trim() || null,
      location: String(employee?.location ?? '').trim() || null,
      dateOfJoining: employee?.doj
        ? new Date(employee.doj).toISOString()
        : null,
      departmentId: departmentRef.id,
      divisionId: divisionRef.id,
      designationId: designationRef.id,
      department:
        departmentRef.label ||
        (departmentRef.id ? orgNames.departments?.[departmentRef.id] || null : null),
      division:
        divisionRef.label ||
        (divisionRef.id ? orgNames.divisions?.[divisionRef.id] || null : null),
      designation:
        designationRef.label ||
        (designationRef.id
          ? orgNames.designations?.[designationRef.id] || null
          : null),
      isActive: this.isHrmsUserActive(user),
      isHrmsSuperAdmin: !isEmployee && this.isHrmsSuperAdmin(user),
      role: user.role ?? null,
      roles: Array.isArray(user.roles) ? user.roles : [],
    };
  }

  async resolveOrgNames(employees = []) {
    const departmentIds = [
      ...new Set(
        employees
          .map((employee) => this.extractOrgRef(employee?.department_id).id)
          .filter(Boolean),
      ),
    ];
    const divisionIds = [
      ...new Set(
        employees
          .map((employee) => this.extractOrgRef(employee?.division_id).id)
          .filter(Boolean),
      ),
    ];
    const designationIds = [
      ...new Set(
        employees
          .map((employee) => this.extractOrgRef(employee?.designation_id).id)
          .filter(Boolean),
      ),
    ];

    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    if (!db) {
      return { departments: {}, divisions: {}, designations: {} };
    }

    const toObjectIds = (ids) =>
      ids
        .map((id) => {
          try {
            return new mongoose.Types.ObjectId(id);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

    const [departments, divisions, designations] = await Promise.all([
      departmentIds.length
        ? db
            .collection('departments')
            .find({ _id: { $in: toObjectIds(departmentIds) } })
            .project({ name: 1, code: 1 })
            .toArray()
        : [],
      divisionIds.length
        ? db
            .collection('divisions')
            .find({ _id: { $in: toObjectIds(divisionIds) } })
            .project({ name: 1, code: 1 })
            .toArray()
        : [],
      designationIds.length
        ? db
            .collection('designations')
            .find({ _id: { $in: toObjectIds(designationIds) } })
            .project({ name: 1, code: 1 })
            .toArray()
        : [],
    ]);

    const mapNames = (rows) =>
      Object.fromEntries(
        rows.map((row) => [
          String(row._id),
          row.code ? `${row.name} (${row.code})` : row.name || null,
        ]),
      );

    return {
      departments: mapNames(departments),
      divisions: mapNames(divisions),
      designations: mapNames(designations),
    };
  }

  normalizeHrmsSource(source) {
    return source === 'employee' ? 'employee' : 'user';
  }

  async findHrmsIdentity(source, id, { withPassword = false } = {}) {
    const normalizedSource = this.normalizeHrmsSource(source);
    if (normalizedSource === 'employee') {
      let query = HrmsEmployeeModel.findById(id);
      if (withPassword) query = query.select('+plain_password');
      return query.exec();
    }
    let query = HrmsUserModel.findById(id);
    if (withPassword) query = query.select('+password');
    return query.exec();
  }

  async ensureSystemRole() {
    let role = await this.roleRepo.findOne({
      where: { isSystemSuperAdmin: true },
    });
    if (!role) {
      role = await this.roleRepo.findOne({
        where: { name: SYSTEM_SUPER_ADMIN_ROLE_NAME },
      });
    }
    if (!role) {
      role = this.roleRepo.create({
        name: SYSTEM_SUPER_ADMIN_ROLE_NAME,
        description: 'Unrestricted EMS access (system role)',
        privileges: [...ALL_PRIVILEGE_KEYS],
        isSystem: true,
        isSystemSuperAdmin: true,
        isActive: true,
        createdByEmail: 'system',
      });
    } else {
      role.name = SYSTEM_SUPER_ADMIN_ROLE_NAME;
      role.isSystem = true;
      role.isSystemSuperAdmin = true;
      role.isActive = true;
      role.privileges = [...ALL_PRIVILEGE_KEYS];
    }
    return this.roleRepo.save(role);
  }

  async writeAudit(actor, action, targetType, targetId, detail) {
    const audit = await this.auditRepo.save(
      this.auditRepo.create({
        actorEmail: actor?.email ?? actor?.username ?? null,
        actorHrmsUserId: actor?.hrmsUserId ?? actor?.sub ?? null,
        action,
        targetType,
        targetId: targetId == null ? null : String(targetId),
        detail: detail ?? null,
      }),
    );
    log.info(
      {
        event: 'user_management.operation',
        auditId: audit.id,
        action,
        actorEmail: actor?.email ?? actor?.username ?? null,
        targetType,
        targetId: targetId == null ? null : String(targetId),
        detail: sanitize(detail),
      },
      'User management operation completed',
    );
  }

  serializeRole(role) {
    if (!role) return null;
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      privileges: Array.isArray(role.privileges) ? role.privileges : [],
      isSystem: !!role.isSystem,
      isSystemSuperAdmin: !!role.isSystemSuperAdmin,
      isActive: role.isActive !== false,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  effectiveUserPrivileges(user) {
    const stored = Array.isArray(user?.privileges) ? user.privileges : [];
    if (stored.length > 0) return stored;
    // Legacy rows created before user-level privileges — fall back to role template.
    return Array.isArray(user?.role?.privileges) ? user.role.privileges : [];
  }

  serializeUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      hrmsUserId: user.hrmsUserId,
      hrmsSource: user.hrmsSource || 'user',
      employeeNumber: user.employeeNumber || null,
      email: user.email,
      fullName: user.fullName,
      isActive: user.isActive !== false,
      privileges: this.effectiveUserPrivileges(user),
      role: this.serializeRole(user.role),
      roleId: user.roleId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      createdByEmail: user.createdByEmail,
      updatedByEmail: user.updatedByEmail,
    };
  }

  async findUserByHrmsId(hrmsUserId, hrmsSource = 'user') {
    if (!hrmsUserId) return null;
    return this.userRepo.findOne({
      where: {
        hrmsUserId: String(hrmsUserId),
        hrmsSource: this.normalizeHrmsSource(hrmsSource),
      },
      relations: ['role'],
    });
  }

  async findUserByEmail(email) {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return null;
    return this.userRepo.findOne({
      where: { email: normalized },
      relations: ['role'],
    });
  }

  async listRoles() {
    await this.ensureSystemRole();
    const roles = await this.roleRepo.find({ order: { name: 'ASC' } });
    return roles.map((r) => this.serializeRole(r));
  }

  async getRole(id) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw AppError.notFound('Role not found');
    return this.serializeRole(role);
  }

  async createRole(dto, actor) {
    const name = String(dto.name ?? '').trim();
    if (!name) throw AppError.badRequest('Role name is required');
    if (name.toLowerCase() === SYSTEM_SUPER_ADMIN_ROLE_NAME.toLowerCase()) {
      throw AppError.badRequest('Cannot create another Super Admin role');
    }
    const existing = await this.roleRepo.findOne({ where: { name } });
    if (existing) throw AppError.badRequest('A role with this name already exists');
    const privileges = normalizePrivilegeList(dto.privileges);
    if (privileges.length === 0) {
      throw AppError.badRequest('Select at least one privilege');
    }
    const role = await this.roleRepo.save(
      this.roleRepo.create({
        name,
        description: String(dto.description ?? '').trim() || null,
        privileges,
        isSystem: false,
        isSystemSuperAdmin: false,
        isActive: dto.isActive !== false,
        createdByEmail: actor?.email ?? actor?.username ?? null,
        updatedByEmail: actor?.email ?? actor?.username ?? null,
      }),
    );
    await this.writeAudit(actor, 'role.create', 'role', role.id, {
      name: role.name,
      privileges: role.privileges,
    });
    return this.serializeRole(role);
  }

  async updateRole(id, dto, actor) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw AppError.notFound('Role not found');
    if (role.isSystemSuperAdmin) {
      throw AppError.badRequest('The system Super Admin role cannot be edited');
    }
    if (dto.name != null) {
      const name = String(dto.name).trim();
      if (!name) throw AppError.badRequest('Role name is required');
      if (name.toLowerCase() === SYSTEM_SUPER_ADMIN_ROLE_NAME.toLowerCase()) {
        throw AppError.badRequest('Cannot rename a role to Super Admin');
      }
      const clash = await this.roleRepo.findOne({ where: { name } });
      if (clash && clash.id !== role.id) {
        throw AppError.badRequest('A role with this name already exists');
      }
      role.name = name;
    }
    if (dto.description !== undefined) {
      role.description = String(dto.description ?? '').trim() || null;
    }
    if (dto.privileges !== undefined) {
      const privileges = normalizePrivilegeList(dto.privileges);
      if (privileges.length === 0) {
        throw AppError.badRequest('Select at least one privilege');
      }
      role.privileges = privileges;
    }
    if (dto.isActive !== undefined) {
      role.isActive = !!dto.isActive;
    }
    role.updatedByEmail = actor?.email ?? actor?.username ?? null;
    const saved = await this.roleRepo.save(role);
    await this.writeAudit(actor, 'role.update', 'role', saved.id, {
      name: saved.name,
      privileges: saved.privileges,
      isActive: saved.isActive,
    });
    return this.serializeRole(saved);
  }

  async deleteRole(id, actor) {
    const role = await this.roleRepo.findOne({ where: { id } });
    if (!role) throw AppError.notFound('Role not found');
    if (role.isSystem || role.isSystemSuperAdmin) {
      throw AppError.badRequest('System roles cannot be deleted');
    }
    const assigned = await this.userRepo.count({ where: { roleId: id } });
    if (assigned > 0) {
      throw AppError.badRequest(
        `Cannot delete role — ${assigned} user(s) are still assigned to it`,
      );
    }
    await this.roleRepo.remove(role);
    await this.writeAudit(actor, 'role.delete', 'role', id, { name: role.name });
    return { success: true };
  }

  async listUsers({ q, page = 1, limit = 50 } = {}) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const qb = this.userRepo
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.role', 'role')
      .orderBy('u.email', 'ASC')
      .skip(skip)
      .take(take);
    const query = String(q ?? '').trim();
    if (query) {
      qb.andWhere('(LOWER(u.email) LIKE :q OR LOWER(u.fullName) LIKE :q)', {
        q: `%${query.toLowerCase()}%`,
      });
    }
    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((u) => this.serializeUser(u)),
      total,
      page: Math.max(Number(page) || 1, 1),
      limit: take,
    };
  }

  async getUser(id) {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['role'],
    });
    if (!user) throw AppError.notFound('EMS user not found');
    return this.serializeUser(user);
  }

  async assertRoleAssignable(roleId, actor, { assigningSuperAdmin }) {
    const role = await this.roleRepo.findOne({ where: { id: roleId } });
    if (!role) throw AppError.notFound('Role not found');
    if (role.isActive === false) {
      throw AppError.badRequest('Cannot assign an inactive role');
    }
    if (role.isSystemSuperAdmin) {
      if (!actor?.isSuperAdmin && !hasPrivilege(actor?.privileges, 'users:super_admin')) {
        throw AppError.forbidden('Only Super Admin can assign the Super Admin role');
      }
      if (!assigningSuperAdmin) {
        throw AppError.badRequest(
          'Super Admin assignment requires selecting an HRMS Super Admin account',
        );
      }
    }
    return role;
  }

  assertPrivilegesAssignable(privileges, actor) {
    if (actor?.isSuperAdmin) return;
    const forbidden = privileges.filter(
      (privilege) => !hasPrivilege(actor?.privileges, privilege),
    );
    if (forbidden.length > 0) {
      throw AppError.forbidden(
        `You cannot grant privileges you do not have: ${forbidden.join(', ')}`,
      );
    }
  }

  async createUser(dto, actor) {
    if (!isHrmsConnected()) {
      throw AppError.serviceUnavailable('HRMS MongoDB is not connected');
    }
    const hrmsUserId = String(dto.hrmsUserId ?? '').trim();
    if (!hrmsUserId) throw AppError.badRequest('Select an HRMS user');
    const hrmsSource = this.normalizeHrmsSource(dto.hrmsSource);
    const roleId = Number(dto.roleId);
    if (!roleId) throw AppError.badRequest('Select an EMS role');

    const hrms = await this.findHrmsIdentity(hrmsSource, hrmsUserId);
    if (!hrms || !this.isHrmsUserActive(hrms)) {
      throw AppError.badRequest('HRMS employee/user not found or inactive');
    }
    const email = this.normalizeEmail(hrms.email);
    if (!email) throw AppError.badRequest('HRMS user has no email');
    if (this.isBootstrapEmail(email)) {
      throw AppError.badRequest(
        `${BOOTSTRAP_SUPER_ADMIN_EMAIL} already has unrestricted EMS access and cannot be provisioned`,
      );
    }

    const existingByHrms = await this.findUserByHrmsId(hrmsUserId, hrmsSource);
    if (existingByHrms) {
      throw AppError.badRequest('This HRMS user is already provisioned in EMS');
    }
    const existingByEmail = await this.findUserByEmail(email);
    if (existingByEmail) {
      throw AppError.badRequest('An EMS user with this email already exists');
    }

    const role = await this.assertRoleAssignable(roleId, actor, {
      assigningSuperAdmin:
        hrmsSource === 'user' && this.isHrmsSuperAdmin(hrms),
    });
    if (
      role.isSystemSuperAdmin &&
      (hrmsSource !== 'user' || !this.isHrmsSuperAdmin(hrms))
    ) {
      throw AppError.badRequest(
        'Only HRMS Super Admin accounts can be assigned the EMS Super Admin role',
      );
    }

    // Prefer explicit user privileges; otherwise seed from the selected role template.
    const privileges = normalizePrivilegeList(
      dto.privileges ??
        dto.additionalPrivileges ??
        (Array.isArray(role.privileges) ? role.privileges : []),
    );
    if (!role.isSystemSuperAdmin && privileges.length === 0) {
      throw AppError.badRequest('Select at least one privilege for this user');
    }
    this.assertPrivilegesAssignable(privileges, actor);
    const user = await this.userRepo.save(
      this.userRepo.create({
        hrmsUserId,
        hrmsSource,
        employeeNumber:
          String(
            (hrmsSource === 'employee' ? hrms.emp_no : hrms.employeeId) ?? '',
          ).trim() || null,
        email,
        fullName:
          (hrmsSource === 'employee' ? hrms.employee_name : hrms.name) || email,
        roleId: role.id,
        privileges: role.isSystemSuperAdmin ? [...ALL_PRIVILEGE_KEYS] : privileges,
        isActive: dto.isActive !== false,
        createdByEmail: actor?.email ?? actor?.username ?? null,
        updatedByEmail: actor?.email ?? actor?.username ?? null,
      }),
    );
    const refreshed = await this.userRepo.findOne({
      where: { id: user.id },
      relations: ['role'],
    });
    await this.writeAudit(actor, 'user.create', 'user', user.id, {
      email,
      hrmsSource,
      employeeNumber: user.employeeNumber,
      roleId: role.id,
      roleName: role.name,
      privileges: user.privileges,
    });
    return this.serializeUser(refreshed);
  }

  async updateUser(id, dto, actor) {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['role'],
    });
    if (!user) throw AppError.notFound('EMS user not found');
    if (this.isBootstrapEmail(user.email)) {
      throw AppError.badRequest('Bootstrap Super Admin cannot be modified here');
    }

    if (dto.roleId != null) {
      const roleId = Number(dto.roleId);
      let hrms = null;
      if (isHrmsConnected()) {
        hrms = await this.findHrmsIdentity(
          user.hrmsSource || 'user',
          user.hrmsUserId,
        );
      }
      const role = await this.assertRoleAssignable(roleId, actor, {
        assigningSuperAdmin:
          (user.hrmsSource || 'user') === 'user' &&
          this.isHrmsSuperAdmin(hrms),
      });
      if (
        role.isSystemSuperAdmin &&
        ((user.hrmsSource || 'user') !== 'user' ||
          !this.isHrmsSuperAdmin(hrms))
      ) {
        throw AppError.badRequest(
          'Only HRMS Super Admin accounts can be assigned the EMS Super Admin role',
        );
      }
      // Prevent self-lockout: actor demoting themselves from Super Admin
      if (
        actor?.hrmsUserId &&
        actor.hrmsUserId === user.hrmsUserId &&
        actor.isSuperAdmin &&
        !role.isSystemSuperAdmin
      ) {
        throw AppError.badRequest(
          'You cannot remove your own Super Admin access',
        );
      }
      user.roleId = role.id;
      user.role = role;
    }

    if (dto.isActive !== undefined) {
      if (
        actor?.hrmsUserId &&
        actor.hrmsUserId === user.hrmsUserId &&
        dto.isActive === false
      ) {
        throw AppError.badRequest('You cannot deactivate your own account');
      }
      user.isActive = !!dto.isActive;
    }

    if (dto.fullName !== undefined) {
      user.fullName = String(dto.fullName ?? '').trim() || user.fullName;
    }

    if (dto.privileges !== undefined || dto.additionalPrivileges !== undefined) {
      const privileges = normalizePrivilegeList(
        dto.privileges ?? dto.additionalPrivileges,
      );
      if (privileges.length === 0 && !user.role?.isSystemSuperAdmin) {
        throw AppError.badRequest('Select at least one privilege for this user');
      }
      this.assertPrivilegesAssignable(privileges, actor);
      user.privileges = privileges;
    }

    user.updatedByEmail = actor?.email ?? actor?.username ?? null;
    await this.userRepo.save(user);
    const refreshed = await this.userRepo.findOne({
      where: { id: user.id },
      relations: ['role'],
    });
    await this.writeAudit(actor, 'user.update', 'user', user.id, {
      roleId: refreshed.roleId,
      isActive: refreshed.isActive,
      privileges: refreshed.privileges || [],
    });
    return this.serializeUser(refreshed);
  }

  async searchHrmsUsers({ q = '', page = 1, limit = 20, superAdminsOnly = false } = {}) {
    if (!isHrmsConnected()) {
      throw AppError.serviceUnavailable('HRMS MongoDB is not connected');
    }
    const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const query = String(q ?? '').trim();
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = { $regex: escaped, $options: 'i' };
    const employeeFilter = query
      ? {
          $or: [
            { emp_no: regex },
            { employee_name: regex },
            { email: regex },
          ],
        }
      : {};

    // Search both HRMS identity collections. Employees are also used to enrich
    // user records with their employee number.
    const employees = await HrmsEmployeeModel.find(employeeFilter)
      .sort({ emp_no: 1 })
      .limit(Math.min(take * 3, 300))
      .lean()
      .exec();
    const employeeIds = employees.map((employee) => employee._id);
    const employeeEmails = employees
      .map((employee) => this.normalizeEmail(employee.email))
      .filter(Boolean);

    const userOr = query
      ? [
          { email: regex },
          { name: regex },
          { employeeId: regex },
          ...(employeeIds.length > 0
            ? [{ employeeRef: { $in: employeeIds } }]
            : []),
          ...(employeeEmails.length > 0
            ? [{ email: { $in: employeeEmails } }]
            : []),
        ]
      : [];
    const users = await HrmsUserModel.find(userOr.length > 0 ? { $or: userOr } : {})
      .sort({ email: 1 })
      .limit(Math.min(take * 3, 300))
      .lean()
      .exec();

    const employeeById = new Map(
      employees.map((employee) => [employee._id.toString(), employee]),
    );
    const employeeByEmail = new Map(
      employees
        .filter((employee) => this.normalizeEmail(employee.email))
        .map((employee) => [this.normalizeEmail(employee.email), employee]),
    );
    const employeeByNumber = new Map(
      employees
        .filter((employee) => employee.emp_no != null)
        .map((employee) => [String(employee.emp_no), employee]),
    );

    // Pull any linked employee records not already included in the search hit set.
    const missingEmployeeIds = [];
    for (const user of users) {
      const ref = user.employeeRef ? String(user.employeeRef) : '';
      if (ref && !employeeById.has(ref)) missingEmployeeIds.push(ref);
    }
    if (missingEmployeeIds.length > 0) {
      const mongoose = require('mongoose');
      const extraEmployees = await HrmsEmployeeModel.find({
        _id: {
          $in: missingEmployeeIds
            .map((id) => {
              try {
                return new mongoose.Types.ObjectId(id);
              } catch {
                return null;
              }
            })
            .filter(Boolean),
        },
      })
        .lean()
        .exec();
      for (const employee of extraEmployees) {
        employeeById.set(employee._id.toString(), employee);
        if (this.normalizeEmail(employee.email)) {
          employeeByEmail.set(this.normalizeEmail(employee.email), employee);
        }
        if (employee.emp_no != null) {
          employeeByNumber.set(String(employee.emp_no), employee);
        }
      }
    }

    const representedEmployees = new Set();
    const orgNames = await this.resolveOrgNames([
      ...employeeById.values(),
    ]);
    const merged = [];

    // Prefer a users-collection identity where both records represent the same
    // person, because that is the canonical HRMS login account.
    for (const user of users) {
      const linkedEmployee =
        employeeById.get(String(user.employeeRef ?? '')) ||
        employeeByNumber.get(String(user.employeeId ?? '')) ||
        employeeByEmail.get(this.normalizeEmail(user.email)) ||
        null;
      if (linkedEmployee) {
        representedEmployees.add(linkedEmployee._id.toString());
      }
      merged.push(
        this.sanitizeHrmsUser(user, 'user', linkedEmployee, orgNames),
      );
    }
    for (const employee of employees) {
      if (representedEmployees.has(employee._id.toString())) continue;
      merged.push(this.sanitizeHrmsUser(employee, 'employee', null, orgNames));
    }

    const seen = new Set();
    let items = merged.filter((item) => {
      if (!item) return false;
      const key = item.email || `${item.source}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (superAdminsOnly) {
      items = items.filter((u) => u.isHrmsSuperAdmin);
    }
    items.sort((a, b) =>
      String(a.employeeNumber || a.name || a.email).localeCompare(
        String(b.employeeNumber || b.name || b.email),
        undefined,
        { numeric: true },
      ),
    );
    items = items.slice(skip, skip + take);

    // Annotate whether already provisioned
    const ids = items.map((i) => i.id);
    const emails = items.map((i) => i.email).filter(Boolean);
    const existing =
      ids.length > 0 || emails.length > 0
        ? await this.userRepo
            .createQueryBuilder('u')
            .where(
              [
                ids.length > 0 ? 'u.hrmsUserId IN (:...ids)' : null,
                emails.length > 0 ? 'LOWER(u.email) IN (:...emails)' : null,
              ]
                .filter(Boolean)
                .join(' OR '),
              { ids, emails },
            )
            .getMany()
        : [];
    const provisionedIds = new Set(
      existing.map(
        (entry) => `${entry.hrmsSource || 'user'}:${entry.hrmsUserId}`,
      ),
    );
    const provisionedEmails = new Set(
      existing.map((entry) => this.normalizeEmail(entry.email)),
    );
    return {
      items: items.map((i) => ({
        ...i,
        alreadyProvisioned:
          provisionedIds.has(`${i.source}:${i.id}`) ||
          provisionedEmails.has(i.email),
        isBootstrap: this.isBootstrapEmail(i.email),
      })),
      page: Math.max(Number(page) || 1, 1),
      limit: take,
    };
  }

  async listAuditLogs({ page = 1, limit = 50 } = {}) {
    const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const [items, total] = await this.auditRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip,
      take,
    });
    return {
      items,
      total,
      page: Math.max(Number(page) || 1, 1),
      limit: take,
    };
  }
}

module.exports = { UsersService };

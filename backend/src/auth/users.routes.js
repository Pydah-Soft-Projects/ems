'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');
const { requireStaff, requirePrivilege } = require('../middleware/auth');
const { PRIVILEGE_GROUPS, ALL_PRIVILEGE_KEYS } = require('./permissions');

function createUsersRoutes(services) {
  const router = Router();
  router.use(requireStaff);

  router.get(
    '/privileges',
    requirePrivilege('users:read', 'roles:read', 'roles:write', 'users:write'),
    asyncHandler(async (_req, res) => {
      res.json({
        groups: PRIVILEGE_GROUPS,
        keys: ALL_PRIVILEGE_KEYS,
      });
    }),
  );

  router.get(
    '/roles',
    requirePrivilege('roles:read', 'users:write'),
    asyncHandler(async (_req, res) => {
      res.json(await services.users.listRoles());
    }),
  );

  router.get(
    '/roles/:id',
    requirePrivilege('roles:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.users.getRole(parseInt(String(req.params.id), 10)));
    }),
  );

  router.post(
    '/roles',
    requirePrivilege('roles:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(await services.users.createRole(req.body, req.user));
    }),
  );

  router.patch(
    '/roles/:id',
    requirePrivilege('roles:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.users.updateRole(
          parseInt(String(req.params.id), 10),
          req.body,
          req.user,
        ),
      );
    }),
  );

  router.delete(
    '/roles/:id',
    requirePrivilege('roles:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.users.deleteRole(
          parseInt(String(req.params.id), 10),
          req.user,
        ),
      );
    }),
  );

  router.get(
    '/users',
    requirePrivilege('users:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.users.listUsers({
          q: req.query.q,
          page: req.query.page ? parseInt(String(req.query.page), 10) : 1,
          limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 50,
        }),
      );
    }),
  );

  router.get(
    '/users/:id',
    requirePrivilege('users:read'),
    asyncHandler(async (req, res) => {
      res.json(await services.users.getUser(parseInt(String(req.params.id), 10)));
    }),
  );

  router.post(
    '/users',
    requirePrivilege('users:write'),
    asyncHandler(async (req, res) => {
      res.status(201).json(await services.users.createUser(req.body, req.user));
    }),
  );

  router.patch(
    '/users/:id',
    requirePrivilege('users:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.users.updateUser(
          parseInt(String(req.params.id), 10),
          req.body,
          req.user,
        ),
      );
    }),
  );

  router.delete(
    '/users/:id',
    requirePrivilege('users:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.users.deleteUser(
          parseInt(String(req.params.id), 10),
          req.user,
        ),
      );
    }),
  );

  router.get(
    '/hrms-users',
    requirePrivilege('users:write'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.users.searchHrmsUsers({
          q: req.query.q,
          page: req.query.page ? parseInt(String(req.query.page), 10) : 1,
          limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 20,
          superAdminsOnly:
            req.query.superAdminsOnly === '1' ||
            req.query.superAdminsOnly === 'true',
        }),
      );
    }),
  );

  router.get(
    '/audit-logs',
    requirePrivilege('audit:read'),
    asyncHandler(async (req, res) => {
      res.json(
        await services.users.listAuditLogs({
          page: req.query.page ? parseInt(String(req.query.page), 10) : 1,
          limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 50,
        }),
      );
    }),
  );

  return router;
}

module.exports = { createUsersRoutes };

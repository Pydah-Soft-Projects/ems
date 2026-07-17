'use strict';

const { Router } = require('express');
const { asyncHandler } = require('../common/asyncHandler');

function parseId(value) {
    return parseInt(value, 10);
}

function createSubjectsRoutes(services) {
    const router = Router();
    router.post('/', asyncHandler(async (req, res) => {
        res.status(201).json(await services.subjects.create(req.body));
    }));
    router.get('/', asyncHandler(async (req, res) => {
        const regulationId = req.query.regulationId
            ? parseInt(String(req.query.regulationId), 10)
            : undefined;
        res.json(await services.subjects.findAll(regulationId));
    }));
    router.get('/:id', asyncHandler(async (req, res) => {
        res.json(await services.subjects.findOne(parseId(req.params.id)));
    }));
    router.patch('/:id', asyncHandler(async (req, res) => {
        res.json(await services.subjects.update(parseId(req.params.id), req.body));
    }));
    router.delete('/:id', asyncHandler(async (req, res) => {
        await services.subjects.remove(parseId(req.params.id));
        res.status(204).send();
    }));
    return router;
}

function createSubjectMappingRoutes(services) {
    const router = Router();
    router.post('/', asyncHandler(async (req, res) => {
        res.status(201).json(await services.subjects.createMapping(req.body));
    }));
    router.put('/scope', asyncHandler(async (req, res) => {
        res.json(await services.subjects.replaceScopeMapping(req.body));
    }));
    router.get('/', asyncHandler(async (req, res) => {
        res.json(await services.subjects.findAllMappings({
            regulationId: req.query.regulationId
                ? parseInt(String(req.query.regulationId), 10)
                : undefined,
            course: req.query.course,
            branch: req.query.branch,
            batch: req.query.batch,
            yearOfStudy: req.query.yearOfStudy
                ? parseInt(String(req.query.yearOfStudy), 10)
                : undefined,
            semester: req.query.semester
                ? parseInt(String(req.query.semester), 10)
                : undefined,
        }));
    }));
    router.get('/:id', asyncHandler(async (req, res) => {
        res.json(await services.subjects.findMapping(parseId(req.params.id)));
    }));
    router.patch('/:id', asyncHandler(async (req, res) => {
        res.json(await services.subjects.updateMapping(parseId(req.params.id), req.body));
    }));
    router.delete('/:id', asyncHandler(async (req, res) => {
        await services.subjects.removeMapping(parseId(req.params.id));
        res.status(204).send();
    }));
    return router;
}

module.exports = { createSubjectsRoutes, createSubjectMappingRoutes };

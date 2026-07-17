'use strict';

function buildSectionKey(sectionMode = 'all', sections) {
  if (sectionMode !== 'selected' || !sections?.length) return '*';
  return [...new Set(sections.map((s) => s.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join('|');
}

function normalizeSectionFields(input) {
  const mode = input.sectionMode ?? 'all';
  if (mode !== 'selected' || !input.sections?.length) {
    return { sectionMode: 'all', sections: null, sectionKey: '*' };
  }

  const sections = [
    ...new Set(input.sections.map((s) => s.trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b));

  return {
    sectionMode: 'selected',
    sections,
    sectionKey: buildSectionKey('selected', sections),
  };
}

module.exports = { buildSectionKey, normalizeSectionFields };

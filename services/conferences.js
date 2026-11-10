const catalog = require('../data/conferences.json');

function resolve(entry) {
  const template = catalog.templates[entry.template];
  return {
    id: entry.id,
    name: entry.name,
    format: template.format,
    templateUrl: entry.templateUrl || template.templateUrl,
    sections: template.sections,
  };
}

function list() {
  return catalog.conferences.map(resolve);
}

function get(id) {
  const entry = catalog.conferences.find((c) => c.id === id);
  return entry ? resolve(entry) : null;
}

module.exports = { list, get };

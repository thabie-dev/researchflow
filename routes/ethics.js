const express = require('express');
const router = express.Router();
const store = require('../services/store');
const { accessibleProject, WRITERS } = require('../services/ownership');

const COLLECTION = 'ethicsRecords';
const STATUSES = ['not_required', 'required', 'approved'];

const COPY = {
  not_required: {
    title: 'Ethics Not Required',
    message: 'This project may proceed to data collection or analysis because ethical clearance is not required.',
    badge: 'done',
  },
  required: {
    title: 'Ethics Required',
    message: 'Ethical clearance is required. The project should not proceed to data collection until approval is granted.',
    badge: 'pending',
  },
  approved: {
    title: 'Ethics Approved',
    message: 'Ethics approval has been granted. The project may proceed to data collection.',
    badge: 'done',
  },
};

router.get('/:projectId', (req, res) => {
  if (!accessibleProject(req.user, req.params.projectId)) return res.status(404).json({ error: 'Project not found' });
  const record = store.read(COLLECTION, []).find((r) => r.projectId === req.params.projectId);
  if (!record) return res.json({ projectId: req.params.projectId, status: null, ...COPY_FOR_EMPTY() });
  res.json({ ...record, ...COPY[record.status] });
});

function COPY_FOR_EMPTY() {
  return {
    title: 'Awaiting Ethics Decision',
    message: 'Select whether ethics is not required, required, or already approved.',
  };
}

router.put('/:projectId', async (req, res) => {
  if (!accessibleProject(req.user, req.params.projectId, WRITERS)) return res.status(404).json({ error: 'Project not found' });
  const { status, reason, applicationNumber, approvalDate, committee } = req.body || {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
  }

  const record = {
    projectId: req.params.projectId,
    status,
    reason: reason || null,
    applicationNumber: applicationNumber || null,
    approvalDate: approvalDate || null,
    committee: committee || null,
    updatedAt: new Date().toISOString(),
  };

  await store.update(COLLECTION, [], (all) => {
    const idx = all.findIndex((r) => r.projectId === req.params.projectId);
    if (idx === -1) return [...all, record];
    const next = [...all];
    next[idx] = record;
    return next;
  });

  res.json({ ...record, ...COPY[status] });
});

module.exports = router;

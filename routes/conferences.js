const express = require('express');
const router = express.Router();
const conferences = require('../services/conferences');

router.get('/', (req, res) => {
  res.json({ conferences: conferences.list() });
});

module.exports = router;

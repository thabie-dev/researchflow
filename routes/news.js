const express = require('express');
const router = express.Router();
const { getNews } = require('../services/news');

router.get('/', async (req, res, next) => {
  try {
    res.json(await getNews());
  } catch (err) {
    next(err);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
    res.send('Bombay Server V1.0.0');
});

module.exports = router;

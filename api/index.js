const express = require('express');

const clientsRouter = require('../lib/routes/clients');
const tourneesRouter = require('../lib/routes/tournees');
const routeRouter = require('../lib/routes/route');

const app = express();
app.use(express.json());

app.use('/api/clients', clientsRouter);
app.use('/api/tournees', tourneesRouter);
app.use('/api/route', routeRouter);

module.exports = app;

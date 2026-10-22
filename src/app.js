import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import cors from 'cors';
import './config/passport';
import routes from './routes';
import WebhookController from './routes/webhook/webhook.controller';
import handleErrors from './middlewares/errorHandler';
import { MAX_BODY_SIZE } from './utils/constants';
import { createWebSocketPing } from './utils/helper';
import { swaggerSpec, swaggerUi } from './config/swagger';
import './utils/emailQueue';
import { serverAdapter } from './config/bullBoard';

const app = express();

app.use(cors());
createWebSocketPing();

app.use('/api/webhooks', WebhookController.getRouter());

app.use(bodyParser.json({ limit: MAX_BODY_SIZE }));
app.use(bodyParser.urlencoded({ limit: MAX_BODY_SIZE, extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    cookie: { maxAge: 60000 },
    resave: false,
    saveUninitialized: false,
  })
);
app.use('/assets', express.static('public/uploads'));
app.use('/admin/queues', serverAdapter.getRouter());
app.use('/api', routes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use(handleErrors);

export default app;

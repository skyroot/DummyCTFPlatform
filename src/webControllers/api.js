import glob from 'glob';
import libRequestChecker from 'libs/requestChecker';
import Router from 'express-promise-router';

export default (DI, parentRouter, app) => {

  const router = Router();
  parentRouter.use(
    '/api',
    libRequestChecker.enforceRole(['ADMIN']),
    router
  );

  const controllers = glob.sync(`${__dirname}/api/*.js`);
  controllers.forEach(controller => require(controller).default(DI, router, app));

};


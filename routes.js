
'use strict';
module.exports = function(db, auth) {
  var router = require('express').Router(),
    passport = require('passport'),
    requireAuth = passport.authenticate('jwt', { session: false }),
    ctrl = require('./controller');  
    var importRecordsCtrl = new ctrl(db);

  router.route('/status')
    .get(importRecordsCtrl.status);//requireAuth, auth.roleAuthorization('Admin')

  return router;
};
